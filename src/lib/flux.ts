import "server-only";

import {
  degreesToCompass,
  getByKey,
  type CatalogEntry,
} from "@/lib/catalog";
import {
  influxBucket,
  runFluxEntityRows,
  runFluxPoints,
} from "@/lib/influx";
import { KENNWERTE, type KennwertValue } from "@/lib/kennwerte";
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
  const latestFlux = `from(bucket: "${bucket}")
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
    const rainFlux = `from(bucket: "${bucket}")
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
