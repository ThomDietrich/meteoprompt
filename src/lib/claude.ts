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

/**
 * Why a query couldn't be answered as a chart. The route maps each to a
 * representative German message (spec-03 §7). `unmappable` is the fallback.
 */
export type UnmappableReason =
  | "record" // record/extreme/aggregate ("wann war der kälteste …") — spec-05
  | "out_of_scope" // forecast/radar/external data we don't have
  | "unmappable"; // gibberish / off-topic / no catalog match

/** Raised on unmappable / invalid model output → route maps to HTTP 422. */
export class UnmappableQueryError extends Error {
  reason: UnmappableReason;
  constructor(reason: UnmappableReason, message: string) {
    super(message);
    this.name = "UnmappableQueryError";
    this.reason = reason;
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
      reason: {
        type: "string",
        enum: ["ok", "record", "out_of_scope", "unmappable"],
        description:
          "Classify the request. 'ok' = a normal time-series request (fill charts). " +
          "'record' = a record/extreme/aggregate/scalar question (e.g. WANN war es am kältesten/wärmsten, höchster/niedrigster Wert, an welchem Tag/Zeitpunkt, Durchschnitt/Summe als EINE Zahl) — these are NOT yet supported, so DO NOT force a chart; return empty charts. " +
          "'out_of_scope' = forecast, radar, warnings, or any data NOT in our own station history (we only have past measurements from this station) — return empty charts. " +
          "'unmappable' = gibberish, off-topic, or no matching catalog metric — return empty charts.",
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
    required: ["reason", "charts"],
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

KLASSIFIZIERUNG (Feld "reason", IMMER setzen):
- "ok": normale Zeitreihen-Anfrage (z. B. "Außentemperatur letzte Woche", "Regen heute") → charts füllen.
- "record": Rekord-/Extrem-/Aggregat-/Skalar-Frage — z. B. "WANN war es am kältesten/wärmsten",
  "höchster/niedrigster Wert", "an welchem Tag/Zeitpunkt", "Durchschnitt/Summe als EINE Zahl".
  Solche Fragen sind NOCH NICHT unterstützt → KEIN Diagramm erzwingen, LEERES "charts"-Array.
  Mappe diese NIEMALS auf eine Metrik-Zeitreihe (also NICHT einfach Min-Temperatur als Linie zeichnen).
- "out_of_scope": Vorhersage, Radar, Warnungen oder Fremddaten — wir haben NUR die eigene
  Stationshistorie (vergangene Messwerte). → LEERES "charts"-Array.
- "unmappable": Kauderwelsch, off-topic oder keine passende Katalog-Metrik. → LEERES "charts"-Array.

Bei "record"/"out_of_scope"/"unmappable" KEINE Default-Metrik erfinden. Im Zweifel zwischen "ok"
und "record": wenn nach einem ZEITPUNKT oder EINEM EINZELWERT/Extrem gefragt wird → "record".
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
  throw new UnmappableQueryError("unmappable", `Invalid aggregation: ${String(v)}`);
}

function validateChartType(v: unknown): ChartType {
  if (typeof v === "string" && (V2_CHART_TYPES as readonly string[]).includes(v)) {
    return v as ChartType;
  }
  throw new UnmappableQueryError("unmappable", `Invalid chart type: ${String(v)}`);
}

function validateRole(v: unknown): SeriesRole | undefined {
  if (v == null) return undefined;
  if (typeof v === "string" && (SERIES_ROLES as readonly string[]).includes(v)) {
    return v as SeriesRole;
  }
  throw new UnmappableQueryError("unmappable", `Invalid series role: ${String(v)}`);
}

function validateSeries(raw: unknown, chartIdx: number, seriesIdx: number): Series {
  if (typeof raw !== "object" || raw === null) {
    throw new UnmappableQueryError("unmappable", "Series is not an object");
  }
  const r = raw as Record<string, unknown>;

  const metric = asString(r.metric);
  if (!metric || !getByKey(metric)) {
    throw new UnmappableQueryError("unmappable", `Unknown metric: ${String(r.metric)}`);
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
    throw new UnmappableQueryError("unmappable", "Chart is not an object");
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
    throw new UnmappableQueryError("unmappable", "Chart has no series");
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
    throw new UnmappableQueryError("unmappable", "Tool output is not an object");
  }
  const r = input as Record<string, unknown>;

  // Claude classified the request. Anything but "ok" → no chart, a 422 with the
  // matching message. (Also handles legacy `unmappable:true`.)
  const reason = typeof r.reason === "string" ? r.reason : undefined;
  if (reason === "record") {
    throw new UnmappableQueryError("record", "Record/aggregate query");
  }
  if (reason === "out_of_scope") {
    throw new UnmappableQueryError("out_of_scope", "Out-of-scope query");
  }
  if (reason === "unmappable" || r.unmappable === true) {
    throw new UnmappableQueryError("unmappable", "Unmappable query");
  }

  const chartsRaw = Array.isArray(r.charts) ? r.charts : [];
  if (chartsRaw.length === 0) {
    throw new UnmappableQueryError("unmappable", "No charts in tool output");
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
      "unmappable",
      "Claude did not return a structured query for this input.",
    );
  }

  return validateQuerySpec(toolUse.input, query);
}
