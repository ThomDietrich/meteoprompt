"use client";

import { forwardRef } from "react";
import * as echarts from "echarts";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";
import barRangeInstaller from "@echarts-x/custom-bar-range";

import { ECHARTS_OPTS, ECHARTS_STYLE, seriesColor } from "@/components/charts/chart-base";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Bar range — min↔max range bars per period via `@echarts-x/custom-bar-range`
 * (Apache-2.0). Data per the package API: [xIndex, low, high] on a category axis.
 */

echarts.use(barRangeInstaller);

function buildOption(series: ResolvedSeries[]): EChartsOption {
  const s = series[0];
  const unit = s?.unit ?? "";
  const band = s?.shaped?.shape === "band" ? s.shaped.band : [];
  const color = seriesColor(series, 0);

  return {
    grid: { top: 20, right: 16, bottom: 32, left: 48 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: band.map((d) => d.t.slice(0, 10)),
      axisLabel: { fontSize: 9, interval: Math.ceil(band.length / 8) },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { formatter: `{value} ${unit}` },
    },
    series: [
      {
        type: "custom",
        renderItem: "barRange" as unknown as undefined,
        name: s?.label,
        data: band.map((d, i) => [i, d.low, d.high]),
        encode: { x: 0, y: [1, 2], tooltip: [1, 2] },
        itemPayload: { itemStyle: { color, opacity: 0.85 } },
      } as unknown as echarts.CustomSeriesOption,
    ],
  };
}

export const BarRangeChart = forwardRef<
  EChartsReact,
  { series: ResolvedSeries[] }
>(function BarRangeChart({ series }, ref) {
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
