import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { CATALOG, getByKey, type CatalogEntry } from "@/lib/catalog";
import { CHART_CATALOG } from "@/lib/chart-catalog";
import { MODEL } from "@/lib/claude-runtime";
import {
  AGGREGATIONS,
  ANSWER_KINDS,
  COUNT_OPS,
  IMPLEMENTED_CHART_TYPES,
  SERIES_ROLES,
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
 * The model gets ONE tool `emit_query_spec` whose input_schema now exposes the full
 * implemented surface: every IMPLEMENTED_CHART_TYPES chart plus `derived` (degree-day)
 * sources and computed `answer`s. tool_choice forces the call →
 * guaranteed valid JSON. The result is then validated against the catalog/enums
 * server-side — entityId is never taken from the model. See §6.
 */

/**
 * Transforms the MODEL may request. `waterBalance` (spec-12) is deliberately EXCLUDED:
 * it's a two-input transform wired only into the permanent dashboard, and
 * `resolveWaterBalance` ignores `source.inputs` — letting the model pick it for an
 * arbitrary metric would return a mismatched rain−ET series under a wrong title. So the
 * model sees degree-days only; `waterBalance` stays internal.
 */
const MODEL_TRANSFORMS = ["gdd", "hdd", "cdd"] as const;

/**
 * Why a query couldn't be answered as a chart. The route maps each to a
 * representative German message (spec-03 §7). `unmappable` is the fallback.
 */
export type UnmappableReason =
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
                "Chart type — pick a well-FITTING one weighted-randomly (see the chart catalog + rules in the system prompt). Don't always default to line. NEVER pick 'table' via smart-variety: use 'table' ONLY when the user explicitly asks for a table/list/export, or when only a few discrete values are compared.",
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
            mit: {
              type: "number",
              description:
                "ONLY for chart 'showerBars': the Minimum Inter-event Time in HOURS — the dry pause that separates two rain events. Set ONLY if the user names one explicitly (e.g. „mit 6 h Pause“ → 6). Otherwise OMIT (default 4 h).",
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
                      "'value' for normal series; windrose → 'direction' + 'magnitude'; scatter → 'x' + 'y'; range/aggregate series may use 'min' / 'mean' / 'max'.",
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
                    enum: [...MODEL_TRANSFORMS],
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

/** Europe/Berlin — the station's local time; every date the model sees is in it. */
const TZ = "Europe/Berlin";

/** First day with raw station data (spec-16). */
const ARCHIVE_START = "19.10.2021";

/**
 * spec-17 A: the model has no clock. Without today's date it guessed whether a named
 * period was past or future and rejected valid historical ranges — "Windgeschwindigkeit
 * am 31.07.2026" was refused as out_of_scope on 2026-08-16, while the same prompt
 * succeeds once the date is known. State the day and the rule explicitly.
 */
export function todayHint(now: Date): string {
  const today = now.toLocaleDateString("de-DE", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `HEUTE ist ${today} (Ortszeit ${TZ}). Die Stationshistorie reicht von ${ARCHIVE_START} bis heute.
Alles bis einschließlich heute ist VERGANGENHEIT und damit beantwortbar — auch ein Datum von gestern, vom
Monatsende oder aus dem laufenden Monat. NUR ein Zeitraum, der VOLLSTÄNDIG in der ZUKUNFT liegt, ist
"out_of_scope". Relative Angaben („dieser Monat", „dieses Jahr", „letzte Woche") immer gegen HEUTE auflösen.`;
}

/**
 * spec-16: history marker for a catalog line, e.g.
 * " | ⚠ Daten erst ab 2026-07-05 → davor: outdoor_temp_daily_max (max/1d)".
 */
function historyMark(e: CatalogEntry): string {
  if (!e.historyFrom) return "";
  const fb = e.historyFallback;
  return ` | ⚠ Daten erst ab ${e.historyFrom}${fb ? ` → davor: ${fb.metric} (${fb.aggregation}/${fb.window})` : ""}`;
}

function buildSystemPrompt(currentChart?: string): string {
  const lines = CATALOG.map(
    (e) =>
      `- ${e.key} | ${e.labelDe} | ${e.unit} | def: ${e.defaultAggregation}/${e.defaultWindow} ${e.defaultChart}${e.rainCounter ? " | ⚑ accumulator" : ""}${historyMark(e)} | synonyms: ${e.synonyms.join(", ")}`,
  ).join("\n");

  const chartLines = CHART_CATALOG.map(
    (c) => `- ${c.chart} [${c.dataShape}]: ${c.fitsFor}`,
  ).join("\n");

  const nudge = currentChart
    ? `\nVARIANZ-HINWEIS: Diese Anfrage wird NEU erzeugt; der aktuelle Typ war "${currentChart}". Wähle bevorzugt einen ANDEREN gut passenden Typ, damit sich die Darstellung sichtbar ändert.\n`
    : "";

  return `Du bist ein Assistent, der natürlichsprachige Wetter-Anfragen in eine strukturierte Abfrage übersetzt.
Du MUSST das Tool "${TOOL_NAME}" aufrufen und ausschließlich Metriken aus dem folgenden Katalog verwenden.

KATALOG (key | Label | Einheit | Default-Aggregation/Fenster Default-Diagramm | [⚑ Akkumulator] | [⚠ Historie] | Synonyme):
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
- TABELLE (chart "table"): NUR wählen, wenn der Nutzer AUSDRÜCKLICH danach fragt ("als Tabelle",
  "tabellarisch", "liste", "auflisten", "exportieren") ODER nur WENIGE diskrete Werte verglichen
  werden (z. B. "Ø-Temperatur der letzten 3 Tage" → eine Serie, window "1d"; "Monatsmittel je Monat"
  → window "1mo"). Sonst IMMER ein Diagramm bevorzugen — niemals zufällig "table" über Smart-Variety.
  Setze für wenige Werte ein passendes window (z. B. "1d"/"1mo"), damit die Tabelle wenige Zeilen hat.
${nudge}
${todayHint(new Date())}

ZEITRÄUME: relative Flux-Dauern wie -7d, -28d, -1d, -3d; stop üblicherweise 'now'. Absolute ISO-Zeiten
für konkrete Monate/Jahre (z. B. Juni 2025: start "2025-06-01T00:00:00Z", stop "2025-07-01T00:00:00Z").
HISTORIE: Metriken mit „⚠ Daten erst ab <Datum>“ haben davor KEINE Daten. Reicht der Zeitraum vor dieses Datum
zurück, nimm die dort genannte Alternative („→ davor: key (aggregation/window)“), falls vorhanden — aber NUR mit
genau dieser Lesart: Höchstwerte (max) auf dem Tagesmaximum, Tiefstwerte (min) auf dem Tagesminimum, Zählungen nur
je Tag, Diagrammtyp line/bars/table. Sonst die Metrik trotzdem — die Karte weist die Lücke dann aus. Für Zeiträume
ab dem Datum gilt die Metrik normal.

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
- REGEN PRO SCHAUER/EVENT — Trigger-Wörter „pro Schauer / je Schauer / pro Regenfall / pro Regen-Event /
  Regenschauer / shower / rain event": chart "showerBars", EINE series mit metric "rainfall" (aggregation
  "sum"). Das Backend gruppiert die Regen-Inkremente zu zusammenhängenden Events (ein Balken je Schauer,
  Höhe = Gesamtmenge), NICHT pro Tag/Stunde. Default-Zeitraum -90d, sofern der Nutzer keinen anderen nennt.
  Nennt der Nutzer eine Trockenpause („… mit 6 h Pause"), setze "mit" auf die Stundenzahl, sonst weglassen
  (Default 4 h). Eine NORMALE Regen-Frage („wie viel Regen", „Tagesregen") bleibt "bars" auf "rainfall".

KLASSIFIZIERUNG (Feld "reason", IMMER setzen):
- "ok": alles aus der eigenen Stationshistorie beantwortbar (inkl. Rekord/Aggregat/Count/Vergleich/Gradtage).
- "out_of_scope": Vorhersage, Radar, Unwetterwarnung oder Fremddaten — wir haben NUR die eigene
  Stationshistorie (vergangene Messwerte). → LEERES "charts"-Array. Ein Datum oder Zeitraum in der
  VERGANGENHEIT ist NIE out_of_scope, egal wie weit er zurückliegt (siehe HEUTE oben).
- "unmappable": Kauderwelsch, off-topic oder keine passende Katalog-Metrik. → LEERES "charts"-Array.

Bei "out_of_scope"/"unmappable" KEINE Default-Metrik erfinden. Wähle prägnante deutsche Titel + Labels
(für Vergleich: die Perioden als Labels). Antworte NUR über den Tool-Aufruf.`;
}

// ── Validation of the model output against catalog/enums ────────────────────

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** True when `v` is a string present in the readonly `enumVals` whitelist. */
function inEnum(v: unknown, enumVals: readonly string[]): boolean {
  return typeof v === "string" && enumVals.includes(v);
}

function validateAggregation(v: unknown): Aggregation {
  if (inEnum(v, AGGREGATIONS)) {
    return v as Aggregation;
  }
  throw new UnmappableQueryError("unmappable", `Invalid aggregation: ${String(v)}`);
}

function validateChartType(v: unknown): ChartType {
  if (inEnum(v, IMPLEMENTED_CHART_TYPES)) {
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
  if (inEnum(v, SERIES_ROLES)) {
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
  // Only degree-day transforms are model-selectable (waterBalance is internal — see
  // MODEL_TRANSFORMS); reject anything else so the model can't smuggle waterBalance.
  if (inEnum(v, MODEL_TRANSFORMS)) {
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
  // spec-07: explicit Minimum Inter-event Time (hours) for showerBars only.
  const mit =
    typeof r.mit === "number" && Number.isFinite(r.mit) && r.mit > 0
      ? r.mit
      : undefined;

  return {
    id: `c${idx}`,
    title: asString(r.title) ?? "Diagramm",
    chart: validateChartType(r.chart),
    timeRange: { start, ...(stop ? { stop } : {}) },
    series,
    ...(binning ? { binning } : {}),
    ...(answer ? { answer } : {}),
    ...(mit != null ? { mit } : {}),
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
  if (reason === "unmappable") {
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
