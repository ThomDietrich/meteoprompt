"use client";

import { forwardRef } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";

import {
  deNum,
  ECHARTS_OPTS,
  ECHARTS_STYLE,
  GRAIN_MS,
  inferGrain,
  periodAxisLabel,
  periodTooltipHead,
  seriesColor,
  type Grain,
} from "@/components/charts/chart-base";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Candlestick — per-period temperature spread [open, close, low, high] from the
 * shaped OHLC payload. Up/down colours are derived from the series colour. The
 * category axis + tooltip name the PERIOD each box covers (no "00:00"); the box
 * already sits in its own band, so only the labels needed fixing (spec-13).
 * Bucket timestamps are the period START (backend `_start`).
 */

function buildOption(series: ResolvedSeries[]): EChartsOption {
  const s = series[0];
  const unit = s?.unit ?? "";
  const ohlc = s?.shaped?.shape === "ohlc" ? s.shaped.ohlc : [];
  const color = seriesColor(series, 0);
  const grain: Grain = inferGrain(ohlc.map((d) => ({ t: d.t })));
  const starts = ohlc.map((d) => new Date(d.t).getTime());
  const ends = starts.map((ms, i) => (i + 1 < starts.length ? starts[i + 1] : ms + GRAIN_MS[grain]));

  return {
    grid: { top: 16, right: 16, bottom: 32, left: 48 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params];
        const idx = list[0]?.dataIndex;
        if (typeof idx !== "number" || !ohlc[idx]) return "";
        const d = ohlc[idx];
        const header = `<strong>${periodTooltipHead(grain, starts[idx], ends[idx])}</strong>`;
        const fmt = (n: unknown) => (typeof n === "number" ? `${deNum(n)} ${unit}` : "–");
        return [
          header,
          `${list[0].marker ?? ""} Öffnung: ${fmt(d.open)}`,
          `Schluss: ${fmt(d.close)}`,
          `Tief: ${fmt(d.low)}`,
          `Hoch: ${fmt(d.high)}`,
        ].join("<br/>");
      },
    },
    xAxis: {
      type: "category",
      data: ohlc.map((_, i) => periodAxisLabel(grain, starts[i])),
      axisLabel: { fontSize: 10 },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { formatter: `{value} ${unit}` },
    },
    series: [
      {
        type: "candlestick",
        name: s?.label,
        // ECharts candlestick datum order: [open, close, low, high].
        data: ohlc.map((d) => [d.open, d.close, d.low, d.high]),
        itemStyle: {
          color, // bullish body
          color0: color, // bearish body (same hue, kept simple)
          borderColor: color,
          borderColor0: color,
        },
      },
    ],
  };
}

export const CandlestickChart = forwardRef<
  EChartsReact,
  { series: ResolvedSeries[] }
>(function CandlestickChart({ series }, ref) {
  return (
    <ReactECharts
      ref={ref}
      option={buildOption(series)}
      notMerge
      style={ECHARTS_STYLE}
      opts={ECHARTS_OPTS}
    />
  );
});
