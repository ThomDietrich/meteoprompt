import { WAPPEN_PALETTE } from "@/lib/colors";
import type { Aggregation, ChartSpec, Series } from "@/lib/query-spec";

/**
 * The 12 predefined ChartSpecs of the permanent "Stations-Dashboard"
 * (spec-04 §8). A broad mix of chart types now — rangeBand, bars, line/area,
 * windrose, scatter, candlestick, calendar + hour×weekday heatmaps — each with
 * CURATED (fixed) colours from the Wappen palette. Random colours are only for
 * user cards; these stay stable. Resolved through the existing /api/chart path.
 */

// Curated palette shortcuts (Wappen tones).
const BLUE = WAPPEN_PALETTE[1]; // #1F5BA8
const BLUE_LIGHT = WAPPEN_PALETTE[0]; // #3E86D8
const GOLD = WAPPEN_PALETTE[4]; // #F2A81C
const GREEN = WAPPEN_PALETTE[7]; // #2E9D46
const ACCENT = WAPPEN_PALETTE[10]; // #C2492E

/** Build a metric series tersely, with an optional curated colour + role. */
function s(
  id: string,
  label: string,
  metric: string,
  aggregation: Aggregation,
  window: string,
  opts: { role?: Series["role"]; color?: string } = {},
): Series {
  return {
    id,
    label,
    ...(opts.role ? { role: opts.role } : {}),
    ...(opts.color ? { color: opts.color } : {}),
    source: { kind: "metric", metric, aggregation, window },
  };
}

export const PERMANENT_CHARTS: ChartSpec[] = [
  // 1 — Temperatur-Band & Mittel (24h) → rangeBand
  {
    id: "perm-1",
    title: "Temperatur — Band & Mittel (24h)",
    chart: "rangeBand",
    timeRange: { start: "-24h", stop: "now" },
    series: [s("perm-1-s0", "Außentemperatur", "outdoor_temperature", "mean", "1h", { color: GOLD })],
  },
  // 2 — Tagesregen (30 T) → bars
  {
    id: "perm-2",
    title: "Tagesregen (30 Tage)",
    chart: "bars",
    timeRange: { start: "-30d", stop: "now" },
    series: [s("perm-2-s0", "Regenmenge", "rainfall", "sum", "1d", { color: BLUE })],
  },
  // 3 — Regenrate (24h) → line/area
  {
    id: "perm-3",
    title: "Regenrate (24h)",
    chart: "line",
    timeRange: { start: "-24h", stop: "now" },
    series: [s("perm-3-s0", "Regenrate", "rain_rate", "mean", "1h", { color: BLUE_LIGHT })],
  },
  // 4 — Windrose (7 T)
  {
    id: "perm-4",
    title: "Windrose (7 Tage)",
    chart: "windrose",
    timeRange: { start: "-7d", stop: "now" },
    series: [
      s("perm-4-dir", "Windrichtung", "wind_direction", "mean", "1h", { role: "direction" }),
      s("perm-4-mag", "Windgeschwindigkeit", "wind_speed", "mean", "1h", { role: "magnitude" }),
    ],
  },
  // 5 — Wind & Böen (24h) → line (2 Serien)
  {
    id: "perm-5",
    title: "Wind & Böen (24h)",
    chart: "line",
    timeRange: { start: "-24h", stop: "now" },
    series: [
      s("perm-5-s0", "Wind", "wind_speed", "mean", "1h", { color: GREEN }),
      s("perm-5-s1", "Böen", "wind_gust", "max", "1h", { color: ACCENT }),
    ],
  },
  // 6 — Luftdruck (24h) → line + markLine Ø (single-series line shows markLines)
  {
    id: "perm-6",
    title: "Luftdruck (24h)",
    chart: "line",
    timeRange: { start: "-24h", stop: "now" },
    series: [s("perm-6-s0", "Luftdruck", "pressure", "mean", "1h", { color: BLUE })],
  },
  // 7 — Luftfeuchte (24h) → line/area
  {
    id: "perm-7",
    title: "Luftfeuchte (24h)",
    chart: "line",
    timeRange: { start: "-24h", stop: "now" },
    series: [s("perm-7-s0", "Luftfeuchte", "outdoor_humidity", "mean", "1h", { color: GREEN })],
  },
  // 8 — Sonnenstrahlung (24h) → line (Ist + Max)
  {
    id: "perm-8",
    title: "Sonnenstrahlung (24h)",
    chart: "line",
    timeRange: { start: "-24h", stop: "now" },
    series: [
      s("perm-8-s0", "Solarstrahlung", "solar_radiation", "mean", "1h", { color: GOLD }),
      s("perm-8-s1", "Max. Solarstrahlung", "max_solar_radiation", "max", "1h", { color: BLUE_LIGHT }),
    ],
  },
  // 9 — Temperatur × Luftfeuchte (7 T) → scatter
  {
    id: "perm-9",
    title: "Temperatur × Luftfeuchte (7 Tage)",
    chart: "scatter",
    timeRange: { start: "-7d", stop: "now" },
    series: [
      s("perm-9-x", "Temperatur", "outdoor_temperature", "mean", "1h", { role: "x", color: ACCENT }),
      s("perm-9-y", "Luftfeuchte", "outdoor_humidity", "mean", "1h", { role: "y" }),
    ],
  },
  // 10 — Tages-Temperaturspanne (30 T) → candlestick
  {
    id: "perm-10",
    title: "Tages-Temperaturspanne (30 Tage)",
    chart: "candlestick",
    timeRange: { start: "-30d", stop: "now" },
    series: [s("perm-10-s0", "Außentemperatur", "outdoor_temperature", "mean", "1d", { color: GOLD })],
  },
  // 11 — Temperatur — Jahres-Heatmap → heatmapCalendar
  {
    id: "perm-11",
    title: "Temperatur — Jahres-Heatmap",
    chart: "heatmapCalendar",
    timeRange: { start: "-365d", stop: "now" },
    binning: "calendar",
    series: [s("perm-11-s0", "Außentemperatur", "outdoor_temperature", "mean", "1d")],
  },
  // 12 — Tagesgang Temperatur (Stunde × Wochentag) → heatmapHourDay
  {
    id: "perm-12",
    title: "Tagesgang Temperatur (Stunde × Wochentag)",
    chart: "heatmapHourDay",
    timeRange: { start: "-30d", stop: "now" },
    binning: "hourOfDay×weekday",
    series: [s("perm-12-s0", "Außentemperatur", "outdoor_temperature", "mean", "1h")],
  },
  // 13 — Evapotranspiration (30 T) → daily bars (dedup-sum, ~5 mm/Sommer-Tag)
  {
    id: "perm-13",
    title: "Evapotranspiration (30 Tage)",
    chart: "bars",
    timeRange: { start: "-30d", stop: "now" },
    series: [s("perm-13-s0", "Evapotranspiration", "evapotranspiration", "sum", "1d", { color: GREEN })],
  },
];
