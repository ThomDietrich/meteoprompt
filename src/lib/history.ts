/**
 * spec-16 — history-depth guard.
 *
 * Several catalog series start years after the station archive (CatalogEntry.historyFrom).
 * A chart over a longer range would otherwise silently show only the recent stretch — the
 * original "5 months shows 1 month" bug. Before any Flux runs, this module swaps such a
 * metric for its long-history equivalent (CatalogEntry.historyFallback) and builds a notice
 * for the card; without a usable equivalent it only builds the notice.
 *
 * A swap applies to EVERY use of the metric in the spec (all series and the answer), so a
 * comparison chart never mixes two readings. It is skipped entirely when an answer on the
 * metric would change meaning on the equivalent (see answerKeepsMeaning), for chart types
 * that don't read the series aggregation (see SWAP_SAFE_CHARTS), and unless EVERY metric
 * series of the chart ends up on a daily equivalent (so the grain stays uniform).
 *
 * Pure (no server-only dependency) so it is unit-tested. Derived sources are left alone:
 * degree-days read the full-history outdoor temperature, and the water balance is an
 * internal transform used only by a fixed 90-day dashboard card that lies within history.
 */

import { getByKey, type CatalogEntry } from "@/lib/catalog";
import { durationMs } from "@/lib/flux-helpers";
import type {
  Aggregation,
  Answer,
  ChartSpec,
  ChartType,
  Series,
  TimeRange,
} from "@/lib/query-spec";

/**
 * Chart types that read each series on its own with its aggregation/window (standardPoints →
 * buildSeriesFlux, the comparison overlay, or the extreme envelope, which stays daily for
 * daily-grain series). The equivalents are calendar-day extremes with a running live part, so
 * only such a reading is correct. Notice only for the rest: candlestick, rangeBand, barRange,
 * the heatmaps and boxplot/violin read min/mean/first/last directly (flux.ts shapeChart);
 * scatter and themeRiver line up several series by timestamp, which a swapped 1d window would
 * no longer match; windrose pairs a direction with a magnitude series.
 */
const SWAP_SAFE_CHARTS: ReadonlySet<ChartType> = new Set<ChartType>([
  "line",
  "bars",
  "table",
  "radar",
  "gauge",
]);

const berlinDayFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" });

/** Calendar day (YYYY-MM-DD) of an instant in Europe/Berlin. */
export function berlinDay(ms: number): string {
  return berlinDayFmt.format(new Date(ms));
}

/**
 * Start instant (ms) of a range; relative tokens resolve against `nowMs`. Month and year
 * tokens use calendar arithmetic like Flux ("-3mo" is three calendar months, not 90 days) and
 * clamp to the target month's last day (31 May − 3mo → 28 Feb), as verified with Flux date.sub.
 * Null if unparseable.
 */
export function rangeStartMs(timeRange: TimeRange, nowMs: number): number | null {
  const start = timeRange.start.trim();
  if (start === "now" || start === "now()") return nowMs;
  const calendar = /^-(\d+)(mo|y)$/.exec(start);
  if (calendar) {
    const d = new Date(nowMs);
    const months = Number(calendar[1]) * (calendar[2] === "y" ? 12 : 1);
    const total = d.getUTCFullYear() * 12 + d.getUTCMonth() - months;
    const year = Math.floor(total / 12);
    const month = total - year * 12;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return Date.UTC(
      year,
      month,
      Math.min(d.getUTCDate(), lastDay),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    );
  }
  if (/^-\d/.test(start)) {
    const d = durationMs(start);
    return d == null ? null : nowMs - d;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(start)) {
    const t = Date.parse(start);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** True when the range starts on a Berlin calendar day before the series' first day with data. */
export function startsBeforeHistory(
  cat: CatalogEntry,
  timeRange: TimeRange,
  nowMs: number,
): boolean {
  if (!cat.historyFrom) return false;
  const start = rangeStartMs(timeRange, nowMs);
  return start != null && berlinDay(start) < cat.historyFrom;
}

/** "2026-07-05" → "05.07.2026" */
function deDate(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Whether an answer computed on the equivalent keeps its meaning. The equivalents are
 * calendar-day extremes whose live part is a running value (it restarts low after
 * midnight), so only the matching extreme reads correctly — max on a daily maximum, min on
 * a daily minimum — and counts only per day.
 */
export function answerKeepsMeaning(answer: Answer, aggregation: Aggregation): boolean {
  switch (answer.kind) {
    case "extreme":
      return answer.mode === aggregation;
    case "scalar":
      return answer.agg === aggregation;
    case "count":
      return (
        answer.per === "day" &&
        (answer.op === ">" || answer.op === ">=" ? "max" : "min") === aggregation
      );
  }
}

export interface HistoryPlan {
  /** The spec to resolve: metrics swapped where a long-history equivalent exists. */
  spec: ChartSpec;
  /** German notice for the card, or undefined when every use covers its range. */
  notice?: string;
}

/**
 * Plan the history handling for a spec. Returns the ORIGINAL spec object when nothing is
 * swapped, so callers can keep persisting/returning the requested spec as-is.
 */
export function planHistory(spec: ChartSpec, nowMs: number = Date.now()): HistoryPlan {
  const notes: string[] = [];
  const noted = new Set<string>();
  const note = (key: string, text: string) => {
    if (noted.has(key)) return;
    noted.add(key);
    notes.push(text);
  };
  const gap = (cat: CatalogEntry) =>
    note(cat.key, `„${cat.labelDe}“ liegt erst ab ${deDate(cat.historyFrom!)} vor — davor bleibt der Zeitraum leer.`);

  // Every metric use with the range it is queried over.
  const uses: { metric: string; range: TimeRange }[] = spec.series.flatMap((s) =>
    s.source.kind === "metric"
      ? [{ metric: s.source.metric, range: s.timeRange ?? spec.timeRange }]
      : [],
  );
  if (spec.answer) uses.push({ metric: spec.answer.metric, range: spec.timeRange });

  const swapSafeChart = SWAP_SAFE_CHARTS.has(spec.chart);

  // Pass 1: which metrics don't cover one of their ranges, and which of those have a usable
  // equivalent at all?
  const late: CatalogEntry[] = [];
  const candidates = new Map<string, CatalogEntry>(); // late metric key → equivalent entry
  for (const key of new Set(uses.map((u) => u.metric))) {
    const cat = getByKey(key);
    if (!cat) continue;
    const ranges = uses.filter((u) => u.metric === key).map((u) => u.range);
    if (!ranges.some((r) => startsBeforeHistory(cat, r, nowMs))) continue;
    late.push(cat);

    const how = cat.historyFallback;
    const fb = how ? getByKey(how.metric) : undefined;
    const answer = spec.answer?.metric === key ? spec.answer : undefined;
    if (how && fb && swapSafeChart && (!answer || answerKeepsMeaning(answer, how.aggregation))) {
      candidates.set(key, fb);
    }
  }
  if (late.length === 0) return { spec };

  // Pass 2: swap only when EVERY metric series ends up on a daily equivalent — "Tageshoch und
  // -tief der letzten 5 Monate" swaps both series, while a chart keeping one series at its
  // finer window would pair a daily value with those rows (table/bars join by timestamp) and
  // gets the notice instead. Every equivalent is daily (pinned in test/history.test.ts);
  // a finer one would have to compare windows here as well.
  const uniform =
    candidates.size > 0 &&
    spec.series.every((s) => s.source.kind !== "metric" || candidates.has(s.source.metric));
  const swaps = uniform ? candidates : new Map<string, CatalogEntry>();

  for (const cat of late) {
    const fb = swaps.get(cat.key);
    if (!fb) {
      gap(cat);
      continue;
    }
    note(cat.key, `„${cat.labelDe}“ gibt es erst ab ${deDate(cat.historyFrom!)} — für den gewählten Zeitraum wird „${fb.labelDe}“ gezeigt.`);
    // The equivalent may itself start after one of the ranges.
    const ranges = uses.filter((u) => u.metric === cat.key).map((u) => u.range);
    if (ranges.some((r) => startsBeforeHistory(fb, r, nowMs))) gap(fb);
  }

  const notice = notes.length ? { notice: notes.join(" ") } : {};
  if (swaps.size === 0) return { spec, ...notice };

  const series = spec.series.map((s): Series => {
    if (s.source.kind !== "metric") return s;
    const fb = swaps.get(s.source.metric);
    if (!fb) return s;
    const how = getByKey(s.source.metric)!.historyFallback!;
    return {
      ...s,
      source: { ...s.source, metric: fb.key, aggregation: how.aggregation, window: how.window },
    };
  });
  const answerFb = spec.answer ? swaps.get(spec.answer.metric) : undefined;
  const answer = spec.answer && answerFb ? { ...spec.answer, metric: answerFb.key } : spec.answer;
  return { spec: { ...spec, series, ...(answer ? { answer } : {}) }, ...notice };
}
