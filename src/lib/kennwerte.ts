/**
 * The 18 Kennwerte (live values) shown in the header pill row (spec-03 §4).
 *
 * Shared between the server route (which keys/units it resolves) and the client
 * row (labels + icon names). Icon names map to lucide-react components on the
 * client. Each entry references a catalog key — `entityId`/`unit` are looked up
 * from the catalog server-side so the entity whitelist stays single-sourced.
 */

/**
 * How a Kennwert's primary value is read:
 * - `latest` — last() over a short (-6h) window; for continuously-updating live values.
 * - `rainToday` — today-scoped max() of the rain daily accumulator (regen_tag).
 * - `gauge` — last() over a WIDE (-3d) window; for slowly/on-change-updating counters
 *   (e.g. `trockenperiode`, days-since-rain) whose last write may be >6h old.
 * - `todayTotal` — today-scoped max() of a daily accumulator (e.g. `sonnenscheindauer_tag`,
 *   hours of sunshine so far today); generalises `rainToday` to any daily accumulator.
 * - `lastShower` — the station's last rain event: amount (`regen_letzter_schauer`, mm) as
 *   the value, plus begin/end (`regen_schauerbeginn/-ende`, ISO `_field == "state"`) and
 *   duration (`regen_schauerdauer`, min) formatted into the secondary line. Bespoke —
 *   these entities are NOT in the metric catalog (event values, not chartable series).
 * - `rainWeek` / `rainMonth` — rain since the start of the local calendar week / month,
 *   from the robust `regen_tag` accumulator (difference+sum over the truncated range).
 * - `connection` — station connectivity (`verbindung`, on/off `_field == "state"`) as a
 *   text status ("Online"/"Offline"), not a number.
 */
export type KennwertAggregation =
  | "latest"
  | "rainToday"
  | "gauge"
  | "todayTotal"
  | "lastShower"
  | "rainWeek"
  | "rainMonth"
  | "connection";

/**
 * Today's secondary context shown under a Kennwert: today's low/high
 * (`todayMinMax`), today's peak (`todayMax`), or — for wind direction — the
 * directional `steadiness` (constancy 0–100 %, spec-10). For the local calendar
 * day (Europe/Berlin). Server-resolved and pre-formatted into the `secondary`
 * string; absent on cells without a secondary.
 */
export type KennwertSecondary =
  | "todayMinMax"
  | "todayMax"
  | "steadiness"
  | "sunshinePct"; // sunshine so far today as % of the astronomical day length

export interface KennwertDef {
  key: string; // catalog key
  label: string; // short German label
  icon: string; // lucide-react icon component name
  aggregation: KennwertAggregation;
  /** wind_direction also gets a compass abbreviation appended to the value. */
  compass?: boolean;
  /** Today's low/high (or just peak) shown as a muted second line (spec-09 A). */
  secondary?: KennwertSecondary;
}

export const KENNWERTE: KennwertDef[] = [
  { key: "outdoor_temperature", label: "Außentemperatur", icon: "Thermometer", aggregation: "latest", secondary: "todayMinMax" },
  { key: "apparent_temperature", label: "Gefühlt", icon: "ThermometerSun", aggregation: "latest" },
  { key: "dew_point", label: "Taupunkt", icon: "Droplets", aggregation: "latest" },
  { key: "outdoor_humidity", label: "Luftfeuchte", icon: "Droplet", aggregation: "latest", secondary: "todayMinMax" },
  { key: "wind_speed", label: "Wind", icon: "Wind", aggregation: "latest" },
  { key: "wind_gust", label: "Böen", icon: "Gauge", aggregation: "latest", secondary: "todayMax" },
  { key: "wind_direction", label: "Windrichtung", icon: "Compass", aggregation: "latest", compass: true, secondary: "steadiness" },
  { key: "rainfall", label: "Regen heute", icon: "CloudRain", aggregation: "rainToday" },
  { key: "rain_rate", label: "Regenrate", icon: "CloudDrizzle", aggregation: "latest" },
  { key: "dry_spell", label: "Trockenperiode", icon: "CalendarOff", aggregation: "gauge" },
  { key: "last_shower", label: "Letzter Schauer", icon: "CloudRainWind", aggregation: "lastShower" },
  { key: "rain_week", label: "Regen (Woche)", icon: "Umbrella", aggregation: "rainWeek" },
  { key: "rain_month", label: "Regen (Monat)", icon: "Umbrella", aggregation: "rainMonth" },
  { key: "pressure", label: "Luftdruck", icon: "Gauge", aggregation: "latest", secondary: "todayMinMax" },
  { key: "solar_radiation", label: "Sonne", icon: "Sun", aggregation: "latest", secondary: "todayMax" },
  { key: "sunshine_duration", label: "Sonnenstunden", icon: "SunDim", aggregation: "todayTotal", secondary: "sunshinePct" },
  { key: "uv_index", label: "UV", icon: "SunMedium", aggregation: "latest", secondary: "todayMax" },
  { key: "connection", label: "Station", icon: "Antenna", aggregation: "connection" },
];

/** One resolved live value (server → client). */
export interface KennwertValue {
  key: string;
  label: string;
  unit: string;
  value: number | null;
  /** Compass abbreviation for wind_direction; otherwise undefined. */
  compass?: string;
  /** Text status shown INSTEAD of the numeric value (e.g. "Online"/"Offline"). */
  text?: string;
  /** Health flag for a `text` status: true → green, false → red/amber styling. */
  ok?: boolean;
  /** Pre-formatted today low/high (or peak), e.g. "↓ 12 ↑ 24"; absent when N/A. */
  secondary?: string;
  /** Hover tooltip for the secondary (e.g. the times of today's low/high). */
  secondaryTitle?: string;
  t: string | null; // ISO timestamp of the reading
}

/** Response shape for GET /api/now — the resolved live Kennwerte values. */
export interface NowResponse {
  values: KennwertValue[];
}

/** Response shape for GET /api/overview (spec-06 E — Wetterlage-Überblick). */
export interface OverviewResponse {
  /** 1–3-sentence German overview, or omitted when unavailable. */
  overview?: string;
}
