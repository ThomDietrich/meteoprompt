/**
 * Hand-curated catalog of the available weather metrics.
 *
 * The bucket `your-bucket` holds the whole HA instance (~29.8k entities),
 * so we never dump the raw schema to Claude — instead this committed catalog of the
 * canonical WeeWX/Ecowitt station `garten_ventus_w830_*` (~4.6 years of history,
 * migrated onto these entity_ids) is the single source of truth. See docs/iterations
 * spec-02 §5 and docs/data-quality-influxdb.md.
 *
 * entityId = `garten_ventus_w830_<slug>`. The numeric field is always `_field == "value"`
 * (each entity also carries a non-numeric `_field == "state"` that we never read here).
 * `rainCounter: true` marks daily-accumulator metrics (rain + evapotranspiration) that
 * must be read via difference(nonNegative)+sum, never summed raw. See
 * docs/data-quality-influxdb.md.
 *
 * The station now publishes once per 5-min archive record (no LOOP over-sampling), so
 * the old per-interval `dedupSum` workaround is gone — amounts are read from their clean
 * daily accumulator instead. NOTE: InfluxDB also holds FROZEN legacy `garten_ventus_w830_*`
 * series with English slugs (`outdoor_temperature`, `wind_speed`, …) + artefacts (`*_2`,
 * `regen_24_h`, `regen_kumuliert`); only the German slugs below are canonical.
 *
 * Shared between client and server (no server-only dependency): the client uses
 * labels/units, the server uses entityId + rainCounter to build Flux.
 */

import type { Aggregation, ChartType } from "@/lib/query-spec";

export interface CatalogEntry {
  key: string; // stable, semantic catalog key (= QuerySpec metric)
  entityId: string; // garten_ventus_w830_*
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
  rainCounter?: boolean; // true → daily accumulator: read via difference(nonNegative)+sum
}

const PREFIX = "garten_ventus_w830_";

/** Build a catalog entry, prefixing the entityId slug with `garten_ventus_w830_`. */
function entry(
  key: string,
  slug: string,
  unit: string,
  labelDe: string,
  synonyms: string[],
  defaultAggregation: Aggregation,
  defaultWindow: string,
  defaultChart: ChartType,
  category: CatalogEntry["category"],
  rainCounter?: boolean,
): CatalogEntry {
  return {
    key,
    entityId: PREFIX + slug,
    field: "value",
    unit,
    labelDe,
    synonyms,
    defaultAggregation,
    defaultWindow,
    defaultChart,
    category,
    ...(rainCounter ? { rainCounter: true } : {}),
  };
}

export const CATALOG: CatalogEntry[] = [
  // ── Temperatur ──────────────────────────────────────────────────────────
  entry("outdoor_temperature", "aussentemperatur", "°C", "Außentemperatur", ["außentemperatur", "aussentemperatur", "temperatur", "draußen", "draussen", "temp", "outdoor temperature"], "mean", "1h", "line", "temperatur"),
  entry("indoor_temperature", "innentemperatur", "°C", "Innentemperatur", ["innen", "innentemperatur", "drinnen", "indoor temp", "indoor temperature"], "mean", "1h", "line", "temperatur"),
  entry("apparent_temperature", "gefuhlte_temperatur", "°C", "Gefühlte Temperatur", ["gefühlt", "gefuehlt", "gefühlte temperatur", "apparent", "apparent temperature"], "mean", "1h", "line", "temperatur"),
  entry("dew_point", "taupunkt", "°C", "Taupunkt", ["taupunkt", "dew point", "dewpoint"], "mean", "1h", "line", "temperatur"),
  entry("indoor_dew_point", "taupunkt_innen", "°C", "Taupunkt innen", ["taupunkt innen", "indoor dew point"], "mean", "1h", "line", "temperatur"),
  entry("heat_index", "hitzeindex", "°C", "Hitzeindex", ["hitzeindex", "heat index"], "mean", "1h", "line", "temperatur"),
  entry("humidex", "humidex", "°C", "Humidex", ["humidex", "schwüle", "schwuele"], "mean", "1h", "line", "temperatur"),
  entry("wind_chill", "windkuhle", "°C", "Windchill", ["windchill", "wind chill", "gefühlte kälte", "gefuehlte kaelte", "windkühle", "windkuehle"], "mean", "1h", "line", "temperatur"),
  entry("outdoor_temp_18h_max", "aussentemperatur_maximum_18h", "°C", "Außentemp. 18 h-Max", ["tageshöchst", "tageshoechst", "höchsttemperatur", "hoechsttemperatur", "max temperature"], "max", "1h", "line", "temperatur"),
  entry("outdoor_temp_18h_min", "aussentemperatur_minimum_18h", "°C", "Außentemp. 18 h-Min", ["tagestiefst", "tiefsttemperatur", "min temperature"], "min", "1h", "line", "temperatur"),

  // ── Feuchte ─────────────────────────────────────────────────────────────
  entry("outdoor_humidity", "luftfeuchte", "%", "Luftfeuchte (außen)", ["luftfeuchte", "feuchte", "humidity", "luftfeuchtigkeit", "feuchtigkeit"], "mean", "1h", "line", "feuchte"),
  entry("indoor_humidity", "luftfeuchte_innen", "%", "Luftfeuchte (innen)", ["innenfeuchte", "indoor humidity", "luftfeuchte innen"], "mean", "1h", "line", "feuchte"),

  // ── Wind ────────────────────────────────────────────────────────────────
  // Wind speed/gust are m/s (feed runs WeeWX unit_system METRICWX; the InfluxDB
  // `_measurement`/HA unit label "km/h" is stale — values are m/s throughout history).
  entry("wind_speed", "windgeschwindigkeit", "m/s", "Windgeschwindigkeit", ["wind", "windgeschwindigkeit", "wind speed", "windstärke", "windstaerke"], "mean", "1h", "windrose", "wind"),
  entry("wind_gust", "boengeschwindigkeit", "m/s", "Windböen", ["böen", "boeen", "gust", "wind gust", "windböen", "windboeen", "böengeschwindigkeit", "boengeschwindigkeit"], "max", "1h", "line", "wind"),
  entry("wind_direction", "windrichtung", "°", "Windrichtung", ["windrichtung", "richtung", "wind direction"], "mean", "1h", "windrose", "wind"),
  entry("wind_gust_direction", "boenrichtung", "°", "Windböen-Richtung", ["böenrichtung", "boeenrichtung", "boenrichtung", "gust direction"], "mean", "1h", "windrose", "wind"),
  entry("wind_run", "windweg", "km", "Windweg (Tag)", ["windweg", "wind run"], "max", "1d", "bars", "wind"),

  // ── Niederschlag ────────────────────────────────────────────────────────
  entry("rainfall", "regen_tag", "mm", "Niederschlag (Regenmenge)", ["regen", "niederschlag", "regenmenge", "rain", "rainfall"], "sum", "1d", "bars", "niederschlag", true),
  entry("rain_rate", "regenrate", "mm/h", "Regenrate", ["regenrate", "regenintensität", "regenintensitaet", "rain rate"], "mean", "1h", "line", "niederschlag"),
  // rain_1h / rain_24h are rolling gauges; the spec lists "last" but QuerySpec.Aggregation
  // has no 'last' in v2 — use 'max' over the window (a rolling sum's window-max ≈ its last value).
  entry("rain_1h", "regen_stunde", "mm", "Regen (letzte Stunde)", ["stundenregen", "letzte stunde", "rain last hour"], "max", "1h", "line", "niederschlag"),
  entry("rain_24h", "regen_24h", "mm", "Regen (24 h rollierend)", ["24h regen", "24 stunden regen", "rain 24h"], "max", "1h", "line", "niederschlag"),
  // Trockenperiode: instant "days since last rain" gauge (resets to 0 on rain) —
  // NOT an accumulator; the sawtooth over time shows dry spells. Forward-only
  // history (new derived series ~from 2026-07). Synonyms are collision-free (new domain).
  entry("dry_spell", "trockenperiode", "d", "Trockenperiode", ["trockenperiode", "trockenheit", "trockenpause", "trockenphase", "tage ohne regen", "dry spell", "dry period"], "max", "1d", "line", "niederschlag"),

  // ── Druck ───────────────────────────────────────────────────────────────
  entry("pressure", "luftdruck_absolut_qfe", "hPa", "Luftdruck", ["luftdruck", "druck", "pressure", "qfe"], "mean", "1h", "line", "druck"),
  entry("barometer", "luftdruck_meereshohe_qff", "hPa", "Luftdruck (Barometer)", ["barometer", "meereshöhe", "meereshoehe", "qff"], "mean", "1h", "line", "druck"),
  entry("altimeter", "luftdruck_altimeter_qnh", "hPa", "Luftdruck (Höhenmesser)", ["höhenmesser", "hoehenmesser", "altimeter", "qnh"], "mean", "1h", "line", "druck"),

  // ── Strahlung ───────────────────────────────────────────────────────────
  entry("solar_radiation", "sonnenstrahlung", "W/m²", "Solarstrahlung", ["solar", "sonne", "einstrahlung", "solarstrahlung", "sonnenstrahlung", "solar radiation"], "mean", "1h", "line", "strahlung"),
  entry("max_solar_radiation", "sonnenstrahlung_maximum", "W/m²", "Max. Solarstrahlung", ["max solar", "max solar radiation"], "max", "1h", "line", "strahlung"),
  entry("uv_index", "uv_index", "–", "UV-Index", ["uv", "uv-index", "uv index"], "max", "1h", "line", "strahlung"),
  entry("cloud_base", "wolkenuntergrenze", "m", "Wolkenbasis-Höhe", ["wolken", "wolkenbasis", "cloud base", "wolkenbasis-höhe", "wolkenuntergrenze"], "mean", "1h", "line", "strahlung"),
  // Sonnenscheindauer: monotone daily accumulator in HOURS (reset midnight) → read
  // like rain (rainCounter: difference(nonNegative)+sum) for daily totals; the KPI
  // reads last() = hours so far today. Avoids the "sonne"/"sonnenstrahlung" synonyms
  // (owned by solar_radiation). Forward-only history (~from 2026-07).
  entry("sunshine_duration", "sonnenscheindauer_tag", "h", "Sonnenscheindauer", ["sonnenschein", "sonnenstunden", "sonnenscheindauer", "sunshine", "sunshine hours", "sonnendauer"], "sum", "1d", "bars", "strahlung", true),

  // ── Verdunstung ─────────────────────────────────────────────────────────
  // WeeWX `ET` is a per-interval delta (summable like rain). The station now publishes
  // one clean value per 5-min archive record (no HA over-sampling) AND exposes a monotonic
  // daily accumulator `evapotranspiration_tag` (reset at midnight, replacing the old broken
  // `dayET`). So ET is read exactly like rain: difference(nonNegative)+sum over the daily
  // accumulator — robust to any residual duplicate writes. See docs/data-quality-influxdb.md §4.
  entry("evapotranspiration", "evapotranspiration_tag", "mm", "Evapotranspiration", ["verdunstung", "evapotranspiration", "et", "verdunstungsrate", "evaporation"], "sum", "1d", "bars", "verdunstung", true),
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
