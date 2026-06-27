import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { CATALOG, getByKey } from "@/lib/catalog";
import { CHART_CATALOG } from "@/lib/chart-catalog";
import {
  AGGREGATIONS,
  ANSWER_KINDS,
  COUNT_OPS,
  IMPLEMENTED_CHART_TYPES,
  SERIES_ROLES,
  TRANSFORM_NAMES,
  type Aggregation,
  type Answer,
  type Binning,
  type ChartSpec,
  type ChartType,
  type QuerySpec,
  type Series,
  type SeriesRole,
  type Source,
  type TimeRange,
  type TransformName,
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
        enum: ["ok", "out_of_scope", "unmappable"],
        description:
          "Classify the request. 'ok' = answerable from our station history (fill charts; record/aggregate/count/comparison/degree-day questions are now ANSWERABLE via answer/derived/per-series-timeRange — emit those, do NOT reject). " +
          "'out_of_scope' = forecast, radar, warnings, or any data NOT in our own station history (we only have past measurements) — return empty charts. " +
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
              enum: [...IMPLEMENTED_CHART_TYPES],
              description:
                "Chart type — pick a well-FITTING one weighted-randomly (see the chart catalog + rules in the system prompt). Don't always default to line.",
            },
            binning: {
              type: "string",
              enum: ["calendar", "hourOfDay×weekday"],
              description:
                "Only for heatmap types: 'calendar' for heatmapCalendar, 'hourOfDay×weekday' for heatmapHourDay.",
            },
            answer: {
              type: "object",
              additionalProperties: false,
              description:
                "A prominent COMPUTED result shown alongside the context chart. Use for record/extreme, scalar aggregate, and count questions. The context chart still renders (usually 'line' over the same range).",
              properties: {
                kind: {
                  type: "string",
                  enum: ["extreme", "scalar", "count"],
                  description:
                    "'extreme' = record min/max + WHEN it occurred (wann/wärmste/kälteste/Rekord). 'scalar' = one aggregate number (Durchschnitt/insgesamt/Summe/Maximum). 'count' = number of days/hours meeting a threshold (wie viele Tage über/unter …).",
                },
                mode: {
                  type: "string",
                  enum: ["min", "max"],
                  description: "extreme only: 'min' for coldest/lowest, 'max' for hottest/highest.",
                },
                agg: {
                  type: "string",
                  enum: ["mean", "sum", "min", "max"],
                  description: "scalar only: which aggregate.",
                },
                metric: {
                  type: "string",
                  enum: METRIC_KEYS,
                  description: "Catalog metric the answer is computed over.",
                },
                op: {
                  type: "string",
                  enum: [">", ">=", "<", "<="],
                  description: "count only: comparison operator vs. threshold.",
                },
                threshold: {
                  type: "number",
                  description: "count only: the threshold value (e.g. 30 for >30 °C, 0 for frost <0).",
                },
                per: {
                  type: "string",
                  enum: ["day", "hour"],
                  description: "count only: count days or hours. Usually 'day'.",
                },
              },
              required: ["kind", "metric"],
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
                      "'value' for normal series; windrose → 'direction' + 'magnitude'; scatter → 'x' + 'y'.",
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
                  transform: {
                    type: "string",
                    enum: [...TRANSFORM_NAMES],
                    description:
                      "DERIVED degree-day series: 'gdd' (Wachstumsgradtage), 'hdd' (Heizgradtage), 'cdd' (Kühlgradtage). Use the metric 'outdoor_temperature' as input; set base if the user gives one (GDD base 10, HDD/CDD base 18 by default).",
                  },
                  base: {
                    type: "number",
                    description: "Derived only: base temperature in °C (e.g. 10 for GDD, 18 for HDD).",
                  },
                  timeRange: {
                    type: "object",
                    additionalProperties: false,
                    description:
                      "Per-series time range OVERRIDE — use for year/period COMPARISON overlay: two series of the SAME metric, each with its own timeRange (e.g. Juni 2025 vs Juni 2024). Chart type 'line'.",
                    properties: {
                      start: { type: "string" },
                      stop: { type: "string" },
                    },
                    required: ["start"],
                  },
                },
                required: ["label", "metric"],
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

function buildSystemPrompt(currentChart?: string): string {
  const lines = CATALOG.map(
    (e) =>
      `- ${e.key} | ${e.labelDe} | ${e.unit} | def: ${e.defaultAggregation}/${e.defaultWindow} ${e.defaultChart}${e.rainCounter ? " | ⚑ accumulator" : ""} | synonyms: ${e.synonyms.join(", ")}`,
  ).join("\n");

  const chartLines = CHART_CATALOG.map(
    (c) => `- ${c.chart} [${c.dataShape}]: ${c.fitsFor}`,
  ).join("\n");

  const nudge = currentChart
    ? `\nVARIANZ-HINWEIS: Diese Anfrage wird NEU erzeugt; der aktuelle Typ war "${currentChart}". Wähle bevorzugt einen ANDEREN gut passenden Typ, damit sich die Darstellung sichtbar ändert.\n`
    : "";

  return `Du bist ein Assistent, der natürlichsprachige Wetter-Anfragen in eine strukturierte Abfrage übersetzt.
Du MUSST das Tool "${TOOL_NAME}" aufrufen und ausschließlich Metriken aus dem folgenden Katalog verwenden.

KATALOG (key | Label | Einheit | Default-Aggregation/Fenster Default-Diagramm | Synonyme):
${lines}

DIAGRAMMTYPEN (chart [Datenform-Anforderung]: Eignung):
${chartLines}

SMART-VARIETY (Diagrammwahl):
- Wähle aus den GUT PASSENDEN Diagrammtypen für die Frage GEWICHTET-ZUFÄLLIG einen aus: den am
  besten passenden mit HÖHERER, einen der auch passt mit GERINGERER Wahrscheinlichkeit.
- Wähle NIE einen Typ, dessen Datenform nicht erfüllbar ist:
  scatter braucht GENAU 2 Metriken (role 'x' und 'y'); candlestick/rangeBand/barRange brauchen EINE
  Metrik (Backend bildet min/max je Fenster); gauge braucht EINE Metrik (letzter Wert);
  windrose braucht role 'direction' + 'magnitude'; radar/themeRiver brauchen MEHRERE Metriken.
- Vermeide es, IMMER 'line' zu nehmen, wenn ein anderer Typ ebenso gut passt.
- Beispiele: "Temperaturspanne pro Tag" → candlestick/rangeBand/barRange; "Temperatur vs. Luftfeuchte"
  → scatter (2 Metriken, x/y); "wie warm ist es gerade" → gauge; "Tagesgang/Stunde×Wochentag" →
  heatmapHourDay (binning 'hourOfDay×weekday'); "Jahresüberblick" → heatmapCalendar (binning 'calendar');
  "Verteilung pro Monat" → boxplot/violin.
- heatmapHourDay/heatmapCalendar/boxplot/violin brauchen einen längeren Zeitraum (z. B. -30d/-365d).
- ⚑ Akkumulator-Metriken (rainfall, evapotranspiration): aggregation 'sum' (Backend: difference+sum).
- Gleiche Einheit + Vergleich → EINE Card mit mehreren series; verschiedene Themen → mehrere charts.
${nudge}
ZEITRÄUME: relative Flux-Dauern wie -7d, -28d, -1d, -3d; stop üblicherweise 'now'. Absolute ISO-Zeiten
für konkrete Monate/Jahre (z. B. Juni 2025: start "2025-06-01T00:00:00Z", stop "2025-07-01T00:00:00Z").

INTELLIGENZ — diese Fragen JETZT BEANTWORTEN (reason "ok", NICHT ablehnen):
- REKORD/EXTREM ("wann war es am kältesten/wärmsten", "höchster/niedrigster Wert", "Rekord", "an welchem
  Tag"): chart "line" über den Zeitraum + answer {kind:"extreme", mode:"min"|"max", metric}. Backend füllt
  Wert + genauen Zeitpunkt + setzt einen markPoint.
- SKALAR-AGGREGAT ("Durchschnitt", "insgesamt", "Summe", "Gesamtregen", "höchste/tiefste … als EINE Zahl"):
  chart "line"/"bars" über den Zeitraum + answer {kind:"scalar", agg:"mean"|"sum"|"min"|"max", metric}.
- COUNT/SCHWELLWERT ("wie viele Tage/Stunden … über/unter X", "Frosttage", "Hitzetage", "Regentage"):
  chart "line" (oder heatmapCalendar) + answer {kind:"count", metric, op:">"|">="|"<"|"<=", threshold, per:"day"}.
  Frost → outdoor_temperature < 0; Hitzetage → > 30; Regentage → rainfall > einem mm-Schwellwert.
- VERGLEICH ("vs.", "im Vergleich", "dieses vs. letztes Jahr", "Juni 25 gegen Juni 24"): chart "line" mit
  ZWEI series GLEICHER Metrik, jede mit EIGENEM timeRange (die zwei Perioden). Backend überlagert sie.
- DERIVED Gradtage ("Heizgradtage/HDD", "Wachstumsgradtage/GDD", "Kühlgradtage/CDD"): chart "line", eine
  series mit transform "hdd"|"gdd"|"cdd", metric "outdoor_temperature", ggf. base (GDD 10, HDD/CDD 18 °C).

KLASSIFIZIERUNG (Feld "reason", IMMER setzen):
- "ok": alles aus der eigenen Stationshistorie beantwortbar (inkl. Rekord/Aggregat/Count/Vergleich/Gradtage).
- "out_of_scope": Vorhersage, Radar, Unwetterwarnung oder Fremddaten — wir haben NUR die eigene
  Stationshistorie (vergangene Messwerte). → LEERES "charts"-Array.
- "unmappable": Kauderwelsch, off-topic oder keine passende Katalog-Metrik. → LEERES "charts"-Array.

Bei "out_of_scope"/"unmappable" KEINE Default-Metrik erfinden. Wähle prägnante deutsche Titel + Labels
(für Vergleich: die Perioden als Labels). Antworte NUR über den Tool-Aufruf.`;
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
  if (
    typeof v === "string" &&
    (IMPLEMENTED_CHART_TYPES as readonly string[]).includes(v)
  ) {
    return v as ChartType;
  }
  throw new UnmappableQueryError("unmappable", `Invalid chart type: ${String(v)}`);
}

function validateBinning(v: unknown): Binning | undefined {
  if (v == null) return undefined;
  if (v === "calendar" || v === "hourOfDay×weekday") return v;
  return undefined; // ignore an unrecognised binning rather than fail
}

function validateRole(v: unknown): SeriesRole | undefined {
  if (v == null) return undefined;
  if (typeof v === "string" && (SERIES_ROLES as readonly string[]).includes(v)) {
    return v as SeriesRole;
  }
  throw new UnmappableQueryError("unmappable", `Invalid series role: ${String(v)}`);
}

function validateTimeRange(v: unknown): TimeRange | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const r = v as Record<string, unknown>;
  const start = asString(r.start);
  if (!start) return undefined;
  const stop = asString(r.stop);
  return { start, ...(stop ? { stop } : {}) };
}

function validateTransform(v: unknown): TransformName | undefined {
  if (typeof v === "string" && (TRANSFORM_NAMES as readonly string[]).includes(v)) {
    return v as TransformName;
  }
  return undefined;
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
  const perSeriesTimeRange = validateTimeRange(r.timeRange);
  const transform = validateTransform(r.transform);

  // Derived (degree-day) series: transform + base over an input metric.
  let source: Source;
  if (transform) {
    const base = typeof r.base === "number" ? r.base : undefined;
    source = {
      kind: "derived",
      transform,
      ...(base != null ? { base } : {}),
      inputs: [{ metric, as: "t" }],
    };
  } else {
    // Metric series — aggregation optional (defaults to the catalog default).
    const aggregation =
      r.aggregation == null
        ? cat.defaultAggregation
        : validateAggregation(r.aggregation);
    source = {
      kind: "metric",
      metric,
      aggregation,
      ...(window ? { window } : {}),
    };
  }

  return {
    id: `c${chartIdx}s${seriesIdx}`,
    label,
    role: validateRole(r.role),
    source,
    ...(perSeriesTimeRange ? { timeRange: perSeriesTimeRange } : {}),
  };
}

/** Validate Claude's `answer` against the catalog/enums (spec-05). */
function validateAnswer(v: unknown): Answer | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const r = v as Record<string, unknown>;
  const kind = asString(r.kind);
  if (!kind || !(ANSWER_KINDS as readonly string[]).includes(kind)) return undefined;

  const metric = asString(r.metric);
  if (!metric || !getByKey(metric)) {
    throw new UnmappableQueryError("unmappable", `Answer references unknown metric: ${String(r.metric)}`);
  }

  if (kind === "extreme") {
    const mode = r.mode === "min" || r.mode === "max" ? r.mode : "max";
    return { kind: "extreme", mode, metric };
  }
  if (kind === "scalar") {
    const agg =
      r.agg === "mean" || r.agg === "sum" || r.agg === "min" || r.agg === "max"
        ? r.agg
        : "mean";
    return { kind: "scalar", agg, metric };
  }
  // count
  const op: ">" | ">=" | "<" | "<=" =
    typeof r.op === "string" && (COUNT_OPS as readonly string[]).includes(r.op)
      ? (r.op as ">" | ">=" | "<" | "<=")
      : ">";
  const threshold = typeof r.threshold === "number" ? r.threshold : 0;
  const per: "day" | "hour" = r.per === "hour" ? "hour" : "day";
  return { kind: "count", metric, op, threshold, per };
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
  const binning = validateBinning(r.binning);
  const answer = validateAnswer(r.answer);

  return {
    id: `c${idx}`,
    title: asString(r.title) ?? "Diagramm",
    chart: validateChartType(r.chart),
    timeRange: { start, ...(stop ? { stop } : {}) },
    series,
    ...(binning ? { binning } : {}),
    ...(answer ? { answer } : {}),
  };
}

function validateQuerySpec(input: unknown, query: string): QuerySpec {
  if (typeof input !== "object" || input === null) {
    throw new UnmappableQueryError("unmappable", "Tool output is not an object");
  }
  const r = input as Record<string, unknown>;

  // Claude classified the request. Only genuine out-of-scope / unmappable now
  // yield no chart (a 422). Record/aggregate/count/comparison/derived are
  // answerable and come back as 'ok' with the appropriate answer/derived spec.
  const reason = typeof r.reason === "string" ? r.reason : undefined;
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
 * `currentChart` (regenerate flow) nudges the model toward a DIFFERENT fitting
 * chart type. Throws UnmappableQueryError (→ 422) when the model can't produce a
 * valid, catalog-mappable spec; throws other errors (missing key / transport) → 5xx.
 */
export async function deriveQuerySpec(
  query: string,
  currentChart?: string,
): Promise<QuerySpec> {
  const client = getClient();

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: buildSystemPrompt(currentChart),
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
