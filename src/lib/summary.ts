import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import type {
  ChartSpec,
  ResolvedAnswer,
  ResolvedSeries,
  ShapedData,
} from "@/lib/query-spec";

/**
 * spec-06 A) — the data-grounded card narrative (server-only).
 *
 * Two stages, both server-side so nothing can be invented:
 *   1) `computeSummaryStats` derives hard numbers from the ALREADY-RESOLVED
 *      series (min/max/mean/sum + their timestamps, first/last, trend, point
 *      count, time range, unit) — purely arithmetic, no model.
 *   2) `generateSummary` feeds those stats + the origin question + chart meta to
 *      Claude as JSON (NOT an image) and asks for 1–3 plain-German sentences.
 *
 * The model receives only the computed numbers, so every figure it can cite is
 * already true of the data; the prompt forbids inventing values, forecasting,
 * or advising. Called ONLY for NL cards (those with an originQuery) in /api/ask
 * and /api/chart — never for the permanent dashboard (cost/latency).
 */

/** Model for the narrative — same family as /api/ask (quality, spec decision 1). */
const MODEL = "claude-sonnet-4-6";

/** Hard cap so a runaway response can't blow past the ≤100-word target. */
const MAX_TOKENS = 220;

// ── 1) Stats (computed server-side from the resolved data) ──────────────────

/** One (timestamp, value) extreme — the value and WHEN it occurred. */
interface ExtremeAt {
  value: number;
  t: string | null;
}

/** The numeric summary handed to Claude. All figures are derived, never guessed. */
export interface SummaryStats {
  unit: string;
  /** Total number of data points across all numeric values considered. */
  n: number;
  min: ExtremeAt | null;
  max: ExtremeAt | null;
  mean: number | null;
  /** Sum — meaningful for accumulator metrics (rain/ET); still provided otherwise. */
  sum: number | null;
  first: ExtremeAt | null;
  last: ExtremeAt | null;
  /** Coarse trend from first→last value. */
  trend: "steigend" | "fallend" | "gleichbleibend" | null;
  /** ISO range actually covered by the data (not the requested range). */
  range: { from: string | null; to: string | null };
  /** Per-series breakdown when there is more than one series (e.g. comparison). */
  series: SeriesStats[];
}

/** Per-series stats so a multi-series (comparison) chart can be described. */
export interface SeriesStats {
  label: string;
  unit: string;
  n: number;
  min: ExtremeAt | null;
  max: ExtremeAt | null;
  mean: number | null;
  sum: number | null;
  first: ExtremeAt | null;
  last: ExtremeAt | null;
}

/** Round to one decimal (matches the AnswerBanner / chart label precision). */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Pull (t, value) pairs out of ONE resolved series, whatever its chart shape.
 * Time-series types carry `points`; the shaped types stash their numbers in
 * `shaped` — so flatten each into comparable (value, optional-time) records.
 */
function seriesValues(s: ResolvedSeries): { v: number; t: string | null }[] {
  if (s.points.length > 0) {
    return s.points.map((p) => ({ v: p.v, t: p.t }));
  }
  const shaped = s.shaped;
  if (!shaped) return [];
  return shapedValues(shaped);
}

/** Flatten a shaped payload into (value, optional-time) records for stats. */
function shapedValues(shaped: ShapedData): { v: number; t: string | null }[] {
  switch (shaped.shape) {
    case "ohlc":
      // Use highs and lows so the spread is reflected in min/max.
      return shaped.ohlc.flatMap((p) => [
        { v: p.high, t: p.t },
        { v: p.low, t: p.t },
      ]);
    case "band":
      return shaped.band.flatMap((p) => [
        { v: p.high, t: p.t },
        { v: p.low, t: p.t },
      ]);
    case "xy":
      // Scatter: the y value is the dependent metric; describe its distribution.
      return shaped.pairs.map((p) => ({ v: p.y, t: p.t ?? null }));
    case "calendar":
      return shaped.calendar.map((p) => ({ v: p.value, t: p.date }));
    case "matrix":
      return shaped.matrix.map((p) => ({ v: p.value, t: null }));
    case "scalar":
      return shaped.scalar == null ? [] : [{ v: shaped.scalar, t: null }];
    case "distribution":
      return shaped.groups.flatMap((g) =>
        g.values.map((v) => ({ v, t: null })),
      );
    case "showers":
      // spec-07: one value per event = its total rainfall, timed at the event
      // start → min/max/sum describe the strongest/weakest/total of the showers.
      return shaped.showers.map((ev) => ({ v: ev.totalMm, t: ev.start }));
    default:
      return [];
  }
}

/** Stats over a flat (value, time) list. Returns nulls for an empty list. */
function statsOf(
  values: { v: number; t: string | null }[],
  unit: string,
  label: string,
): SeriesStats {
  if (values.length === 0) {
    return {
      label,
      unit,
      n: 0,
      min: null,
      max: null,
      mean: null,
      sum: null,
      first: null,
      last: null,
    };
  }

  let min = values[0];
  let max = values[0];
  let sum = 0;
  for (const cur of values) {
    if (cur.v < min.v) min = cur;
    if (cur.v > max.v) max = cur;
    sum += cur.v;
  }
  const first = values[0];
  const last = values[values.length - 1];

  return {
    label,
    unit,
    n: values.length,
    min: { value: round1(min.v), t: min.t },
    max: { value: round1(max.v), t: max.t },
    mean: round1(sum / values.length),
    sum: round1(sum),
    first: { value: round1(first.v), t: first.t },
    last: { value: round1(last.v), t: last.t },
  };
}

/**
 * Derive the numeric summary from the resolved series. Multi-series charts get a
 * per-series breakdown plus an overall roll-up; single-series charts collapse to
 * the one series' stats. Pure arithmetic — the source of truth for the prose.
 */
export function computeSummaryStats(series: ResolvedSeries[]): SummaryStats {
  const perSeries = series.map((s) =>
    statsOf(seriesValues(s), s.unit, s.label),
  );
  const unit = series[0]?.unit ?? "";

  // Overall roll-up across every numeric value (used for the single-series case
  // and as the headline figures for the prompt).
  const all = series.flatMap((s) =>
    seriesValues(s).map((r) => ({ v: r.v, t: r.t })),
  );
  const overall = statsOf(all, unit, "gesamt");

  // Trend from the first to the last value of the FIRST series (the primary
  // line). A flat ±2% band counts as gleichbleibend so noise isn't over-read.
  let trend: SummaryStats["trend"] = null;
  const primary = perSeries[0];
  if (primary && primary.first && primary.last) {
    const delta = primary.last.value - primary.first.value;
    const scale = Math.max(Math.abs(primary.first.value), 1);
    if (Math.abs(delta) / scale < 0.02) trend = "gleichbleibend";
    else trend = delta > 0 ? "steigend" : "fallend";
  }

  // The data's actual covered range (from the first/last timestamped value).
  const timed = all.filter((r) => r.t != null) as { v: number; t: string }[];
  const sortedTimes = timed.map((r) => r.t).sort();
  const range = {
    from: sortedTimes[0] ?? null,
    to: sortedTimes[sortedTimes.length - 1] ?? null,
  };

  return {
    unit,
    n: overall.n,
    min: overall.min,
    max: overall.max,
    mean: overall.mean,
    sum: overall.sum,
    first: primary?.first ?? overall.first,
    last: primary?.last ?? overall.last,
    trend,
    range,
    // Only include the per-series breakdown when it adds information (>1 series).
    series: perSeries.length > 1 ? perSeries : [],
  };
}

// ── 2) Claude call (stats → prose) ──────────────────────────────────────────

const SYSTEM_PROMPT = `Du erläuterst eine Wetter-Darstellung (Diagramm ODER Tabelle, die dem Nutzer bereits angezeigt wird) in 1–2 kurzen Sätzen (max. 100 Wörter), auf Deutsch, sachlich und allgemeinverständlich (kein Fachjargon) — für Nutzer, die Diagramme/Tabellen nicht gut lesen. Die Darstellung ist vorhanden; sage NICHT, dass du etwas nicht anzeigen kannst.
(a) Liegt eine Nutzerfrage vor, beantworte sie zuerst direkt.
(b) Beschreibe knapp Verlauf/Muster und hebe das Bemerkenswerteste hervor (Extrem/Ausreißer/Trend) mit konkreten Werten und Datum im DE-Format (Komma als Dezimaltrennzeichen, Einheit, z. B. „22 mm am 13.10.2020").
(c) Du darfst einordnen (z. B. „ungewöhnlich hoch"), aber NUR gestützt auf die bereitgestellten Daten/den Zeitraum — erfinde nichts, keine Vorhersage, keine Ratschläge.
(d) Wenn nichts Bemerkenswertes vorliegt, sage das schlicht.
Verwende ausschließlich die im JSON bereitgestellten Zahlen und Daten — erfinde KEINE Werte. Gib nur den Fließtext aus — keine Aufzählung, keine Überschrift, keine Anrede.`;

/** Round-tripping a date to a German-readable hint helps Claude format dates. */
function deDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Add a German date hint next to each ISO timestamp for an extreme. */
function withDeDate(e: ExtremeAt | null): (ExtremeAt & { datum?: string }) | null {
  if (!e) return null;
  const datum = deDate(e.t);
  return datum ? { ...e, datum } : e;
}

/** Shape the answer (if any) into a compact JSON object for the prompt. */
function answerForPrompt(answer?: ResolvedAnswer) {
  if (!answer) return undefined;
  return {
    art: answer.kind,
    label: answer.label,
    wert: answer.kind === "count" ? (answer.count ?? answer.value) : answer.value,
    einheit: answer.unit,
    ...(answer.t ? { zeitpunkt: deDate(answer.t) } : {}),
  };
}

/** Build the user-payload JSON Claude reasons over (German keys, per the spec). */
function buildPayload(
  spec: ChartSpec,
  stats: SummaryStats,
  originQuery: string,
  answer?: ResolvedAnswer,
): string {
  const payload = {
    frage: originQuery,
    chartTitel: spec.title,
    chartTyp: spec.chart,
    einheit: stats.unit,
    zeitraum: {
      von: deDate(stats.range.from),
      bis: deDate(stats.range.to),
    },
    kennzahlen: {
      min: withDeDate(stats.min),
      max: withDeDate(stats.max),
      mittel: stats.mean,
      summe: stats.sum,
      start: stats.first?.value ?? null,
      ende: stats.last?.value ?? null,
      trend: stats.trend,
      n: stats.n,
    },
    ...(stats.series.length > 0
      ? {
          serien: stats.series.map((s) => ({
            label: s.label,
            min: withDeDate(s.min),
            max: withDeDate(s.max),
            mittel: s.mean,
            summe: s.sum,
          })),
        }
      : {}),
    ...(answer ? { answer: answerForPrompt(answer) } : {}),
  };
  return JSON.stringify(payload);
}

/**
 * Generate the 1–3-sentence German narrative for an NL card. Returns `undefined`
 * (never throws) when there is nothing to summarise or the call fails — the card
 * renders fine without a summary, so a model/transport hiccup must not break the
 * data response. Whitespace-collapsed to a single clean paragraph.
 */
export async function generateSummary(
  spec: ChartSpec,
  series: ResolvedSeries[],
  originQuery: string,
  answer?: ResolvedAnswer,
): Promise<string | undefined> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return undefined; // no key → silently skip (data still renders)

  const stats = computeSummaryStats(series);
  // Nothing measured and no computed answer → nothing to say.
  if (stats.n === 0 && !answer) return undefined;

  const userPayload = buildPayload(spec, stats, originQuery, answer);

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPayload }],
    });
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > 0 ? text : undefined;
  } catch (error) {
    // Summary is best-effort — log and fall back to no summary.
    console.error(
      "[summary] generation failed:",
      error instanceof Error ? error.message : error,
    );
    return undefined;
  }
}
