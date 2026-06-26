import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { CATALOG, getByKey } from "@/lib/catalog";
import {
  AGGREGATIONS,
  SERIES_ROLES,
  V2_CHART_TYPES,
  type Aggregation,
  type ChartSpec,
  type ChartType,
  type QuerySpec,
  type Series,
  type SeriesRole,
} from "@/lib/query-spec";

/**
 * Claude (Anthropic SDK) → structured QuerySpec via forced tool use (server-only).
 *
 * The model gets ONE tool `emit_query_spec` whose input_schema is the v2 subset of
 * QuerySpec (chart ∈ {line,bars,windrose}, source.kind = 'metric'). tool_choice
 * forces the call → guaranteed valid JSON. The result is then validated against the
 * catalog/enums server-side — entityId is never taken from the model. See §6.
 */

/** Model for tool-use (spec-02 §6: fast, cheap, strong tool-use). */
const MODEL = "claude-sonnet-4-6";

/** Raised on unmappable / invalid model output → route maps to HTTP 422. */
export class UnmappableQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnmappableQueryError";
  }
}

/** Read + validate the Anthropic key. Throws (→ 503) if absent. */
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY configuration");
  }
  return new Anthropic({ apiKey });
}

// ── Tool schema (the v2 QuerySpec subset) ──────────────────────────────────

const METRIC_KEYS = CATALOG.map((e) => e.key);

const TOOL_NAME = "emit_query_spec";

const QUERY_SPEC_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    "Emit the structured query derived from the user's free-text weather question. " +
    "Return one or more independent charts; each chart has one or more series bound to a catalog metric.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      unmappable: {
        type: "boolean",
        description:
          "Set true (and return an empty charts array) when the input cannot be mapped to any catalog metric — gibberish, off-topic, or no matching weather quantity.",
      },
      charts: {
        type: "array",
        minItems: 0,
        description:
          "One or more independent charts (each becomes a card). Empty when unmappable is true.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: {
              type: "string",
              description:
                "Short, descriptive German title for the chart card header.",
            },
            chart: {
              type: "string",
              enum: [...V2_CHART_TYPES],
              description:
                "Chart type. 'windrose' requires a direction + magnitude series pair.",
            },
            timeRange: {
              type: "object",
              additionalProperties: false,
              properties: {
                start: {
                  type: "string",
                  description:
                    "Relative Flux duration like '-7d', '-28d', '-1d', or an absolute ISO time.",
                },
                stop: {
                  type: "string",
                  description: "Usually 'now'. Optional.",
                },
              },
              required: ["start"],
            },
            series: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: {
                    type: "string",
                    description: "Short German label for the series.",
                  },
                  role: {
                    type: "string",
                    enum: [...SERIES_ROLES],
                    description:
                      "'value' for normal series; for a windrose use 'direction' + 'magnitude'.",
                  },
                  metric: {
                    type: "string",
                    enum: METRIC_KEYS,
                    description: "Catalog metric key (must be one of the enum).",
                  },
                  aggregation: {
                    type: "string",
                    enum: [...AGGREGATIONS],
                    description:
                      "Use the metric's natural aggregation (mean for gauges, sum for rainfall, max for daily maxima).",
                  },
                  window: {
                    type: "string",
                    description:
                      "Aggregation window like '1h' or '1d'. Optional; a sensible default is used if omitted.",
                  },
                },
                required: ["label", "metric", "aggregation"],
              },
            },
          },
          required: ["title", "chart", "timeRange", "series"],
        },
      },
    },
    required: ["charts"],
  },
};

// ── System prompt (catalog + chart-selection rules) ─────────────────────────

function buildSystemPrompt(): string {
  const lines = CATALOG.map(
    (e) =>
      `- ${e.key} | ${e.labelDe} | ${e.unit} | def: ${e.defaultAggregation}/${e.defaultWindow} ${e.defaultChart}${e.rainCounter ? " | ⚑ accumulator" : ""} | synonyms: ${e.synonyms.join(", ")}`,
  ).join("\n");

  return `Du bist ein Assistent, der natürlichsprachige Wetter-Anfragen in eine strukturierte Abfrage übersetzt.
Du MUSST das Tool "${TOOL_NAME}" aufrufen und ausschließlich Metriken aus dem folgenden Katalog verwenden.

KATALOG (key | Label | Einheit | Default-Aggregation/Fenster Default-Diagramm | Synonyme):
${lines}

DIAGRAMMWAHL-REGELN:
- Standardmäßig den Default-Diagrammtyp der Metrik nehmen.
- "Verlauf" / "über die Zeit" → line; "Summe" / "pro Tag" / "wie viel" → bars; "Windrichtung" / "Windrose" → windrose.
- Gleiche Einheit + Vergleich gewünscht (z. B. Innen- vs. Außentemperatur) → EINE Card, mehrere series.
- Unterschiedliche Einheiten / klar getrennte Themen → MEHRERE charts (Cards).
- Windrose: genau zwei series mit role 'direction' (wind_direction) und 'magnitude' (wind_speed).
- ⚑ Akkumulator-Metriken (rainfall, evapotranspiration): aggregation 'sum' verwenden (Backend rechnet korrekt via difference+sum).

ZEITRÄUME: relative Flux-Dauern wie -7d, -28d, -1d, -3d; stop üblicherweise 'now'.
NICHT-ZUORDENBAR: Wenn die Eingabe Kauderwelsch ist, nichts mit Wetter zu tun hat oder zu keiner
Katalog-Metrik passt, setze "unmappable": true und gib ein LEERES "charts"-Array zurück. Erfinde
KEINE Default-Metrik (z. B. nicht einfach Außentemperatur). Im Zweifel lieber unmappable als raten.
Wähle einen prägnanten deutschen Titel und Labels. Antworte NUR über den Tool-Aufruf.`;
}

// ── Validation of the model output against catalog/enums ────────────────────

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function validateAggregation(v: unknown): Aggregation {
  if (typeof v === "string" && (AGGREGATIONS as readonly string[]).includes(v)) {
    return v as Aggregation;
  }
  throw new UnmappableQueryError(`Invalid aggregation: ${String(v)}`);
}

function validateChartType(v: unknown): ChartType {
  if (typeof v === "string" && (V2_CHART_TYPES as readonly string[]).includes(v)) {
    return v as ChartType;
  }
  throw new UnmappableQueryError(`Invalid chart type: ${String(v)}`);
}

function validateRole(v: unknown): SeriesRole | undefined {
  if (v == null) return undefined;
  if (typeof v === "string" && (SERIES_ROLES as readonly string[]).includes(v)) {
    return v as SeriesRole;
  }
  throw new UnmappableQueryError(`Invalid series role: ${String(v)}`);
}

function validateSeries(raw: unknown, chartIdx: number, seriesIdx: number): Series {
  if (typeof raw !== "object" || raw === null) {
    throw new UnmappableQueryError("Series is not an object");
  }
  const r = raw as Record<string, unknown>;

  const metric = asString(r.metric);
  if (!metric || !getByKey(metric)) {
    throw new UnmappableQueryError(`Unknown metric: ${String(r.metric)}`);
  }

  const cat = getByKey(metric)!;
  const label = asString(r.label) ?? cat.labelDe;
  const window = asString(r.window);

  return {
    id: `c${chartIdx}s${seriesIdx}`,
    label,
    role: validateRole(r.role),
    source: {
      kind: "metric",
      metric,
      aggregation: validateAggregation(r.aggregation),
      ...(window ? { window } : {}),
    },
  };
}

function validateChart(raw: unknown, idx: number): ChartSpec {
  if (typeof raw !== "object" || raw === null) {
    throw new UnmappableQueryError("Chart is not an object");
  }
  const r = raw as Record<string, unknown>;

  const tr =
    typeof r.timeRange === "object" && r.timeRange !== null
      ? (r.timeRange as Record<string, unknown>)
      : {};
  const start = asString(tr.start) ?? "-7d";
  const stop = asString(tr.stop);

  const seriesRaw = Array.isArray(r.series) ? r.series : [];
  if (seriesRaw.length === 0) {
    throw new UnmappableQueryError("Chart has no series");
  }
  const series = seriesRaw.map((s, si) => validateSeries(s, idx, si));

  return {
    id: `c${idx}`,
    title: asString(r.title) ?? "Diagramm",
    chart: validateChartType(r.chart),
    timeRange: { start, ...(stop ? { stop } : {}) },
    series,
  };
}

function validateQuerySpec(input: unknown, query: string): QuerySpec {
  if (typeof input !== "object" || input === null) {
    throw new UnmappableQueryError("Tool output is not an object");
  }
  const r = input as Record<string, unknown>;
  // Claude signalled it couldn't map the input, or returned no charts.
  if (r.unmappable === true) {
    throw new UnmappableQueryError("Model flagged the input as unmappable");
  }
  const chartsRaw = Array.isArray(r.charts) ? r.charts : [];
  if (chartsRaw.length === 0) {
    throw new UnmappableQueryError("No charts in tool output");
  }
  const charts = chartsRaw.map((c, i) => validateChart(c, i));
  return { version: 1, query, charts };
}

// ── Public entry point ──────────────────────────────────────────────────────

/**
 * Turn free text into a validated QuerySpec via Claude tool-use.
 * Throws UnmappableQueryError (→ 422) when the model can't produce a valid,
 * catalog-mappable spec; throws other errors (missing key / transport) → 5xx.
 */
export async function deriveQuerySpec(query: string): Promise<QuerySpec> {
  const client = getClient();

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: buildSystemPrompt(),
    tools: [QUERY_SPEC_TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: query }],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === TOOL_NAME,
  );

  if (!toolUse) {
    throw new UnmappableQueryError(
      "Claude did not return a structured query for this input.",
    );
  }

  return validateQuerySpec(toolUse.input, query);
}
