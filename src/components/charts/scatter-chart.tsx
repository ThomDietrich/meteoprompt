"use client";

import { forwardRef } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";

import { ECHARTS_OPTS, ECHARTS_STYLE, seriesColor } from "@/components/charts/chart-base";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Scatter — correlation of two metrics. series[0] carries the [x,y] pairs in its
 * shaped payload; series[0]/series[1] give the axis labels + units.
 */

function buildOption(series: ResolvedSeries[]): EChartsOption {
  const xSeries = series[0];
  const ySeries = series[1] ?? series[0];
  const pairs = xSeries?.shaped?.shape === "xy" ? xSeries.shaped.pairs : [];
  const color = seriesColor(series, 0);

  return {
    grid: { top: 16, right: 20, bottom: 44, left: 56 },
    tooltip: {
      trigger: "item",
      formatter: (p: unknown) => {
        const d = (p as { data: [number, number] }).data;
        return `${xSeries?.label}: ${d[0].toFixed(1)} ${xSeries?.unit}<br/>${ySeries?.label}: ${d[1].toFixed(1)} ${ySeries?.unit}`;
      },
    },
    xAxis: {
      type: "value",
      scale: true,
      name: `${xSeries?.label} (${xSeries?.unit})`,
      nameLocation: "middle",
      nameGap: 28,
      nameTextStyle: { fontSize: 10 },
    },
    yAxis: {
      type: "value",
      scale: true,
      name: `${ySeries?.label} (${ySeries?.unit})`,
      nameTextStyle: { fontSize: 10 },
    },
    series: [
      {
        type: "scatter",
        symbolSize: 6,
        itemStyle: { color, opacity: 0.6 },
        data: pairs.map((p) => [p.x, p.y] as [number, number]),
      },
    ],
  };
}

export const ScatterChart = forwardRef<EChartsReact, { series: ResolvedSeries[] }>(
  function ScatterChart({ series }, ref) {
    return (
      <ReactECharts
        ref={ref}
        option={buildOption(series)}
        notMerge
        style={ECHARTS_STYLE}
        opts={ECHARTS_OPTS}
      />
    );
  },
);
