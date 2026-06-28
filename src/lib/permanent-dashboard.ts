import { WAPPEN_PALETTE } from "@/lib/colors";
import type { Aggregation, ChartSpec, Series } from "@/lib/query-spec";

/**
 * The permanent "Stations-Dashboard" (spec-07): the 16 predefined ChartSpecs are
 * organised into 5 thematic GROUP cards. Each group card renders its charts in a
 * responsive sub-grid, with a short STATIC German caption under every graph
 * (`PermanentDashboard`). A broad mix of chart types — rangeBand, bars, line/area,
 * windrose, scatter, candlestick, calendar + hour×weekday heatmaps, plus the new
 * showerBars — each with CURATED (fixed) colours from the Wappen palette. Random
 * colours are only for user cards; these stay stable. Resolved through the
 * existing /api/chart path (no Claude).
 *
 * spec-07 coverage changes vs. spec-04: REMOVED Regenrate (24h); ADDED Monatsregen
 * (12 Monate), Behaglichkeit (7 T), UV-Index (7 T) und Regen pro Schauer (90 T).
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

/** A graph block in a group card: its ChartSpec + a static, always-visible caption. */
export interface PermanentGraph {
  spec: ChartSpec;
  caption: string;
}

/** A thematic group card holding several graph blocks. */
export interface PermanentGroup {
  id: string;
  title: string;
  charts: PermanentGraph[];
}

/**
 * The 5 group cards in display order. Captions are the spec-07 §"Statische
 * Captions" source-of-truth strings (one sentence per graph, always visible).
 */
export const PERMANENT_GROUPS: PermanentGroup[] = [
  // ── 1) Temperatur ─────────────────────────────────────────────────────────
  {
    id: "temperatur",
    title: "Temperatur",
    charts: [
      {
        spec: {
          id: "perm-1",
          title: "Temperatur — Band & Mittel (24h)",
          chart: "rangeBand",
          timeRange: { start: "-24h", stop: "now" },
          series: [s("perm-1-s0", "Außentemperatur", "outdoor_temperature", "mean", "1h", { color: GOLD })],
        },
        caption:
          "Stundenmittel (Linie) mit Schwankungsband; breites Band = wechselhafte/klare Luft, schmales = ausgeglichen/bedeckt.",
      },
      {
        spec: {
          id: "perm-10",
          title: "Tages-Temperaturspanne (30 Tage)",
          chart: "candlestick",
          timeRange: { start: "-30d", stop: "now" },
          series: [s("perm-10-s0", "Außentemperatur", "outdoor_temperature", "mean", "1d", { color: GOLD })],
        },
        caption:
          "Jede Kerze = ein Tag, die Länge zeigt den Abstand Tageshöchst ↔ Nachttief — lange Kerzen = klare, trockene Luft, kurze = bedeckt/feucht.",
      },
      {
        spec: {
          id: "perm-12",
          title: "Tagesgang Temperatur (Stunde × Wochentag)",
          chart: "heatmapHourDay",
          timeRange: { start: "-30d", stop: "now" },
          binning: "hourOfDay×weekday",
          series: [s("perm-12-s0", "Außentemperatur", "outdoor_temperature", "mean", "1h")],
        },
        caption:
          "Durchschnittstemperatur nach Uhrzeit (Zeile) und Wochentag (Spalte) — so siehst du den typischen Tagesgang: warm am Nachmittag, kühl vor Sonnenaufgang.",
      },
      {
        spec: {
          id: "perm-11",
          title: "Temperatur — Jahres-Heatmap",
          chart: "heatmapCalendar",
          timeRange: { start: "-365d", stop: "now" },
          binning: "calendar",
          series: [s("perm-11-s0", "Außentemperatur", "outdoor_temperature", "mean", "1d")],
        },
        caption:
          "Jeder Tag des Jahres ein Feld, wärmer = röter — zeigt den Jahresverlauf und ungewöhnlich warme/kalte Tage auf einen Blick.",
      },
    ],
  },

  // ── 2) Feuchte & Behaglichkeit ────────────────────────────────────────────
  {
    id: "feuchte-behaglichkeit",
    title: "Feuchte & Behaglichkeit",
    charts: [
      {
        spec: {
          id: "perm-7",
          title: "Luftfeuchte (24h)",
          chart: "line",
          timeRange: { start: "-24h", stop: "now" },
          series: [s("perm-7-s0", "Luftfeuchte", "outdoor_humidity", "mean", "1h", { color: GREEN })],
        },
        caption:
          "Relative Luftfeuchte im Tagesverlauf — nachts meist hoch, nachmittags niedriger; dauerhaft über 90 % = feucht/Nebelgefahr, unter 30 % = sehr trocken.",
      },
      {
        spec: {
          id: "perm-9",
          title: "Temperatur × Luftfeuchte (7 Tage)",
          chart: "scatter",
          timeRange: { start: "-7d", stop: "now" },
          series: [
            s("perm-9-x", "Temperatur", "outdoor_temperature", "mean", "1h", { role: "x", color: ACCENT }),
            s("perm-9-y", "Luftfeuchte", "outdoor_humidity", "mean", "1h", { role: "y" }),
          ],
        },
        caption:
          "Jeder Punkt = eine Stunde; typisch ist heiß ↔ trocken (rechts unten). Punkte rechts oben (heiß UND feucht) bedeuten schwül/drückend.",
      },
      {
        spec: {
          id: "perm-behaglichkeit",
          title: "Behaglichkeit (7 Tage)",
          chart: "line",
          timeRange: { start: "-7d", stop: "now" },
          series: [
            s("perm-behag-s0", "Gefühlt", "apparent_temperature", "mean", "1h", { color: ACCENT }),
            s("perm-behag-s1", "Echt", "outdoor_temperature", "mean", "1h", { color: GOLD }),
            s("perm-behag-s2", "Taupunkt", "dew_point", "mean", "1h", { color: BLUE }),
          ],
        },
        caption:
          "Klaffen gefühlte und echte Temperatur auseinander, ist es schwül (Sommer) oder windkalt (Winter); ein Taupunkt über ~16 °C wirkt auf die meisten drückend.",
      },
    ],
  },

  // ── 3) Niederschlag & Verdunstung ─────────────────────────────────────────
  {
    id: "niederschlag-verdunstung",
    title: "Niederschlag & Verdunstung",
    charts: [
      {
        spec: {
          id: "perm-2",
          title: "Tagesregen (30 Tage)",
          chart: "bars",
          timeRange: { start: "-30d", stop: "now" },
          series: [s("perm-2-s0", "Regenmenge", "rainfall", "sum", "1d", { color: BLUE })],
        },
        caption:
          "Regenmenge pro Tag — hohe Balken = Starkregen-Tage, viele leere Tage = Trockenphase.",
      },
      {
        spec: {
          id: "perm-monatsregen",
          title: "Monatsregen (12 Monate)",
          chart: "bars",
          timeRange: { start: "-365d", stop: "now" },
          series: [s("perm-monthrain-s0", "Regenmenge", "rainfall", "sum", "1mo", { color: BLUE_LIGHT })],
        },
        caption:
          "Regensumme pro Monat im Jahresverlauf — zeigt nasse vs. trockene Monate und ob ein Monat über/unter dem üblichen Niveau liegt.",
      },
      {
        spec: {
          id: "perm-shower",
          title: "Regen pro Schauer (90 Tage)",
          chart: "showerBars",
          timeRange: { start: "-90d", stop: "now" },
          series: [s("perm-shower-s0", "Regen pro Schauer", "rainfall", "sum", "1d", { color: BLUE })],
        },
        caption:
          "Jeder Balken = ein zusammenhängender Regenschauer (durch ≥ 4 h Trockenheit getrennt), Höhe = Gesamtmenge — so siehst du, wie ergiebig einzelne Regenfälle waren, unabhängig vom Kalendertag.",
      },
      {
        spec: {
          id: "perm-13",
          title: "Evapotranspiration (30 Tage)",
          chart: "bars",
          timeRange: { start: "-30d", stop: "now" },
          series: [s("perm-13-s0", "Evapotranspiration", "evapotranspiration", "sum", "1d", { color: GREEN })],
        },
        caption:
          "Verdunstung pro Tag (Boden + Pflanzen) — hohe Werte bei wenig Regen bedeuten Trockenstress; nützlich fürs Gießen.",
      },
    ],
  },

  // ── 4) Wind ───────────────────────────────────────────────────────────────
  {
    id: "wind",
    title: "Wind",
    charts: [
      {
        spec: {
          id: "perm-4",
          title: "Windrose (7 Tage)",
          chart: "windrose",
          timeRange: { start: "-7d", stop: "now" },
          series: [
            s("perm-4-dir", "Windrichtung", "wind_direction", "mean", "1h", { role: "direction" }),
            s("perm-4-mag", "Windgeschwindigkeit", "wind_speed", "mean", "1h", { role: "magnitude" }),
          ],
        },
        caption:
          "Aus welcher Richtung der Wind kam — längere Arme = häufiger, wärmere Farbe = stärker; dominante SW-Arme = typische Westwetterlage, plötzliches Drehen kündigt oft einen Wetterwechsel an.",
      },
      {
        spec: {
          id: "perm-5",
          title: "Wind & Böen (24h)",
          chart: "line",
          timeRange: { start: "-24h", stop: "now" },
          series: [
            s("perm-5-s0", "Wind", "wind_speed", "mean", "1h", { color: GREEN }),
            s("perm-5-s1", "Böen", "wind_gust", "max", "1h", { color: ACCENT }),
          ],
        },
        caption:
          "Mittlerer Wind (Linie) und Spitzenböen — eine große Lücke zwischen beiden = böig/wechselhaft, gleichmäßig = stabile Lage.",
      },
    ],
  },

  // ── 5) Sonne, UV & Luftdruck ──────────────────────────────────────────────
  {
    id: "sonne-uv-luftdruck",
    title: "Sonne, UV & Luftdruck",
    charts: [
      {
        spec: {
          id: "perm-8",
          title: "Sonnenstrahlung (24h)",
          chart: "line",
          timeRange: { start: "-24h", stop: "now" },
          series: [
            s("perm-8-s0", "Solarstrahlung", "solar_radiation", "mean", "1h", { color: GOLD }),
            s("perm-8-s1", "Max. Solarstrahlung", "max_solar_radiation", "max", "1h", { color: BLUE_LIGHT }),
          ],
        },
        caption:
          "Sonnenenergie im Tagesverlauf (Glocke mittags) — glatte Kurve = wolkenlos, zackige = durchziehende Wolken.",
      },
      {
        spec: {
          id: "perm-uv",
          title: "UV-Index (7 Tage)",
          chart: "line",
          timeRange: { start: "-7d", stop: "now" },
          series: [s("perm-uv-s0", "UV-Index", "uv_index", "max", "1h", { color: GOLD })],
        },
        caption:
          "Tägliche UV-Spitze (mittags) — ab 3 Sonnenschutz, ab 6 hoch, ab 8 sehr hoch; zeigt, wann die UV-Belastung kritisch war.",
      },
      {
        spec: {
          id: "perm-6",
          title: "Luftdruck (24h)",
          chart: "line",
          timeRange: { start: "-24h", stop: "now" },
          series: [s("perm-6-s0", "Luftdruck", "pressure", "mean", "1h", { color: BLUE })],
        },
        caption:
          "Fallender Druck = Tief/Schlechtwetter im Anmarsch, steigender = Beruhigung/Hochdruck; schnelle Änderungen bedeuten windiges Wetter.",
      },
    ],
  },
];

/**
 * Flat list of the permanent ChartSpecs, DERIVED from the groups (preserved for
 * any caller that wants the specs without grouping; the dashboard renders groups).
 */
export const PERMANENT_CHARTS: ChartSpec[] = PERMANENT_GROUPS.flatMap((g) =>
  g.charts.map((c) => c.spec),
);
