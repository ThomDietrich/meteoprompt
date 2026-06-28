import type { ChartType } from "@/lib/query-spec";

/**
 * Chart-type catalog (spec-04 §3): each implemented chart type with a `fitsFor`
 * description (drives Claude's smart-variety selection in the system prompt) and
 * a `dataShape` requirement (drives backend validation that the chosen type is
 * actually satisfiable by the requested series).
 *
 * Shared (no server-only dep): claude.ts builds the prompt from this; flux.ts /
 * the route validate against it.
 */

/** What constellation of series a chart type needs to be renderable. */
export type DataShapeReq =
  | "single_series" // exactly 1 metric series (line/bars/gauge/heatmaps/...)
  | "multi_series" // 1..N series, same idea (line with several metrics)
  | "two_metrics_xy" // scatter: exactly 2 metrics (roles x + y)
  | "single_range" // candlestick/rangeBand/barRange: 1 metric → min/max per window
  | "direction_magnitude" // windrose: a direction + a magnitude series
  | "multi_metrics"; // radar/themeRiver: several metrics compared

export interface ChartCatalogEntry {
  chart: ChartType;
  fitsFor: string; // German, model-facing
  dataShape: DataShapeReq;
}

export const CHART_CATALOG: ChartCatalogEntry[] = [
  {
    chart: "line",
    fitsFor:
      "Verlauf einer Momentan-Metrik über Zeit (Temperatur, Feuchte, Druck, Solar). Mehrere Serien = Vergleich.",
    dataShape: "multi_series",
  },
  {
    chart: "bars",
    fitsFor:
      "Mengen/Summen je Periode (Tagesregen, Windweg, Verdunstung) — diskrete Balken.",
    dataShape: "single_series",
  },
  {
    chart: "windrose",
    fitsFor:
      "Windrichtungs-Verteilung nach Sektor (braucht Richtung + Geschwindigkeit).",
    dataShape: "direction_magnitude",
  },
  {
    chart: "candlestick",
    fitsFor:
      "Tages-Temperaturspanne über Wochen/Monate (Min↔Max + Schwankung je Tag). Eine Metrik.",
    dataShape: "single_range",
  },
  {
    chart: "rangeBand",
    fitsFor:
      "Min/Max-Hüllkurve „Sonnendiagramm“ (Temperatur-Band über Zeit). Eine Metrik.",
    dataShape: "single_range",
  },
  {
    chart: "barRange",
    fitsFor:
      "Min↔Max-Range-Balken je Periode (Tag/Woche). Eine Metrik mit Spannweite.",
    dataShape: "single_range",
  },
  {
    chart: "scatter",
    fitsFor:
      "Korrelation ZWEIER Metriken (z. B. Temperatur × Luftfeuchte, Solar × Temperatur). Braucht GENAU 2 Metriken.",
    dataShape: "two_metrics_xy",
  },
  {
    chart: "heatmapCalendar",
    fitsFor:
      "Jahres-/Langzeit-Überblick EINES Tageswerts (Temperatur, Regen) als Kalender. Lange Zeiträume.",
    dataShape: "single_series",
  },
  {
    chart: "heatmapHourDay",
    fitsFor:
      "Tagesgang-Muster: Mittel je Stunde × Wochentag (Diurnal). Eine Metrik über mehrere Tage/Wochen.",
    dataShape: "single_series",
  },
  {
    chart: "gauge",
    fitsFor:
      "„Live jetzt“ / EIN aktueller Einzelwert (aktuelle Temperatur, UV, Feuchte). Kein Verlauf.",
    dataShape: "single_series",
  },
  {
    chart: "boxplot",
    fitsFor:
      "Verteilung/Streuung je Periode (Monat/Woche) einer Metrik (Temperatur, Wind).",
    dataShape: "single_series",
  },
  {
    chart: "radar",
    fitsFor:
      "Mehrdimensionales Summary über mehrere Metriken/Achsen (z. B. Tages-/Wochen-Profil). Mehrere Metriken.",
    dataShape: "multi_metrics",
  },
  {
    chart: "violin",
    fitsFor:
      "Verteilungsform je Periode (Schiefe/Bimodalität) einer Metrik. Eine Metrik über längere Zeit.",
    dataShape: "single_series",
  },
  {
    chart: "themeRiver",
    fitsFor:
      "Mehrere Sensor-Ströme proportional über Zeit (Saison-Überblick). Mehrere Metriken.",
    dataShape: "multi_metrics",
  },
  {
    chart: "table",
    fitsFor:
      "Tabelle (Zeit + Wert je Serie) — NUR wenn der Nutzer ausdrücklich danach fragt („als Tabelle“, „tabellarisch“, „liste“, „exportieren“) ODER nur wenige diskrete Werte verglichen werden (z. B. „Ø-Temperatur der letzten 3 Tage“, „Monatsmittel je Monat“). Sonst Diagramm bevorzugen.",
    dataShape: "multi_series",
  },
];

const BY_CHART = new Map<ChartType, ChartCatalogEntry>(
  CHART_CATALOG.map((e) => [e.chart, e]),
);

export function chartCatalogEntry(chart: ChartType): ChartCatalogEntry | undefined {
  return BY_CHART.get(chart);
}

/**
 * Validate that a chart type's data-shape requirement is satisfiable by the
 * given series count + roles. Returns null if OK, or a human-readable reason.
 */
export function validateChartDataShape(
  chart: ChartType,
  opts: { seriesCount: number; roles: (string | undefined)[] },
): string | null {
  const entry = BY_CHART.get(chart);
  if (!entry) return `Unbekannter Diagrammtyp: ${chart}`;

  const { seriesCount, roles } = opts;
  switch (entry.dataShape) {
    case "two_metrics_xy":
      if (seriesCount !== 2) {
        return `${chart} braucht genau 2 Metriken (x und y), bekam ${seriesCount}.`;
      }
      return null;
    case "direction_magnitude": {
      const hasDir = roles.includes("direction");
      const hasMag = roles.includes("magnitude");
      if (!hasDir || !hasMag) {
        return `${chart} braucht eine Richtungs- und eine Geschwindigkeitsreihe.`;
      }
      return null;
    }
    case "single_range":
    case "single_series":
      if (seriesCount < 1) return `${chart} braucht mindestens 1 Metrik.`;
      return null;
    case "multi_metrics":
      if (seriesCount < 2) {
        return `${chart} braucht mehrere Metriken (mindestens 2).`;
      }
      return null;
    case "multi_series":
    default:
      if (seriesCount < 1) return `${chart} braucht mindestens 1 Metrik.`;
      return null;
  }
}
