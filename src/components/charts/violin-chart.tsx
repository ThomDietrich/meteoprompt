"use client";

import { forwardRef } from "react";
import * as echarts from "echarts";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";
import violinInstaller from "@echarts-x/custom-violin";

import { ECHARTS_OPTS, ECHARTS_STYLE, seriesColor } from "@/components/charts/chart-base";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Violin — KDE distribution per period via `@echarts-x/custom-violin`
 * (Apache-2.0). Data per the package API: flat [xIndex, value] points; same
 * xIndex groups into one violin.
 */

echarts.use(violinInstaller);

function buildOption(series: ResolvedSeries[]): EChartsOption {
  const s = series[0];
  const unit = s?.unit ?? "";
  const groups = s?.shaped?.shape === "distribution" ? s.shaped.groups : [];
  const color = seriesColor(series, 0);

  const data: [number, number][] = [];
  groups.forEach((g, i) => {
    for (const v of g.values) data.push([i, v]);
  });

  return {
    grid: { top: 16, right: 16, bottom: 40, left: 48 },
    tooltip: { trigger: "item" },
    xAxis: {
      type: "category",
      data: groups.map((g) => g.label),
      axisLabel: { fontSize: 9, rotate: groups.length > 8 ? 45 : 0 },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { formatter: `{value} ${unit}` },
    },
    series: [
      {
        type: "custom",
        renderItem: "violin" as unknown as undefined,
        name: s?.label,
        data,
        encode: { x: 0, y: 1 },
        itemPayload: { itemStyle: { color, opacity: 0.5 } },
      } as unknown as echarts.CustomSeriesOption,
    ],
  };
}

export const ViolinChart = forwardRef<EChartsReact, { series: ResolvedSeries[] }>(
  function ViolinChart({ series }, ref) {
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
