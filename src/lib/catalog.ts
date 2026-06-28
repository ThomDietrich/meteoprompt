/**
 * Hand-curated catalog of the available weather metrics.
 *
 * The bucket `your-bucket` holds the whole HA instance (~29.8k entities),
 * so we never dump the raw schema to Claude — instead this committed catalog of the
 * canonical WeeWX/Ecowitt station `weather_station_*` (data since 2021-10-18) is the
 * single source of truth. See docs/iterations spec-02 §5 and docs/data-quality-influxdb.md.
 *
 * entityId = `weather_station_<suffix>`. The numeric field is always `_field == "value"`.
 * `rainCounter: true` marks daily-accumulator metrics that must be read via
 * difference(nonNegative)+sum (§7), never summed raw.
 * `dedupSum: true` marks per-interval metrics that Home Assistant OVER-SAMPLES
 * (duplicate writes), so they must be read via dedup(`dedupWindow` last)+sum,
 * never summed raw (a naive sum over-counts). See docs/data-quality-influxdb.md.
 *
 * Shared between client and server (no server-only dependency): the client uses
 * labels/units, the server uses entityId + rainCounter/dedupSum to build Flux.
 */

import type { Aggregation, ChartType } from "@/lib/query-spec";

export interface CatalogEntry {
  key: string; // stable, semantic catalog key (= QuerySpec metric)
  entityId: string; // weather_station_*
  field: "value";
  unit: string;
  labelDe: string;
  synonyms: string[]; // DE+EN, lowercase
  defaultAggregation: Aggregation; // physically correct per metric
  defaultWindow: string;
  defaultChart: ChartType;
  category:
    | "temperatur"
    | "feuchte"
    | "wind"
    | "niederschlag"
    | "druck"
    | "strahlung"
    | "verdunstung";
  rainCounter?: boolean; // true → daily accumulator: read via difference(nonNegative)+sum (§7)
  dedupSum?: boolean; // true → HA over-sampled per-interval metric: dedup(dedupWindow last)+sum
  dedupWindow?: string; // dedup window for dedupSum (= station archive interval, default "5m")
}

const PREFIX = "weather_station_";

/** Build a catalog entry, prefixing the entityId suffix with `weather_station_`. */
function entry(
  key: string,
  suffix: string,
  unit: string,
  labelDe: string,
  synonyms: string[],
  defaultAggregation: Aggregation,
  defaultWindow: string,
  defaultChart: ChartType,
  category: CatalogEntry["category"],
  rainCounter?: boolean,
  dedupSum?: boolean,
  dedupWindow = "5m",
): CatalogEntry {
  return {
    key,
    entityId: PREFIX + suffix,
    field: "value",
    unit,
    labelDe,
    synonyms,
    defaultAggregation,
    defaultWindow,
    defaultChart,
    category,
    ...(rainCounter ? { rainCounter: true } : {}),
    ...(dedupSum ? { dedupSum: true, dedupWindow } : {}),
  };
}

export const CATALOG: CatalogEntry[] = [
  // ── Temperatur ──────────────────────────────────────────────────────────
  entry("outdoor_temperature", "outtemp_c", "°C", "Außentemperatur", ["außentemperatur", "aussentemperatur", "temperatur", "draußen", "draussen", "temp", "outdoor temperature"], "mean", "1h", "line", "temperatur"),
  entry("indoor_temperature", "intemp_c", "°C", "Innentemperatur", ["innen", "innentemperatur", "drinnen", "indoor temp", "indoor temperature"], "mean", "1h", "line", "temperatur"),
  entry("apparent_temperature", "apptemp_c", "°C", "Gefühlte Temperatur", ["gefühlt", "gefuehlt", "gefühlte temperatur", "apparent", "apparent temperature"], "mean", "1h", "line", "temperatur"),
  entry("dew_point", "dewpoint_c", "°C", "Taupunkt", ["taupunkt", "dew point", "dewpoint"], "mean", "1h", "line", "temperatur"),
  entry("indoor_dew_point", "indewpoint_c", "°C", "Taupunkt innen", ["taupunkt innen", "indoor dew point"], "mean", "1h", "line", "temperatur"),
  entry("heat_index", "heatindex_c", "°C", "Hitzeindex", ["hitzeindex", "heat index"], "mean", "1h", "line", "temperatur"),
  entry("humidex", "humidex_c", "°C", "Humidex", ["humidex", "schwüle", "schwuele"], "mean", "1h", "line", "temperatur"),
  entry("wind_chill", "windchill_c", "°C", "Windchill", ["windchill", "wind chill", "gefühlte kälte", "gefuehlte kaelte"], "mean", "1h", "line", "temperatur"),
  entry("outdoor_temp_18h_max", "outtemp_c_18h_max", "°C", "Außentemp. 18 h-Max", ["tageshöchst", "tageshoechst", "höchsttemperatur", "hoechsttemperatur", "max temperature"], "max", "1h", "line", "temperatur"),
  entry("outdoor_temp_18h_min", "outtemp_c_18h_min", "°C", "Außentemp. 18 h-Min", ["tagestiefst", "tiefsttemperatur", "min temperature"], "min", "1h", "line", "temperatur"),

  // ── Feuchte ─────────────────────────────────────────────────────────────
  entry("outdoor_humidity", "outhumidity", "%", "Luftfeuchte (außen)", ["luftfeuchte", "feuchte", "humidity", "luftfeuchtigkeit", "feuchtigkeit"], "mean", "1h", "line", "feuchte"),
  entry("indoor_humidity", "inhumidity", "%", "Luftfeuchte (innen)", ["innenfeuchte", "indoor humidity", "luftfeuchte innen"], "mean", "1h", "line", "feuchte"),

  // ── Wind ────────────────────────────────────────────────────────────────
  entry("wind_speed", "windspeed_kph", "km/h", "Windgeschwindigkeit", ["wind", "windgeschwindigkeit", "wind speed", "windstärke", "windstaerke"], "mean", "1h", "windrose", "wind"),
  entry("wind_gust", "windgust_kph", "km/h", "Windböen", ["böen", "boeen", "gust", "wind gust", "windböen", "windboeen"], "max", "1h", "line", "wind"),
  entry("wind_direction", "winddir", "°", "Windrichtung", ["windrichtung", "richtung", "wind direction"], "mean", "1h", "windrose", "wind"),
  entry("wind_gust_direction", "windgustdir", "°", "Windböen-Richtung", ["böenrichtung", "boeenrichtung", "gust direction"], "mean", "1h", "windrose", "wind"),
  entry("wind_run", "windrun_km", "km", "Windweg (Tag)", ["windweg", "wind run"], "max", "1d", "bars", "wind"),

  // ── Niederschlag ────────────────────────────────────────────────────────
  entry("rainfall", "dayrain_mm", "mm", "Niederschlag (Regenmenge)", ["regen", "niederschlag", "regenmenge", "rain", "rainfall"], "sum", "1d", "bars", "niederschlag", true),
  entry("rain_rate", "rainrate_mm_per_hour", "mm/h", "Regenrate", ["regenrate", "regenintensität", "regenintensitaet", "rain rate"], "mean", "1h", "line", "niederschlag"),
  // rain_1h / rain_24h are rolling gauges; the spec lists "last" but QuerySpec.Aggregation
  // has no 'last' in v2 — use 'max' over the window (a rolling sum's window-max ≈ its last value).
  entry("rain_1h", "hourrain_mm", "mm", "Regen (letzte Stunde)", ["stundenregen", "letzte stunde", "rain last hour"], "max", "1h", "line", "niederschlag"),
  entry("rain_24h", "rain24_mm", "mm", "Regen (24 h rollierend)", ["24h regen", "24 stunden regen", "rain 24h"], "max", "1h", "line", "niederschlag"),

  // ── Druck ───────────────────────────────────────────────────────────────
  entry("pressure", "pressure_mbar", "hPa", "Luftdruck", ["luftdruck", "druck", "pressure"], "mean", "1h", "line", "druck"),
  entry("barometer", "barometer_mbar", "hPa", "Luftdruck (Barometer)", ["barometer"], "mean", "1h", "line", "druck"),
  entry("altimeter", "altimeter_mbar", "hPa", "Luftdruck (Höhenmesser)", ["höhenmesser", "hoehenmesser", "altimeter"], "mean", "1h", "line", "druck"),

  // ── Strahlung ───────────────────────────────────────────────────────────
  entry("solar_radiation", "radiation_wpm2", "W/m²", "Solarstrahlung", ["solar", "sonne", "einstrahlung", "solarstrahlung", "solar radiation"], "mean", "1h", "line", "strahlung"),
  entry("max_solar_radiation", "maxsolarrad_wpm2", "W/m²", "Max. Solarstrahlung", ["max solar", "max solar radiation"], "max", "1h", "line", "strahlung"),
  entry("uv_index", "uv", "–", "UV-Index", ["uv", "uv-index", "uv index"], "max", "1h", "line", "strahlung"),
  entry("cloud_base", "cloudbase_meter", "m", "Wolkenbasis-Höhe", ["wolken", "wolkenbasis", "cloud base", "wolkenbasis-höhe"], "mean", "1h", "line", "strahlung"),

  // ── Verdunstung ─────────────────────────────────────────────────────────
  // WeeWX `ET` is a per-interval delta (summable like rain), but HA over-samples
  // it (~19× duplicate writes per 5-min archive interval), so it must be read
  // dedup(5m last)+sum — NOT summed raw (~90 mm/day, ~19× too high). The
  // `_dailysensor_mm` (dayET) accumulator is broken here (non-monotonic) — do not
  // use it. See docs/data-quality-influxdb.md §ET.
  entry("evapotranspiration", "evapotranspiration_mm", "mm", "Evapotranspiration", ["verdunstung", "evapotranspiration", "et", "verdunstungsrate", "evaporation"], "sum", "1d", "bars", "verdunstung", false, true, "5m"),
];

// ── Lookups ───────────────────────────────────────────────────────────────

const BY_KEY = new Map<string, CatalogEntry>(CATALOG.map((e) => [e.key, e]));

const BY_SYNONYM = new Map<string, CatalogEntry>();
for (const e of CATALOG) {
  // The key and the German label also count as lookup tokens.
  BY_SYNONYM.set(e.key.toLowerCase(), e);
  BY_SYNONYM.set(e.labelDe.toLowerCase(), e);
  for (const syn of e.synonyms) BY_SYNONYM.set(syn.toLowerCase(), e);
}

/** Look up a catalog entry by its canonical key. */
export function getByKey(key: string): CatalogEntry | undefined {
  return BY_KEY.get(key);
}

/** Look up a catalog entry by an exact synonym / key / label (case-insensitive). */
export function getBySynonym(token: string): CatalogEntry | undefined {
  return BY_SYNONYM.get(token.trim().toLowerCase());
}

/** All catalog keys (whitelist for validating Claude output). */
export function catalogKeys(): string[] {
  return [...BY_KEY.keys()];
}

/** 8-point German compass abbreviations, clockwise from North. */
const COMPASS_8 = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"] as const;

/** Map a wind-direction degree (0–360, 0 = N) to a German compass abbreviation. */
export function degreesToCompass(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  // Each sector spans 45°, centered on its compass point (N = -22.5..22.5).
  const idx = Math.floor(((normalized + 22.5) % 360) / 45);
  return COMPASS_8[idx];
}
