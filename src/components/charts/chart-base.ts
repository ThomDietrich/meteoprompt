import type { TooltipComponentFormatterCallbackParams } from "echarts";

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

/**
 * German date+time for a tooltip header (spec-09 B): "DD.MM.YYYY, HH:MM". Accepts
 * an epoch-ms number or a date string; falls back to the raw String(v) on NaN.
 */
export function deDateTime(v: number | string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** One row in a tooltip-axis formatter's params array (the bits we read). */
type AxisTooltipParam = {
  axisValue?: number | string;
  seriesName?: string;
  marker?: string;
  // Either a bare number, or a [time, value] tuple (line/bars on a time axis).
  value?: number | (number | string)[];
  data?: number | (number | string)[];
};

/**
 * A time-series tooltip (spec-09 B): triggers on the axis, headed by the BOLD DE
 * date+time of the hovered point, then one `{marker} {seriesName}: {value} {unit}`
 * row per series. Used by the time-axis charts (line, bars, range-band,
 * candlestick); supersedes any prior valueFormatter-only tooltip on those.
 */
export function timeAxisTooltip(unit: string) {
  return {
    trigger: "axis" as const,
    axisPointer: { type: "line" as const },
    formatter: (params: TooltipComponentFormatterCallbackParams) => {
      const list = (Array.isArray(params) ? params : [params]) as AxisTooltipParam[];
      if (list.length === 0) return "";
      const head = list[0];
      // Prefer the axis value; fall back to the first data tuple's time slot.
      const headTime =
        head.axisValue ??
        (Array.isArray(head.data) ? head.data[0] : undefined) ??
        (Array.isArray(head.value) ? head.value[0] : undefined);
      const header =
        headTime != null
          ? `<strong>${deDateTime(headTime as number | string)}</strong>`
          : "";
      const rows = list.map((p) => {
        // value/data may be a bare number or a [time, value] tuple → take value.
        const raw = p.value ?? p.data;
        const n = Array.isArray(raw) ? raw[raw.length - 1] : raw;
        const valueText = typeof n === "number" ? `${deNum(n)} ${unit}` : String(n ?? "");
        return `${p.marker ?? ""} ${p.seriesName ?? ""}: ${valueText}`;
      });
      return [header, ...rows].filter(Boolean).join("<br/>");
    },
  };
}

/**
 * Candlestick tooltip (spec-09 B): same BOLD DE date+time header, then the four
 * OHLC values. Candlestick params expose OHLC at `data` = [idx, open, close,
 * low, high]; the header time comes from the category axisValue.
 */
export function candlestickTooltip(unit: string) {
  return {
    trigger: "axis" as const,
    axisPointer: { type: "cross" as const },
    formatter: (params: TooltipComponentFormatterCallbackParams) => {
      const list = (Array.isArray(params) ? params : [params]) as AxisTooltipParam[];
      if (list.length === 0) return "";
      const head = list[0];
      const header = head.axisValue != null ? `<strong>${deDateTime(head.axisValue)}</strong>` : "";
      // ECharts candlestick data row: [dataIndex, open, close, low, high].
      const d = Array.isArray(head.data) ? head.data : [];
      const fmt = (n: unknown) => (typeof n === "number" ? `${deNum(n)} ${unit}` : "–");
      const rows = [
        `${head.marker ?? ""} Öffnung: ${fmt(d[1])}`,
        `Schluss: ${fmt(d[2])}`,
        `Tief: ${fmt(d[3])}`,
        `Hoch: ${fmt(d[4])}`,
      ];
      return [header, ...rows].filter(Boolean).join("<br/>");
    },
  };
}

/** Default ECharts wrapper props shared by every renderer. */
export const ECHARTS_STYLE = { height: "100%", width: "100%" } as const;
export const ECHARTS_OPTS = { renderer: "canvas" as const };
