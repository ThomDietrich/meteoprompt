import "server-only";

import {
  degreesToCompass,
  getByKey,
  type CatalogEntry,
} from "@/lib/catalog";
import { validateChartDataShape } from "@/lib/chart-catalog";
import {
  influxBucket,
  runFluxEntityRows,
  runFluxPoints,
  runFluxScalar,
} from "@/lib/influx";
import { KENNWERTE, type KennwertValue } from "@/lib/kennwerte";
import { groupShowers, SHOWER_MIT_HOURS } from "@/lib/shower";
import {
  applyTransform,
  defaultBase,
  isTransform,
} from "@/lib/transforms";
import type {
  Answer,
  ChartSpec,
  ChartType,
  ResolvedAnswer,
  ResolvedSeries,
  Series,
  SeriesPoint,
  TimeRange,
} from "@/lib/query-spec";

/** Raised when a chart type can't be satisfied by the requested series shape. */
export class ChartShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChartShapeError";
  }
}

/**
 * ChartSpec → Flux → resolved data series (server-only).
 *
 * Whitelist guarantee: `entityId` comes ONLY from the catalog (never from the
 * LLM). The metric key is validated against the catalog before any Flux is built,
 * so the LLM cannot inject a free entity string or spray across the 30k entities.
 *
 * Accumulator special-case (rainCounter metrics rainfall / evapotranspiration):
 * daily counters are differentiated then summed — never summed raw. See §7 and
 * docs/data-quality-influxdb.md.
 */

/**
 * Timezone preamble prepended to EVERY aggregating Flux query so windows align
 * to Europe/Berlin local boundaries (not UTC). Without it, `aggregateWindow`
 * buckets and `today()` snap to UTC midnight → daily/hourly boundaries appear
 * ~2h off in CEST. With it, a daily bucket's `_time` becomes local midnight
 * (e.g. `…T22:00:00Z` in summer). Must sit right after the import, before `from`.
 */
const TZ_PREAMBLE =
  'import "timezone"\noption location = timezone.location(name: "Europe/Berlin")\n';

/**
 * Terminal sort appended as the FINAL pipe of every TIME-SERIES Flux query (the
 * convention). Flux does not guarantee chronological output — `aggregateWindow`
 * over a long, multi-shard range can return groups out of order (ascending then
 * jumping back to the earliest), which made a connected line/area chart draw a
 * phantom arc from the last point to the first. Sorting by `_time` at the source
 * guarantees chronological order. Scalar/single-row queries (mean/sum/count/last)
 * don't need it — it's a harmless no-op there, so we simply omit it.
 */
const TERMINAL_SORT = '|> sort(columns: ["_time"])';

/**
 * Validate a relative Flux duration (`-7d`, `-28d`, `now`) or an absolute ISO time.
 * Rejects anything else so the LLM can't inject arbitrary Flux into range().
 */
const RELATIVE_DURATION = /^-?\d+(ns|us|µs|ms|s|m|h|d|w|mo|y)$/;

function sanitizeRangeToken(token: string, fallback: string): string {
  const t = token.trim();
  if (t === "now" || t === "now()") return "now()";
  if (RELATIVE_DURATION.test(t)) return t;
  // Absolute ISO timestamp, e.g. 2026-06-01T00:00:00Z
  if (!Number.isNaN(Date.parse(t)) && /^\d{4}-\d{2}-\d{2}/.test(t)) {
    return new Date(t).toISOString();
  }
  return fallback;
}

/** A Flux window duration like `1h`, `1d`, `30m`. Falls back if malformed. */
const WINDOW_DURATION = /^\d+(ns|us|µs|ms|s|m|h|d|w|mo|y)$/;

function sanitizeWindow(window: string | undefined, fallback: string): string {
  if (!window) return fallback;
  const w = window.trim();
  return WINDOW_DURATION.test(w) ? w : fallback;
}

// ── Adaptive downsampling (long-range query timeout fix) ─────────────────────

const MS = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  mo: 2_592_000_000, // ≈30d
  y: 31_536_000_000, // ≈365d
} as const;

/** Duration of a Flux window/relative token (e.g. "1h", "30m", "2d") in ms. */
function durationMs(token: string): number | null {
  const m = /^-?(\d+)(ns|us|µs|ms|s|m|h|d|w|mo|y)$/.exec(token.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] as keyof typeof MS;
  const base = MS[unit];
  return base ? n * base : null;
}

/**
 * Estimate the span (ms) covered by a TimeRange. Handles relative starts like
 * `-730d` (→ now - 730d) and absolute ISO start/stop. Returns null if unknown.
 */
function rangeSpanMs(timeRange: TimeRange): number | null {
  const start = timeRange.start.trim();
  const stop = (timeRange.stop ?? "now").trim();

  // Stop is usually now(); resolve to a timestamp for the math.
  const stopMs =
    stop === "now" || stop === "now()" || stop === ""
      ? Date.now()
      : Number.isNaN(Date.parse(stop))
        ? Date.now()
        : Date.parse(stop);

  // Relative start like "-730d" → span is just that duration (when stop ≈ now).
  if (/^-\d+/.test(start)) {
    const d = durationMs(start);
    if (d != null) return d;
  }
  // Absolute ISO start → stopMs - startMs.
  if (!Number.isNaN(Date.parse(start))) {
    return Math.max(0, stopMs - Date.parse(start));
  }
  return null;
}

/** Candidate aggregate windows, coarsest-first selection happens by scanning up. */
const WINDOW_LADDER = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "3h",
  "6h",
  "12h",
  "1d",
  "2d",
  "7d",
  "30d",
] as const;

/**
 * Coarsen the requested aggregate window so a query over `timeRange` yields at
 * most `maxPoints` buckets — the fix for long-range transfer-heavy queries
 * (e.g. a −730d line at 1h ≈ 17.5k points → 1d ≈ 730). NEVER goes FINER than the
 * requested window, so short ranges keep their fine resolution unchanged.
 */
function adaptiveWindow(
  timeRange: TimeRange,
  requestedWindow: string,
  maxPoints = 800,
): string {
  const span = rangeSpanMs(timeRange);
  const reqMs = durationMs(requestedWindow);
  if (span == null || reqMs == null || reqMs <= 0) return requestedWindow;

  // Already coarse enough at the requested window? Keep it.
  if (span / reqMs <= maxPoints) return requestedWindow;

  // Otherwise climb the ladder to the smallest window that is BOTH ≥ requested
  // and yields ≤ maxPoints buckets.
  for (const w of WINDOW_LADDER) {
    const wMs = durationMs(w);
    if (wMs == null || wMs < reqMs) continue; // never finer than requested
    if (span / wMs <= maxPoints) return w;
  }
  // Range so large even 30d exceeds the cap → use the coarsest ladder step.
  return WINDOW_LADDER[WINDOW_LADDER.length - 1];
}

/** Map a v2 aggregation to its Flux function name. */
function aggregationFn(agg: string): "mean" | "sum" | "min" | "max" {
  switch (agg) {
    case "sum":
      return "sum";
    case "min":
      return "min";
    case "max":
      return "max";
    default:
      return "mean";
  }
}

/**
 * Calendar-month/year buckets read better labelled at their START (the month
 * they represent). `aggregateWindow` defaults to the bucket's `_stop` (the NEXT
 * boundary), so on a time axis a monthly bar drifts to the right and reads as the
 * following month (May's total sitting on the May/June line looks like June).
 * No-op for sub-month windows so daily/hourly charts are unchanged.
 */
function timeSrcClause(window: string): string {
  return /(mo|y)$/.test(window) ? ', timeSrc: "_start"' : "";
}

/** Build the Flux for one metric series against the resolved catalog entry. */
function buildSeriesFlux(
  bucket: string,
  cat: CatalogEntry,
  series: Series,
  timeRange: TimeRange,
): string {
  if (series.source.kind !== "metric") {
    throw new Error(`Unsupported source kind: ${series.source.kind}`);
  }

  const start = sanitizeRangeToken(timeRange.start, "-7d");
  const stop = sanitizeRangeToken(timeRange.stop ?? "now", "now()");

  // TZ preamble first, then the query — windows align to Europe/Berlin.
  const base = `${TZ_PREAMBLE}from(bucket: "${bucket}")
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r["entity_id"] == "${cat.entityId}")
  |> filter(fn: (r) => r["_field"] == "value")`;

  // CONVENTION: every time-series query ends with `sort(columns: ["_time"])` as
  // its final pipe before yield — guarantees chronological order. Unsorted Flux
  // results (aggregateWindow over multi-shard ranges) caused a phantom first↔last
  // connecting line/arc on the chart. See TERMINAL_SORT.
  // Rain accumulator (rainfall): differentiate the daily counter (nonNegative
  // caps the midnight reset) then sum over the window.
  if (cat.rainCounter) {
    const requested = sanitizeWindow(
      series.source.window ?? cat.defaultWindow,
      cat.defaultWindow,
    );
    const window = adaptiveWindow(timeRange, requested);
    // group(entity_id) BEFORE difference: the bucket is sharded (a storage-shard
    // boundary in the range splits one series into several tables), and both
    // difference() AND sum() run PER TABLE — so a window straddling the boundary
    // would emit a duplicate bucket and a long range would sum to several partial
    // totals. Collapsing to one table per entity bridges the shard boundary so the
    // difference is continuous and the monthly/daily sums are correct. (No-op for
    // single-shard ranges.) See docs/data-quality-influxdb.md.
    return `${base}
  |> group(columns: ["entity_id"])
  |> difference(nonNegative: true)
  |> aggregateWindow(every: ${window}, fn: sum, createEmpty: false${timeSrcClause(window)})
  ${TERMINAL_SORT}
  |> yield(name: "${series.id}")`;
  }

  // Dedup-sum (evapotranspiration): WeeWX `ET` is a per-interval delta (summable
  // like rain), but Home Assistant OVER-SAMPLES it — it re-reads every ~16s plus
  // ns-offset duplicate writes, so each archive value lands ~19× and a naive sum
  // is ~19× too high (~90 mm/day). Collapse the over-sampling with a `last` at
  // the station's ARCHIVE INTERVAL (5 min — forensically confirmed; update if the
  // station's interval changes), THEN sum over the requested window. The dayET
  // accumulator (`_dailysensor_mm`) is broken (non-monotonic) so the rain-style
  // max/day method is NOT usable. See docs/data-quality-influxdb.md §ET.
  if (cat.dedupSum) {
    const dedup = sanitizeWindow(cat.dedupWindow ?? "5m", "5m");
    const requested = sanitizeWindow(
      series.source.window ?? cat.defaultWindow,
      cat.defaultWindow,
    );
    const window = adaptiveWindow(timeRange, requested);
    return `${base}
  |> aggregateWindow(every: ${dedup}, fn: last, createEmpty: false)
  |> aggregateWindow(every: ${window}, fn: sum, createEmpty: false${timeSrcClause(window)})
  ${TERMINAL_SORT}
  |> yield(name: "${series.id}")`;
  }

  // Standard metric: optional aggregateWindow. `none` → raw points (short ranges only).
  const agg = series.source.aggregation;
  if (agg === "none") {
    return `${base}
  ${TERMINAL_SORT}
  |> yield(name: "${series.id}")`;
  }

  const requested = sanitizeWindow(
    series.source.window ?? cat.defaultWindow,
    cat.defaultWindow,
  );
  const window = adaptiveWindow(timeRange, requested);
  return `${base}
  |> aggregateWindow(every: ${window}, fn: ${aggregationFn(agg)}, createEmpty: false${timeSrcClause(window)})
  ${TERMINAL_SORT}
  |> yield(name: "${series.id}")`;
}

/**
 * spec-07 — fetch the rain accumulator's WET INCREMENTS at archive resolution
 * for shower sessionization (NO aggregateWindow/sum — the app groups them).
 * `difference(nonNegative:true)` turns the daily accumulator into per-reading
 * increments (and caps the midnight reset + identical HA-oversampled values →
 * diff 0); `filter(_value > 0)` keeps only wet readings; group(entity_id) bridges
 * the storage-shard boundary (see the rainCounter note). TERMINAL_SORT guarantees
 * chronological order for the in-app walk.
 */
function buildRainIncrementsFlux(
  bucket: string,
  cat: CatalogEntry,
  timeRange: TimeRange,
): string {
  const start = sanitizeRangeToken(timeRange.start, "-90d");
  const stop = sanitizeRangeToken(timeRange.stop ?? "now", "now()");
  return `${TZ_PREAMBLE}from(bucket: "${bucket}")
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r["entity_id"] == "${cat.entityId}")
  |> filter(fn: (r) => r["_field"] == "value")
  |> group(columns: ["entity_id"])
  |> difference(nonNegative: true)
  |> filter(fn: (r) => r._value > 0.0)
  ${TERMINAL_SORT}
  |> yield(name: "increments")`;
}

/**
 * Resolve every series of a ChartSpec into data. Each series runs as its own
 * Flux query (simpler + isolates failures than multi-yield parsing). Unknown
 * metric keys throw — callers map that to 4xx/5xx.
 */
export async function resolveChartSeries(
  spec: ChartSpec,
): Promise<ResolvedSeries[]> {
  const bucket = influxBucket();

  // Derived series (degree-days) — resolve each via the transform registry.
  if (spec.series.some((s) => s.source.kind === "derived")) {
    return Promise.all(
      spec.series.map((series) => resolveDerivedSeries(bucket, series, spec)),
    );
  }

  // 1) Validate the chart type is satisfiable by the requested series shape.
  const shapeError = validateChartDataShape(spec.chart, {
    seriesCount: spec.series.length,
    roles: spec.series.map((s) => s.role),
  });
  if (shapeError) throw new ChartShapeError(shapeError);

  // 2) Resolve each metric series → catalog entry (whitelist).
  const resolvedCats = spec.series.map((series) => {
    if (series.source.kind !== "metric") {
      throw new Error(
        `Series "${series.id}" uses unsupported source kind "${series.source.kind}"`,
      );
    }
    const cat = getByKey(series.source.metric);
    if (!cat) {
      throw new Error(
        `Series "${series.id}" references unknown metric "${series.source.metric}"`,
      );
    }
    return { series, cat };
  });

  // 3) Extreme-answer context: instead of a raw mean line, draw a coarse
  // daily-MIN envelope for a "coldest"/min query or daily-MAX for a "hottest"/max
  // query — it actually shows the troughs/peaks the answer marks. A coarse series
  // is always returned (the window widens with the range), never value-only.
  if (
    spec.answer?.kind === "extreme" &&
    spec.chart === "line" &&
    resolvedCats.length === 1
  ) {
    return resolveExtremeContext(bucket, resolvedCats[0], spec, spec.answer.mode);
  }

  // 4) Comparison overlay: a line chart whose series carry their OWN timeRange
  // (e.g. "Juni dieses vs. letztes Jahr"). Resolve each on its own range, then
  // rebase the x-axis to a shared relative axis so the periods overlap.
  if (
    spec.chart === "line" &&
    spec.series.length >= 2 &&
    spec.series.some((s) => s.timeRange)
  ) {
    return resolveComparison(bucket, resolvedCats, spec);
  }

  // 5) Dispatch by chart type to the matching data-shaping resolver.
  return shapeChart(spec, resolvedCats);
}

/**
 * Resolve a chart's series AND its optional computed answer. For an extreme-line
 * spec this runs a SINGLE windowed scan (the envelope) and derives the answer
 * from it — avoiding a second raw min()/max() scan so even multi-year extreme
 * queries stay under the default timeout. Other cases resolve series + answer
 * separately (in parallel). The routes call this instead of the two resolvers.
 */
export async function resolveChart(
  spec: ChartSpec,
): Promise<{ series: ResolvedSeries[]; answer?: ResolvedAnswer }> {
  // Single-scan path: extreme answer on a single-metric line.
  if (
    spec.answer?.kind === "extreme" &&
    spec.chart === "line" &&
    spec.series.length === 1 &&
    spec.series[0].source.kind === "metric"
  ) {
    const metric = spec.series[0].source.metric;
    const cat = getByKey(metric);
    if (cat) {
      const bucket = influxBucket();
      const { series, answer } = await extremeEnvelope(
        bucket,
        { series: spec.series[0], cat },
        spec,
        spec.answer.mode,
      );
      return { series: ensureChronological(spec, [series]), answer };
    }
  }

  // General path: resolve series and answer independently (in parallel).
  const [series, answer] = await Promise.all([
    resolveChartSeries(spec),
    resolveAnswer(spec),
  ]);
  return {
    series: ensureChronological(spec, series),
    ...(answer ? { answer } : {}),
  };
}

/**
 * Defensive guard: for line/area charts, ensure every series' points are sorted
 * by time ascending — so a connected line can never draw a phantom arc from the
 * last point back to the first (which would happen with out-of-order points).
 * Other chart types (candlestick/heatmap/scatter) are left untouched.
 */
function ensureChronological(
  spec: ChartSpec,
  series: ResolvedSeries[],
): ResolvedSeries[] {
  if (spec.chart !== "line") return series;
  return series.map((s) => ({ ...s, points: sortByTime(s.points) }));
}

/**
 * Context series for an EXTREME answer: a coarse min/max envelope matching the
 * answer mode (min→troughs, max→peaks). The window scales with the range so the
 * series stays bounded (~≤800 pts) — short ranges fine, multi-year ranges
 * weekly — but a SERIES is ALWAYS returned (never value-only).
 */
async function resolveExtremeContext(
  bucket: string,
  sc: SeriesCat,
  spec: ChartSpec,
  mode: "min" | "max",
): Promise<ResolvedSeries[]> {
  const points = await extremeEnvelope(bucket, sc, spec, mode);
  return [points.series];
}

/** Pick the envelope window for an extreme answer over `span` ms. */
function extremeWindow(span: number | null): string {
  if (span == null) return "1d";
  if (span <= 2 * MS.d) return "15m";
  if (span <= 14 * MS.d) return "1h";
  if (span <= 90 * MS.d) return "6h";
  if (span <= 800 * MS.d) return "1d"; // up to ~26 months → daily
  if (span <= 3 * MS.y) return "3d";
  return "7d"; // multi-year → weekly envelope (cheap aggregate)
}

/**
 * Pinpoint the exact extreme within the envelope BUCKET that produced `bucketEnd`
 * via a narrow raw min()/max(). aggregateWindow labels a bucket by its END time,
 * so the bucket covers `[bucketEnd - windowMs, bucketEnd]`. That window is at most
 * a few days (1d–7d), so the scan is cheap regardless of the overall range.
 * Returns the precise `(_time, _value)`, or null if the window has no data.
 */
async function rawExtremeInBucket(
  bucket: string,
  cat: CatalogEntry,
  mode: "min" | "max",
  bucketEnd: string,
  windowMs: number,
): Promise<SeriesPoint | null> {
  const end = new Date(bucketEnd);
  // Pad the window by 1ms so the boundary instant at bucketEnd is included.
  const start = new Date(end.getTime() - windowMs);
  const stop = new Date(end.getTime() + 1);
  const flux = `from(bucket: "${bucket}")
  |> range(start: ${start.toISOString()}, stop: ${stop.toISOString()})
  |> filter(fn: (r) => r["entity_id"] == "${cat.entityId}")
  |> filter(fn: (r) => r["_field"] == "value")
  |> ${mode}()
  |> keep(columns: ["_time", "_value"])`;
  const pts = await runFluxPoints(flux);
  return pts[0] ?? null;
}

/**
 * Compute the extreme min/max for an answer with a LAYERED query (cheap, no long
 * timeout): a coarse min/max ENVELOPE finds the extreme bucket (and serves as
 * the context series — daily MIN for "coldest" / MAX for "hottest", so it shows
 * the troughs/peaks). When that bucket is ≥1 day wide, a second NARROW raw
 * min()/max() scoped to just that day pinpoints the exact minute + true value.
 * Both queries are bounded, so even multi-year extremes stay under the default
 * timeout. The series is always returned (never value-only).
 */
async function extremeEnvelope(
  bucket: string,
  sc: SeriesCat,
  spec: ChartSpec,
  mode: "min" | "max",
): Promise<{ series: ResolvedSeries; answer: ResolvedAnswer }> {
  const span = rangeSpanMs(spec.timeRange);
  const base = extremeWindow(span);
  // The actual envelope window after adaptiveWindow may be coarser than `base`.
  const effective = adaptiveWindow(spec.timeRange, sanitizeWindow(base, "1d"));
  const windowMs = durationMs(effective) ?? MS.d;
  // For coarse (≥1d) envelopes use cheap UTC bucketing — local-time boundaries
  // are immaterial to a daily/weekly trend and the TZ-aware aggregate is far
  // slower over multi-year ranges. Sub-daily envelopes keep local time.
  const coarse = windowMs >= MS.d;
  const points = await windowedPoints(
    bucket,
    sc.cat,
    mode,
    base,
    spec.timeRange,
    /* localTz */ !coarse,
  );

  // The extreme bucket of the envelope (coarse to find the day/week).
  let best: SeriesPoint | null = null;
  for (const p of points) {
    if (best == null) best = p;
    else if (mode === "min" ? p.v < best.v : p.v > best.v) best = p;
  }

  // Layered pinpoint: for a ≥1d bucket, refine to the exact minute + true value
  // with one narrow raw query scoped to that bucket's window. Sub-daily buckets
  // are already precise enough.
  let exact = best;
  if (best && coarse) {
    try {
      const pinned = await rawExtremeInBucket(
        bucket,
        sc.cat,
        mode,
        best.t,
        windowMs,
      );
      if (pinned) exact = pinned;
    } catch {
      // Pinpoint is best-effort — fall back to the bucket time/value.
    }
  }

  const grain = coarse ? "Tages" : "Verlaufs";
  const series: ResolvedSeries = {
    ...baseSeries(sc, points),
    label:
      sc.series.label ||
      `${sc.cat.labelDe} (${grain}-${mode === "min" ? "Min" : "Max"})`,
  };
  const answer: ResolvedAnswer = {
    kind: "extreme",
    label:
      mode === "min"
        ? `Tiefstwert ${sc.cat.labelDe}`
        : `Höchstwert ${sc.cat.labelDe}`,
    unit: sc.cat.unit,
    value: exact ? Math.round(exact.v * 10) / 10 : null,
    t: exact ? exact.t : null,
  };
  return { series, answer };
}

/** Effective time range for a series: its own override, else the chart's. */
function seriesTimeRange(series: Series, spec: ChartSpec): TimeRange {
  return series.timeRange ?? spec.timeRange;
}

/**
 * Resolve a derived (degree-day) series: pull the input metric's daily-mean
 * temperature over the range, then run the named transform server-side. The
 * result is a cumulative line. See transforms.ts + spec-05 §4.
 */
async function resolveDerivedSeries(
  bucket: string,
  series: Series,
  spec: ChartSpec,
): Promise<ResolvedSeries> {
  if (series.source.kind !== "derived") {
    throw new Error("resolveDerivedSeries called on a non-derived series");
  }
  const src = series.source;
  if (!isTransform(src.transform)) {
    throw new ChartShapeError(`Unbekannte Transform: ${src.transform}`);
  }
  const inputMetric = src.inputs[0]?.metric ?? "outdoor_temperature";
  const cat = getByKey(inputMetric);
  if (!cat) {
    throw new Error(`Derived input references unknown metric "${inputMetric}"`);
  }

  const dailyMeans = await windowedPoints(
    bucket,
    cat,
    "mean",
    "1d",
    seriesTimeRange(series, spec),
  );
  const base = src.base ?? defaultBase(src.transform);
  const result = applyTransform(src.transform, dailyMeans, base);

  return {
    id: series.id,
    label: series.label || result.label,
    unit: result.unit,
    role: series.role,
    color: series.color,
    points: result.cumulative,
  };
}

/**
 * Comparison overlay: resolve each series on its own timeRange, then rebase the
 * x-axis to a shared relative axis (day-of-period, anchored at a common epoch)
 * so two different years line up. Series labels stay the period descriptors.
 */
async function resolveComparison(
  bucket: string,
  scs: SeriesCat[],
  spec: ChartSpec,
): Promise<ResolvedSeries[]> {
  return Promise.all(
    scs.map(async (sc) => {
      const tr = seriesTimeRange(sc.series, spec);
      const raw = await runFluxPoints(
        buildSeriesFlux(bucket, sc.cat, sc.series, tr),
      );
      // Rebase: offset each point's date to a common reference year (2000) but
      // keep month/day/time, so periods from different years overlap on the axis.
      const rebased = raw.map((p) => {
        const d = new Date(p.t);
        const rebasedDate = new Date(
          Date.UTC(
            2000,
            d.getUTCMonth(),
            d.getUTCDate(),
            d.getUTCHours(),
            d.getUTCMinutes(),
          ),
        );
        return { t: rebasedDate.toISOString(), v: p.v };
      });
      return { ...baseSeries(sc, rebased) };
    }),
  );
}

type SeriesCat = { series: Series; cat: CatalogEntry };

/** Build a base ResolvedSeries (metadata + colour), points filled by callers. */
/**
 * Sort points by time ASCENDING (defensive). Some Flux aggregates over long,
 * multi-shard ranges can return rows out of chronological order; an unsorted
 * line/area series would draw a phantom arc from the last point back to the
 * first. Sorting here guarantees a clean chronological line everywhere.
 */
function sortByTime(points: SeriesPoint[]): SeriesPoint[] {
  return [...points].sort((a, b) => a.t.localeCompare(b.t));
}

function baseSeries(
  sc: SeriesCat,
  points: SeriesPoint[] = [],
): ResolvedSeries {
  return {
    id: sc.series.id,
    label: sc.series.label || sc.cat.labelDe,
    unit: sc.cat.unit,
    role: sc.series.role,
    color: sc.series.color,
    points: sortByTime(points),
  };
}

/** Run the standard time-series query for one metric series. */
async function standardPoints(
  bucket: string,
  sc: SeriesCat,
  timeRange: TimeRange,
): Promise<SeriesPoint[]> {
  return runFluxPoints(buildSeriesFlux(bucket, sc.cat, sc.series, timeRange));
}

/** Run a windowed aggregate query and return points. */
async function windowedPoints(
  bucket: string,
  cat: CatalogEntry,
  fn: "min" | "max" | "mean" | "sum" | "first" | "last",
  window: string,
  timeRange: TimeRange,
  // Local-time bucket boundaries (Europe/Berlin). Correct for daily/hourly
  // charts, but the TZ-aware aggregateWindow is MUCH slower over long ranges
  // (DST-aware bucketing across years). Callers that only need a coarse trend
  // (the extreme envelope) pass false to use cheap UTC bucketing.
  localTz = true,
): Promise<SeriesPoint[]> {
  const start = sanitizeRangeToken(timeRange.start, "-7d");
  const stop = sanitizeRangeToken(timeRange.stop ?? "now", "now()");
  // Coarsen long ranges so heavy aggregates (candlestick/heatmaps/count/…) stay
  // bounded; never finer than requested, so short ranges keep their resolution.
  const w = adaptiveWindow(timeRange, sanitizeWindow(window, "1d"));
  const preamble = localTz ? TZ_PREAMBLE : "";
  const flux = `${preamble}from(bucket: "${bucket}")
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r["entity_id"] == "${cat.entityId}")
  |> filter(fn: (r) => r["_field"] == "value")
  |> aggregateWindow(every: ${w}, fn: ${fn}, createEmpty: false)
  ${TERMINAL_SORT}
  |> yield(name: "v")`;
  return runFluxPoints(flux);
}

/**
 * Map a daily bucket's `_time` to its Europe/Berlin calendar date. After the
 * TZ_PREAMBLE shifts daily buckets to local midnight (e.g. `…T22:00:00Z` of the
 * PREVIOUS UTC day in summer), a naive UTC slice would be off by one — so format
 * the instant in Berlin local time. `sv-SE` locale yields `YYYY-MM-DD`.
 */
function dayKey(iso: string): string {
  // Container runs TZ=Europe/Berlin, so toLocaleDateString uses Berlin time.
  return new Date(iso).toLocaleDateString("sv-SE");
}

/**
 * Dispatch a ChartSpec to the data-shaping logic for its type. Returns the
 * ResolvedSeries array (standard `points` for time-series types; `shaped`
 * payload for the others). See spec-04 §7.
 */
async function shapeChart(
  spec: ChartSpec,
  scs: SeriesCat[],
): Promise<ResolvedSeries[]> {
  const bucket = influxBucket();
  const chart: ChartType = spec.chart;

  switch (chart) {
    // ── Range types: one metric → min/max per window ───────────────────────
    case "candlestick": {
      const sc = scs[0];
      const win = sanitizeWindow(sc.series.source.kind === "metric" ? sc.series.source.window : undefined, "1d");
      const [mins, maxs, firsts, lasts] = await Promise.all([
        windowedPoints(bucket, sc.cat, "min", win, spec.timeRange),
        windowedPoints(bucket, sc.cat, "max", win, spec.timeRange),
        windowedPoints(bucket, sc.cat, "first", win, spec.timeRange),
        windowedPoints(bucket, sc.cat, "last", win, spec.timeRange),
      ]);
      const minBy = new Map(mins.map((p) => [p.t, p.v]));
      const maxBy = new Map(maxs.map((p) => [p.t, p.v]));
      const firstBy = new Map(firsts.map((p) => [p.t, p.v]));
      const lastBy = new Map(lasts.map((p) => [p.t, p.v]));
      const ohlc = [...minBy.keys()]
        .filter((t) => maxBy.has(t))
        .sort()
        .map((t) => ({
          t,
          open: firstBy.get(t) ?? minBy.get(t)!,
          close: lastBy.get(t) ?? maxBy.get(t)!,
          low: minBy.get(t)!,
          high: maxBy.get(t)!,
        }));
      return [{ ...baseSeries(sc), shaped: { shape: "ohlc", ohlc } }];
    }

    case "rangeBand":
    case "barRange": {
      const sc = scs[0];
      const win = sanitizeWindow(sc.series.source.kind === "metric" ? sc.series.source.window : undefined, chart === "rangeBand" ? "1h" : "1d");
      const [mins, maxs] = await Promise.all([
        windowedPoints(bucket, sc.cat, "min", win, spec.timeRange),
        windowedPoints(bucket, sc.cat, "max", win, spec.timeRange),
      ]);
      const maxBy = new Map(maxs.map((p) => [p.t, p.v]));
      const band = mins
        .filter((p) => maxBy.has(p.t))
        .map((p) => ({ t: p.t, low: p.v, high: maxBy.get(p.t)! }));
      return [{ ...baseSeries(sc), shaped: { shape: "band", band } }];
    }

    // ── Scatter: two metrics joined on a shared 1h grid ────────────────────
    case "scatter": {
      const xs = scs.find((s) => s.series.role === "x") ?? scs[0];
      const ys = scs.find((s) => s.series.role === "y") ?? scs[1];
      const [xp, yp] = await Promise.all([
        standardPoints(bucket, xs, spec.timeRange),
        standardPoints(bucket, ys, spec.timeRange),
      ]);
      const yBy = new Map(yp.map((p) => [p.t, p.v]));
      const pairs = xp
        .filter((p) => yBy.has(p.t))
        .map((p) => ({ x: p.v, y: yBy.get(p.t)!, t: p.t }));
      // Label both axes via two series so the renderer knows units/labels.
      return [
        { ...baseSeries(xs), shaped: { shape: "xy", pairs } },
        baseSeries(ys),
      ];
    }

    // ── Calendar heatmap: daily aggregate ──────────────────────────────────
    case "heatmapCalendar": {
      const sc = scs[0];
      const pts = await windowedPoints(bucket, sc.cat, sc.cat.rainCounter ? "sum" : "mean", "1d", spec.timeRange);
      const calendar = pts.map((p) => ({ date: dayKey(p.t), value: p.v }));
      return [{ ...baseSeries(sc), shaped: { shape: "calendar", calendar } }];
    }

    // ── Hour×weekday heatmap: 1h means grouped to a 24×7 matrix ────────────
    case "heatmapHourDay": {
      const sc = scs[0];
      const pts = await windowedPoints(bucket, sc.cat, "mean", "1h", spec.timeRange);
      // Accumulate mean per (hour, weekday) bucket. weekday: Mon=0..Sun=6.
      const sum = new Map<string, { s: number; n: number }>();
      for (const p of pts) {
        const d = new Date(p.t);
        // Local getters → Europe/Berlin (container TZ), so the diurnal pattern
        // lands on the correct local hour/weekday, not UTC.
        const hour = d.getHours();
        const weekday = (d.getDay() + 6) % 7; // JS Sun=0 → Mon=0
        const key = `${hour}-${weekday}`;
        const cur = sum.get(key) ?? { s: 0, n: 0 };
        cur.s += p.v;
        cur.n += 1;
        sum.set(key, cur);
      }
      const matrix = [...sum.entries()].map(([key, { s, n }]) => {
        const [hour, weekday] = key.split("-").map(Number);
        return { hour, weekday, value: s / n };
      });
      return [{ ...baseSeries(sc), shaped: { shape: "matrix", matrix } }];
    }

    // ── Gauge: single latest value ─────────────────────────────────────────
    case "gauge": {
      const sc = scs[0];
      const pts = await standardPoints(bucket, sc, spec.timeRange);
      const last = pts.length > 0 ? pts[pts.length - 1].v : null;
      return [{ ...baseSeries(sc), shaped: { shape: "scalar", scalar: last } }];
    }

    // ── Boxplot / violin: distribution grouped by period ───────────────────
    case "boxplot":
    case "violin": {
      const sc = scs[0];
      // Sample at 1h to keep payloads bounded, then group by calendar month.
      const pts = await windowedPoints(bucket, sc.cat, "mean", "1h", spec.timeRange);
      const byPeriod = new Map<string, number[]>();
      for (const p of pts) {
        const key = p.t.slice(0, 7); // YYYY-MM
        const arr = byPeriod.get(key) ?? [];
        arr.push(p.v);
        byPeriod.set(key, arr);
      }
      const groups = [...byPeriod.entries()]
        .sort()
        .map(([label, values]) => ({ label, values }));
      return [
        { ...baseSeries(sc), shaped: { shape: "distribution", groups } },
      ];
    }

    // ── Regen pro Schauer: rain increments → in-app sessionized events ─────
    case "showerBars": {
      const sc = scs[0];
      // Fetch the wet increments (no aggregateWindow/sum) then group in-app.
      const increments = await runFluxPoints(
        buildRainIncrementsFlux(bucket, sc.cat, spec.timeRange),
      );
      const mit =
        typeof spec.mit === "number" && spec.mit > 0
          ? spec.mit
          : SHOWER_MIT_HOURS;
      const showers = groupShowers(increments, mit);
      return [{ ...baseSeries(sc), shaped: { shape: "showers", showers } }];
    }

    // ── Radar / themeRiver: several metrics, time-series points ────────────
    case "radar":
    case "themeRiver": {
      // Resolve each metric as standard points; the renderer reshapes.
      return Promise.all(
        scs.map(async (sc) => baseSeries(sc, await standardPoints(bucket, sc, spec.timeRange))),
      );
    }

    // ── Standard time-series types (line / bars / windrose) ────────────────
    case "line":
    case "bars":
    case "windrose":
    default: {
      return Promise.all(
        scs.map(async (sc) => baseSeries(sc, await standardPoints(bucket, sc, spec.timeRange))),
      );
    }
  }
}

// ── Answer resolvers (spec-05 §4): extreme / scalar / count ─────────────────

function compareOp(op: string): "<" | "<=" | ">" | ">=" {
  switch (op) {
    case "<":
    case "<=":
    case ">":
    case ">=":
      return op;
    default:
      return ">";
  }
}

/**
 * Resolve a ChartSpec.answer into a prominent computed result (spec-05 §4).
 * Whitelist: the answer's metric must be in the catalog. Returns null if the
 * spec has no answer.
 */
export async function resolveAnswer(
  spec: ChartSpec,
): Promise<ResolvedAnswer | undefined> {
  const answer = spec.answer;
  if (!answer) return undefined;

  const bucket = influxBucket();
  const cat = getByKey(answer.metric);
  if (!cat) {
    throw new ChartShapeError(`Unbekannte Metrik in Answer: ${answer.metric}`);
  }
  const start = sanitizeRangeToken(spec.timeRange.start, "-30d");
  const stop = sanitizeRangeToken(spec.timeRange.stop ?? "now", "now()");

  if (answer.kind === "extreme") {
    // min()/max() in Flux keep the row's timestamp → value + exact time in one.
    const fn = answer.mode === "min" ? "min" : "max";
    const flux = `${TZ_PREAMBLE}from(bucket: "${bucket}")
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r["entity_id"] == "${cat.entityId}")
  |> filter(fn: (r) => r["_field"] == "value")
  |> ${fn}()
  |> keep(columns: ["_time", "_value"])`;
    const pts = await runFluxPoints(flux);
    const hit = pts[0] ?? null;
    return {
      kind: "extreme",
      label:
        answer.mode === "min"
          ? `Tiefstwert ${cat.labelDe}`
          : `Höchstwert ${cat.labelDe}`,
      unit: cat.unit,
      value: hit ? hit.v : null,
      t: hit ? hit.t : null,
    };
  }

  if (answer.kind === "scalar") {
    // Rain accumulator → sum the differenced counter; over-sampled ET → dedup
    // (archive-interval last) then sum; else aggregate raw.
    let flux: string;
    if (cat.rainCounter && answer.agg === "sum") {
      flux = `${TZ_PREAMBLE}from(bucket: "${bucket}")
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r["entity_id"] == "${cat.entityId}")
  |> filter(fn: (r) => r["_field"] == "value")
  |> group(columns: ["entity_id"])
  |> difference(nonNegative: true)
  |> sum()
  |> keep(columns: ["_value"])`;
    } else if (cat.dedupSum && answer.agg === "sum") {
      const dedup = sanitizeWindow(cat.dedupWindow ?? "5m", "5m");
      flux = `${TZ_PREAMBLE}from(bucket: "${bucket}")
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r["entity_id"] == "${cat.entityId}")
  |> filter(fn: (r) => r["_field"] == "value")
  |> aggregateWindow(every: ${dedup}, fn: last, createEmpty: false)
  |> sum()
  |> keep(columns: ["_value"])`;
    } else {
      flux = `${TZ_PREAMBLE}from(bucket: "${bucket}")
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r["entity_id"] == "${cat.entityId}")
  |> filter(fn: (r) => r["_field"] == "value")
  |> ${answer.agg}()
  |> keep(columns: ["_value"])`;
    }
    // mean()/sum() drop _time → read just the scalar value.
    const v = await runFluxScalar(flux);
    const aggLabel = { mean: "Durchschnitt", sum: "Summe", min: "Minimum", max: "Maximum" }[answer.agg];
    return {
      kind: "scalar",
      label: `${aggLabel} ${cat.labelDe}`,
      unit: cat.unit,
      value: v == null ? null : Math.round(v * 10) / 10,
    };
  }

  // count: number of days/hours meeting op+threshold. Frost → day-min,
  // heat → day-max; default day-max for ">" and day-min for "<".
  const op = compareOp(answer.op);
  const window = answer.per === "hour" ? "1h" : "1d";
  const dayFn = op === "<" || op === "<=" ? "min" : "max";
  const flux = `${TZ_PREAMBLE}from(bucket: "${bucket}")
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r["entity_id"] == "${cat.entityId}")
  |> filter(fn: (r) => r["_field"] == "value")
  |> aggregateWindow(every: ${window}, fn: ${dayFn}, createEmpty: false)
  |> filter(fn: (r) => r["_value"] ${op} ${answer.threshold})
  |> count()
  |> keep(columns: ["_value"])`;
  // count() drops _time → read the scalar; no rows means zero matches.
  const n = (await runFluxScalar(flux)) ?? 0;
  const perLabel = answer.per === "hour" ? "Stunden" : "Tage";
  return {
    kind: "count",
    label: `${perLabel} mit ${cat.labelDe} ${op} ${answer.threshold} ${cat.unit}`,
    unit: perLabel,
    value: n,
    count: n,
  };
}

// ── Kennwerte (live values for the header row, spec-03 §4) ──────────────────

/**
 * DE-format a Kennwert secondary value WITHOUT a unit (the unit is already on the
 * main value). Degrees / W/m² / UV ("–") read as integers; everything else gets
 * one decimal — same precision rule the row's `formatValue` uses (spec-09 A).
 */
function formatSecondaryNumber(v: number, unit: string): string {
  const decimals = unit === "°" || unit === "W/m²" || unit === "–" ? 0 : 1;
  return v.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Resolve the 12 Kennwerte: one `last()`-per-entity query for the "latest"
 * metrics (whitelist of catalog entityIds), a daily-max query for "Regen heute"
 * (today's accumulator), plus two today-scoped min()/max() queries that feed the
 * muted "secondary" line (today low/high or peak — spec-09 A). All run in ONE
 * `Promise.all` batch so /api/now stays fast. Returns one value per KENNWERTE.
 */
export async function resolveKennwerte(): Promise<KennwertValue[]> {
  const bucket = influxBucket();

  // Whitelist of entityIds for the "latest" metrics (resolved via catalog).
  const latestDefs = KENNWERTE.filter((k) => k.aggregation === "latest");
  const entityToDef = new Map<string, (typeof KENNWERTE)[number]>();
  for (const def of latestDefs) {
    const cat = getByKey(def.key);
    if (cat) entityToDef.set(cat.entityId, def);
  }
  const entityIds = [...entityToDef.keys()];

  // ONE Flux query: last() per entity over the whitelist (regex on entity_id).
  const orRegex = entityIds.map((e) => `^${e}$`).join("|");
  const latestFlux = `${TZ_PREAMBLE}from(bucket: "${bucket}")
  |> range(start: -6h)
  |> filter(fn: (r) => r["_field"] == "value")
  |> filter(fn: (r) => r["entity_id"] =~ /${orRegex}/)
  |> last()
  |> keep(columns: ["entity_id", "_time", "_value"])`;

  // "Regen heute" = today's daily-max of the rain accumulator (dayrain_mm).
  // TZ preamble makes today() = Europe/Berlin midnight (not UTC midnight), so
  // "Regen heute" (and the secondary min/max below) cover the correct local day.
  const rainDef = KENNWERTE.find((k) => k.aggregation === "rainToday");
  const rainCat = rainDef ? getByKey(rainDef.key) : undefined;
  const rainFlux = rainCat
    ? `${TZ_PREAMBLE}from(bucket: "${bucket}")
  |> range(start: today())
  |> filter(fn: (r) => r["entity_id"] == "${rainCat.entityId}")
  |> filter(fn: (r) => r["_field"] == "value")
  |> group(columns: ["entity_id"])
  |> max()
  |> keep(columns: ["_time", "_value"])`
    : null;

  // Secondary set: entityIds of the Kennwerte that carry a `secondary` field.
  // Two today-scoped queries (min, max) over that whitelist. group BEFORE the
  // aggregation (per entity_id) to bridge the storage-shard boundary — same as
  // rainToday; otherwise a metric split across shards yields one row per shard.
  const secondaryDefs = KENNWERTE.filter((k) => k.secondary);
  const secEntityToDef = new Map<string, (typeof KENNWERTE)[number]>();
  for (const def of secondaryDefs) {
    const cat = getByKey(def.key);
    if (cat) secEntityToDef.set(cat.entityId, def);
  }
  const secEntityIds = [...secEntityToDef.keys()];
  const secRegex = secEntityIds.map((e) => `^${e}$`).join("|");
  const secBase = `${TZ_PREAMBLE}from(bucket: "${bucket}")
  |> range(start: today())
  |> filter(fn: (r) => r["_field"] == "value")
  |> filter(fn: (r) => r["entity_id"] =~ /${secRegex}/)
  |> group(columns: ["entity_id"])`;
  // min()/max() over a single grouped table keep _time → runFluxEntityRows reads
  // (entity_id, _time, _value) fine; we only use entity_id + _value.
  const secMinFlux = secEntityIds.length
    ? `${secBase}
  |> min()
  |> keep(columns: ["entity_id", "_time", "_value"])`
    : null;
  const secMaxFlux = secEntityIds.length
    ? `${secBase}
  |> max()
  |> keep(columns: ["entity_id", "_time", "_value"])`
    : null;

  // ONE batch so /api/now is a single round of parallel queries.
  const [latestRows, rainPoints, secMinRows, secMaxRows] = await Promise.all([
    runFluxEntityRows(latestFlux),
    rainFlux ? runFluxPoints(rainFlux) : Promise.resolve([]),
    secMinFlux ? runFluxEntityRows(secMinFlux) : Promise.resolve([]),
    secMaxFlux ? runFluxEntityRows(secMaxFlux) : Promise.resolve([]),
  ]);

  const latestByEntity = new Map(latestRows.map((r) => [r.entityId, r]));
  const secMinByEntity = new Map(secMinRows.map((r) => [r.entityId, r.v]));
  const secMaxByEntity = new Map(secMaxRows.map((r) => [r.entityId, r.v]));

  const rainTodayValue = rainPoints.length > 0 ? rainPoints[0].v : null;
  const rainTodayTime = rainPoints.length > 0 ? rainPoints[0].t : null;

  // Build the muted secondary string for a def (today low/high or peak), or
  // undefined when the needed value(s) are missing — the main value still shows.
  function buildSecondary(
    def: (typeof KENNWERTE)[number],
    entityId: string,
    unit: string,
  ): string | undefined {
    if (!def.secondary) return undefined;
    const max = secMaxByEntity.get(entityId);
    if (def.secondary === "todayMax") {
      return max == null ? undefined : `↑ ${formatSecondaryNumber(max, unit)}`;
    }
    // todayMinMax
    const min = secMinByEntity.get(entityId);
    if (min == null || max == null) return undefined;
    return `↓ ${formatSecondaryNumber(min, unit)} ↑ ${formatSecondaryNumber(max, unit)}`;
  }

  // Assemble in KENNWERTE order.
  return KENNWERTE.map((def): KennwertValue => {
    const cat = getByKey(def.key);
    const unit = cat?.unit ?? "";

    if (def.aggregation === "rainToday") {
      return {
        key: def.key,
        label: def.label,
        unit,
        value: rainTodayValue,
        t: rainTodayTime,
      };
    }

    const row = cat ? latestByEntity.get(cat.entityId) : undefined;
    const value = row?.v ?? null;
    const secondary = cat ? buildSecondary(def, cat.entityId, unit) : undefined;
    return {
      key: def.key,
      label: def.label,
      unit,
      value,
      t: row?.t ?? null,
      ...(def.compass && value != null
        ? { compass: degreesToCompass(value) }
        : {}),
      ...(secondary ? { secondary } : {}),
    };
  });
}
