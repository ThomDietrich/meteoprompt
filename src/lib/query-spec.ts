/**
 * QuerySpec — the structured query format Claude emits and the backend executes.
 *
 * These types are the **superset** (future-proof). Iteration 2 implements only the
 * marked v2 subset; later iterations add union branches / enum values / transforms
 * additively without changing the wire format. See docs/iterations spec-02 §4.
 *
 * Shared between client and server, so this module is intentionally free of any
 * server-only or Node dependency.
 */

export interface QuerySpec {
  version: 1;
  query: string; // original user text
  charts: ChartSpec[]; // 1..N independent charts (→ one card each)
}

export interface ChartSpec {
  id: string;
  title: string; // Claude-authored title → card header
  chart: ChartType;
  timeRange: TimeRange; // shared default for the series
  series: Series[]; // 1..N series in ONE chart
  binning?: Binning; // spec-04: for heatmap-style charts
}

export type ChartType =
  // v2/03
  | "line"
  | "bars"
  | "windrose"
  // v4 core
  | "candlestick"
  | "rangeBand"
  | "scatter"
  | "heatmapCalendar"
  | "heatmapHourDay"
  | "gauge"
  // v4 extended
  | "boxplot"
  | "radar"
  | "violin"
  | "barRange"
  | "themeRiver"
  // reserved (not yet rendered)
  | "heatmap"
  | "table";

export type Binning = "calendar" | "hourOfDay×weekday";

/**
 * All chart types implemented (rendered + data-shaped) in spec-04. This is the
 * whitelist exposed to Claude's tool schema and validated server-side.
 */
export const IMPLEMENTED_CHART_TYPES = [
  "line",
  "bars",
  "windrose",
  "candlestick",
  "rangeBand",
  "scatter",
  "heatmapCalendar",
  "heatmapHourDay",
  "gauge",
  "boxplot",
  "radar",
  "violin",
  "barRange",
  "themeRiver",
] as const;
export type ImplementedChartType = (typeof IMPLEMENTED_CHART_TYPES)[number];

/** Kept for compatibility with earlier iterations' references. */
export const V2_CHART_TYPES = ["line", "bars", "windrose"] as const;
export type V2ChartType = (typeof V2_CHART_TYPES)[number];

export interface TimeRange {
  start: string; // e.g. '-28d' or absolute ISO
  stop?: string; // e.g. 'now'; defaults to now() server-side
}

export interface Series {
  id: string;
  label: string;
  role?: SeriesRole; // v2: 'value' | 'magnitude' | 'direction'; v4: + 'x' | 'y'
  color?: string; // spec-04: random Wappen-palette colour, persisted
  source: Source;
  timeRange?: TimeRange; // (later) per-series override → time comparison
}

export type SeriesRole =
  // v2/03
  | "value"
  | "magnitude"
  | "direction"
  // v4 (scatter axes)
  | "x"
  | "y"
  // later / range types
  | "min"
  | "mean"
  | "max"
  | "comparison";

/** Discriminated union over "kind" — the central extension point. */
export type Source =
  | MetricSource // v2
  | DerivedSource; // later (not v2)

export interface MetricSource {
  kind: "metric";
  metric: string; // catalog key (see catalog.ts)
  aggregation: Aggregation; // 'mean'|'sum'|'min'|'max'|'none'
  window?: string; // e.g. '1h', '1d'
}

export interface DerivedSource {
  // RESERVED for Iteration 3+ (not v2)
  kind: "derived";
  transform: string;
  inputs: { metric: string; as: string }[];
  unit?: string;
}

export type Aggregation = "mean" | "sum" | "min" | "max" | "none";

/** v2 aggregations valid in the tool schema / accepted at runtime. */
export const AGGREGATIONS = ["mean", "sum", "min", "max", "none"] as const;

/** Series roles valid in the tool schema (v4 adds scatter axes + range roles). */
export const SERIES_ROLES = [
  "value",
  "magnitude",
  "direction",
  "x",
  "y",
  "min",
  "mean",
  "max",
] as const;

// ── Response shape (returned by /api/ask and /api/chart) ──────────────────────

export interface SeriesPoint {
  t: string; // ISO timestamp
  v: number;
}

/** OHLC bar for candlestick: per-period open/close/low/high. */
export interface OhlcPoint {
  t: string;
  open: number;
  close: number;
  low: number;
  high: number;
}

/** Low/high envelope point for rangeBand / barRange. */
export interface BandPoint {
  t: string;
  low: number;
  high: number;
}

/** A paired observation for scatter. */
export interface XYPoint {
  x: number;
  y: number;
  t?: string;
}

/** A daily value for the calendar heatmap. */
export interface CalendarPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

/** A cell of the hour×weekday matrix (0–23 × 0–6, Mon=0). */
export interface MatrixPoint {
  hour: number;
  weekday: number;
  value: number;
}

/**
 * Shaped payloads for the non-line chart types (spec-04 §6/§7). A ResolvedSeries
 * carries `points` for time-series types and optionally one shaped payload that
 * matches its chart type. `shape` discriminates which field is populated.
 */
export type ShapedData =
  | { shape: "ohlc"; ohlc: OhlcPoint[] }
  | { shape: "band"; band: BandPoint[] }
  | { shape: "xy"; pairs: XYPoint[] }
  | { shape: "calendar"; calendar: CalendarPoint[] }
  | { shape: "matrix"; matrix: MatrixPoint[] }
  | { shape: "scalar"; scalar: number | null }
  | { shape: "distribution"; groups: { label: string; values: number[] }[] };

export interface ResolvedSeries {
  id: string;
  label: string;
  unit: string;
  role?: SeriesRole;
  color?: string; // resolved from spec (or assigned by colors.ts)
  points: SeriesPoint[]; // always present (may be empty for shaped-only types)
  shaped?: ShapedData; // present for non-time-series chart types
}

/** One chart with its spec and the resolved data series. */
export interface ChartResult {
  spec: ChartSpec;
  series: ResolvedSeries[];
}

/** Response of POST /api/ask. */
export interface AskResponse {
  query: string;
  charts: ChartResult[];
}

/** Response of POST /api/chart. */
export interface ChartResponse {
  spec: ChartSpec;
  series: ResolvedSeries[];
}
