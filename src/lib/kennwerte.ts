/**
 * The 12 Kennwerte (live values) shown in the header pill row (spec-03 §4).
 *
 * Shared between the server route (which keys/units it resolves) and the client
 * row (labels + icon names). Icon names map to lucide-react components on the
 * client. Each entry references a catalog key — `entityId`/`unit` are looked up
 * from the catalog server-side so the entity whitelist stays single-sourced.
 */

export type KennwertAggregation = "latest" | "rainToday";

export interface KennwertDef {
  key: string; // catalog key
  label: string; // short German label
  icon: string; // lucide-react icon component name
  aggregation: KennwertAggregation;
  /** wind_direction also gets a compass abbreviation appended to the value. */
  compass?: boolean;
}

export const KENNWERTE: KennwertDef[] = [
  { key: "outdoor_temperature", label: "Außentemperatur", icon: "Thermometer", aggregation: "latest" },
  { key: "apparent_temperature", label: "Gefühlt", icon: "ThermometerSun", aggregation: "latest" },
  { key: "dew_point", label: "Taupunkt", icon: "Droplets", aggregation: "latest" },
  { key: "outdoor_humidity", label: "Luftfeuchte", icon: "Droplet", aggregation: "latest" },
  { key: "wind_speed", label: "Wind", icon: "Wind", aggregation: "latest" },
  { key: "wind_gust", label: "Böen", icon: "Gauge", aggregation: "latest" },
  { key: "wind_direction", label: "Windrichtung", icon: "Compass", aggregation: "latest", compass: true },
  { key: "rainfall", label: "Regen heute", icon: "CloudRain", aggregation: "rainToday" },
  { key: "rain_rate", label: "Regenrate", icon: "CloudDrizzle", aggregation: "latest" },
  { key: "pressure", label: "Luftdruck", icon: "Gauge", aggregation: "latest" },
  { key: "solar_radiation", label: "Sonne", icon: "Sun", aggregation: "latest" },
  { key: "uv_index", label: "UV", icon: "SunMedium", aggregation: "latest" },
];

/** One resolved live value (server → client). */
export interface KennwertValue {
  key: string;
  label: string;
  unit: string;
  value: number | null;
  /** Compass abbreviation for wind_direction; otherwise undefined. */
  compass?: string;
  t: string | null; // ISO timestamp of the reading
}

export interface NowResponse {
  values: KennwertValue[];
}
