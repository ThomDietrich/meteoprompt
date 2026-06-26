"use client";

import { forwardRef } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";

import { ECHARTS_OPTS, ECHARTS_STYLE, seriesColor } from "@/components/charts/chart-base";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Candlestick — per-day temperature spread [open, close, low, high] from the
 * shaped OHLC payload. Up/down colours are derived from the series colour.
 */

function buildOption(series: ResolvedSeries[]): EChartsOption {
  const s = series[0];
  const unit = s?.unit ?? "";
  const ohlc = s?.shaped?.shape === "ohlc" ? s.shaped.ohlc : [];
  const color = seriesColor(series, 0);

  return {
    grid: { top: 16, right: 16, bottom: 32, left: 48 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
    },
    xAxis: {
      type: "category",
      data: ohlc.map((d) => d.t.slice(0, 10)),
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
