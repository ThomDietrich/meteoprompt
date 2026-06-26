"use client";

import { forwardRef } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";

import { ECHARTS_OPTS, ECHARTS_STYLE, seriesColor } from "@/components/charts/chart-base";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Radar — multi-metric summary: each metric is an axis, the plotted value is the
 * metric's latest reading. Axis maxima come from each metric's own data range so
 * differing units stay readable.
 */

function buildOption(series: ResolvedSeries[]): EChartsOption {
  const color = seriesColor(series, 0);

  const indicators = series.map((s) => {
    const values = s.points.map((p) => p.v);
    const max = values.length ? Math.max(...values) : 1;
    return {
      name: `${s.label}${s.unit && s.unit !== "–" ? ` (${s.unit})` : ""}`,
      max: max > 0 ? Math.ceil(max * 1.1) : 1,
    };
  });

  const latest = series.map((s) =>
    s.points.length ? s.points[s.points.length - 1].v : 0,
  );

  return {
    tooltip: { trigger: "item" },
    radar: {
      indicator: indicators,
      radius: "62%",
      axisName: { fontSize: 10 },
    },
    series: [
      {
        type: "radar",
        data: [{ value: latest, name: "Aktuell" }],
        areaStyle: { opacity: 0.18, color },
        lineStyle: { color },
        itemStyle: { color },
      },
    ],
  };
}

export const RadarChart = forwardRef<EChartsReact, { series: ResolvedSeries[] }>(
  function RadarChart({ series }, ref) {
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
