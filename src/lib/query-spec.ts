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
  chart: ChartType; // v2: 'line' | 'bars' | 'windrose'
  timeRange: TimeRange; // shared default for the series
  series: Series[]; // 1..N series in ONE chart
}

export type ChartType =
  // v2 (implemented)
  | "line"
  | "bars"
  | "windrose"
  // reserved for later iterations (not v2)
  | "rangeBand"
  | "heatmap"
  | "table"
  | "scatter";

/** v2 chart types actually rendered/executed this iteration. */
export const V2_CHART_TYPES = ["line", "bars", "windrose"] as const;
export type V2ChartType = (typeof V2_CHART_TYPES)[number];

export interface TimeRange {
  start: string; // e.g. '-28d' or absolute ISO
  stop?: string; // e.g. 'now'; defaults to now() server-side
}

export interface Series {
  id: string;
  label: string;
  role?: SeriesRole; // v2: 'value' | 'magnitude' | 'direction'
  source: Source;
  timeRange?: TimeRange; // (later) per-series override → time comparison
}

export type SeriesRole =
  // v2
  | "value"
  | "magnitude"
  | "direction"
  // later
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

/** v2 series roles valid in the tool schema. */
export const SERIES_ROLES = ["value", "magnitude", "direction"] as const;

// ── Response shape (returned by /api/ask and /api/chart) ──────────────────────

export interface SeriesPoint {
  t: string; // ISO timestamp
  v: number;
}

export interface ResolvedSeries {
  id: string;
  label: string;
  unit: string;
  role?: SeriesRole;
  points: SeriesPoint[];
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
