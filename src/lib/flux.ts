import "server-only";

import { getByKey, type CatalogEntry } from "@/lib/catalog";
import { influxBucket, runFluxPoints } from "@/lib/influx";
import type {
  ChartSpec,
  ResolvedSeries,
  Series,
  TimeRange,
} from "@/lib/query-spec";

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

  const base = `from(bucket: "${bucket}")
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
  const bucket = influxBucket();

  const resolved = await Promise.all(
    spec.series.map(async (series): Promise<ResolvedSeries> => {
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

      const flux = buildSeriesFlux(bucket, cat, series, spec.timeRange);
      const points = await runFluxPoints(flux);

      return {
        id: series.id,
        label: series.label || cat.labelDe,
        unit: cat.unit,
        role: series.role,
        points,
      };
    }),
  );

  return resolved;
}
