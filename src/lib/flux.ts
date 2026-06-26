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
} from "@/lib/influx";
import { KENNWERTE, type KennwertValue } from "@/lib/kennwerte";
import type {
  ChartSpec,
  ChartType,
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

  // Accumulator metrics (rainfall, evapotranspiration): differentiate the daily
  // counter (nonNegative caps the midnight reset) then sum over the window.
  if (cat.rainCounter) {
    const window = sanitizeWindow(
      series.source.window ?? cat.defaultWindow,
      cat.defaultWindow,
    );
    return `${base}
  |> difference(nonNegative: true)
  |> aggregateWindow(every: ${window}, fn: sum, createEmpty: false)
  |> yield(name: "${series.id}")`;
  }

  // Standard metric: optional aggregateWindow. `none` → raw points (short ranges only).
  const agg = series.source.aggregation;
  if (agg === "none") {
    return `${base}
  |> yield(name: "${series.id}")`;
  }

  const window = sanitizeWindow(
    series.source.window ?? cat.defaultWindow,
    cat.defaultWindow,
  );
  return `${base}
  |> aggregateWindow(every: ${window}, fn: ${aggregationFn(agg)}, createEmpty: false)
  |> yield(name: "${series.id}")`;
}

/**
 * Resolve every series of a ChartSpec into data. Each series runs as its own
 * Flux query (simpler + isolates failures than multi-yield parsing). Unknown
 * metric keys throw — callers map that to 4xx/5xx.
 */
export async function resolveChartSeries(
  spec: ChartSpec,
): Promise<ResolvedSeries[]> {
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

  // 3) Dispatch by chart type to the matching data-shaping resolver.
  return shapeChart(spec, resolvedCats);
}

type SeriesCat = { series: Series; cat: CatalogEntry };

/** Build a base ResolvedSeries (metadata + colour), points filled by callers. */
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
    points,
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
): Promise<SeriesPoint[]> {
  const start = sanitizeRangeToken(timeRange.start, "-7d");
  const stop = sanitizeRangeToken(timeRange.stop ?? "now", "now()");
  const w = sanitizeWindow(window, "1d");
  const flux = `${TZ_PREAMBLE}from(bucket: "${bucket}")
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r["entity_id"] == "${cat.entityId}")
  |> filter(fn: (r) => r["_field"] == "value")
  |> aggregateWindow(every: ${w}, fn: ${fn}, createEmpty: false)
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

// ── Kennwerte (live values for the header row, spec-03 §4) ──────────────────

/**
 * Resolve the 12 Kennwerte: one `last()`-per-entity query for the "latest"
 * metrics (whitelist of catalog entityIds), plus a daily-max query for
 * "Regen heute" (today's accumulator). Returns one value per KENNWERTE entry.
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

  const latestRows = await runFluxEntityRows(latestFlux);
  const latestByEntity = new Map(latestRows.map((r) => [r.entityId, r]));

  // "Regen heute" = today's daily-max of the rain accumulator (dayrain_mm).
  let rainTodayValue: number | null = null;
  let rainTodayTime: string | null = null;
  const rainDef = KENNWERTE.find((k) => k.aggregation === "rainToday");
  const rainCat = rainDef ? getByKey(rainDef.key) : undefined;
  if (rainCat) {
    // TZ preamble makes today() = Europe/Berlin midnight (not UTC midnight),
    // so "Regen heute" covers the correct local calendar day.
    const rainFlux = `${TZ_PREAMBLE}from(bucket: "${bucket}")
  |> range(start: today())
  |> filter(fn: (r) => r["entity_id"] == "${rainCat.entityId}")
  |> filter(fn: (r) => r["_field"] == "value")
  |> max()
  |> keep(columns: ["_time", "_value"])`;
    const rainPoints = await runFluxPoints(rainFlux);
    if (rainPoints.length > 0) {
      rainTodayValue = rainPoints[0].v;
      rainTodayTime = rainPoints[0].t;
    }
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
    return {
      key: def.key,
      label: def.label,
      unit,
      value,
      t: row?.t ?? null,
      ...(def.compass && value != null
        ? { compass: degreesToCompass(value) }
        : {}),
    };
  });
}
