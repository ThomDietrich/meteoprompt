import { WAPPEN_PALETTE } from "@/lib/colors";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Shared helpers for the chart renderers (spec-04). Resolves a per-series colour
 * (the persisted `color`, or a stable palette fallback by index) so every chart
 * type styles series consistently from the Wappen palette.
 */

/** The colour for series `i`: its persisted colour, else a palette fallback. */
export function seriesColor(series: ResolvedSeries[], i: number): string {
  return series[i]?.color ?? WAPPEN_PALETTE[i % WAPPEN_PALETTE.length];
}

/**
 * German-localized number: decimal comma and a proper typographic minus sign
 * (−, U+2212, not the hyphen-minus -). Used in markPoint labels and tooltips so
 * values read e.g. "−17,6".
 */
export function deNum(n: number, decimals = 1): string {
  return n
    .toLocaleString("de-DE", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    .replace("-", "−");
}

/** Default ECharts wrapper props shared by every renderer. */
export const ECHARTS_STYLE = { height: "100%", width: "100%" } as const;
export const ECHARTS_OPTS = { renderer: "canvas" as const };
