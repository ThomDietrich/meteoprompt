import type { Aggregation, ChartSpec, Series } from "@/lib/query-spec";

/**
 * The 10 predefined ChartSpecs of the permanent "Stations-Dashboard" (spec-03 §5).
 *
 * These reuse the Iteration-2 ChartSpec format and are resolved through the
 * existing /api/chart path (no Claude). Only existing renderers are used
 * (line incl. area, bars, windrose); new chart types come in spec-04.
 *
 * Shared (no server-only dep): the client iterates these and posts each to
 * /api/chart. Stable ids so series yields stay unique per chart.
 */

/** Helper to build a metric series tersely. */
function s(
  id: string,
  label: string,
  metric: string,
  aggregation: Aggregation,
  window: string,
  role?: Series["role"],
): Series {
  return {
    id,
    label,
    ...(role ? { role } : {}),
    source: { kind: "metric", metric, aggregation, window },
  };
}

export const PERMANENT_CHARTS: ChartSpec[] = [
  // 1 — Temperaturverlauf (3 Serien), -24h, mean/1h
  {
    id: "perm-1",
    title: "Temperaturverlauf",
    chart: "line",
    timeRange: { start: "-24h", stop: "now" },
    series: [
      s("perm-1-s0", "Außentemperatur", "outdoor_temperature", "mean", "1h", "value"),
      s("perm-1-s1", "Gefühlt", "apparent_temperature", "mean", "1h", "value"),
      s("perm-1-s2", "Taupunkt", "dew_point", "mean", "1h", "value"),
    ],
  },
  // 2 — Tagesregen (30 Tage), bars, diff⁺+sum /1d (rainCounter handled in flux)
  {
    id: "perm-2",
    title: "Tagesregen (30 Tage)",
    chart: "bars",
    timeRange: { start: "-30d", stop: "now" },
    series: [s("perm-2-s0", "Regenmenge", "rainfall", "sum", "1d", "value")],
  },
  // 3 — Regenrate, line (Area), -24h, mean/1h
  {
    id: "perm-3",
    title: "Regenrate",
    chart: "line",
    timeRange: { start: "-24h", stop: "now" },
    series: [s("perm-3-s0", "Regenrate", "rain_rate", "mean", "1h", "value")],
  },
  // 4 — Windrose, -7d
  {
    id: "perm-4",
    title: "Windrose (7 Tage)",
    chart: "windrose",
    timeRange: { start: "-7d", stop: "now" },
    series: [
      s("perm-4-dir", "Windrichtung", "wind_direction", "mean", "1h", "direction"),
      s("perm-4-mag", "Windgeschwindigkeit", "wind_speed", "mean", "1h", "magnitude"),
    ],
  },
  // 5 — Wind & Böen (2 Serien), -24h, mean/max /1h
  {
    id: "perm-5",
    title: "Wind & Böen",
    chart: "line",
    timeRange: { start: "-24h", stop: "now" },
    series: [
      s("perm-5-s0", "Wind", "wind_speed", "mean", "1h", "value"),
      s("perm-5-s1", "Böen", "wind_gust", "max", "1h", "value"),
    ],
  },
  // 6 — Luftdruck, line, -24h, mean/1h
  {
    id: "perm-6",
    title: "Luftdruck",
    chart: "line",
    timeRange: { start: "-24h", stop: "now" },
    series: [s("perm-6-s0", "Luftdruck", "pressure", "mean", "1h", "value")],
  },
  // 7 — Luftfeuchte, line, -24h, mean/1h
  {
    id: "perm-7",
    title: "Luftfeuchte",
    chart: "line",
    timeRange: { start: "-24h", stop: "now" },
    series: [s("perm-7-s0", "Luftfeuchte", "outdoor_humidity", "mean", "1h", "value")],
  },
  // 8 — Sonnenstrahlung (Area + Linie), -24h, mean/max /1h
  {
    id: "perm-8",
    title: "Sonnenstrahlung",
    chart: "line",
    timeRange: { start: "-24h", stop: "now" },
    series: [
      s("perm-8-s0", "Solarstrahlung", "solar_radiation", "mean", "1h", "value"),
      s("perm-8-s1", "Max. Solarstrahlung", "max_solar_radiation", "max", "1h", "value"),
    ],
  },
  // 9 — UV-Index (Area), -24h, max/1h
  {
    id: "perm-9",
    title: "UV-Index",
    chart: "line",
    timeRange: { start: "-24h", stop: "now" },
    series: [s("perm-9-s0", "UV-Index", "uv_index", "max", "1h", "value")],
  },
  // 10 — Min/Max Außentemp (30 T), 3 Serien min/mean/max, -30d, /1d
  {
    id: "perm-10",
    title: "Min/Max Außentemperatur (30 Tage)",
    chart: "line",
    timeRange: { start: "-30d", stop: "now" },
    series: [
      s("perm-10-min", "Min", "outdoor_temperature", "min", "1d", "value"),
      s("perm-10-mean", "Mittel", "outdoor_temperature", "mean", "1d", "value"),
      s("perm-10-max", "Max", "outdoor_temperature", "max", "1d", "value"),
    ],
  },
];
