"use client";

import { forwardRef } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";

import { ECHARTS_OPTS, ECHARTS_STYLE, seriesColor } from "@/components/charts/chart-base";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * ThemeRiver — several metric streams flowing proportionally over time. Each
 * series contributes [time, value, seriesLabel] rows. Negative values are
 * clamped to 0 (themeRiver stacks non-negative bands).
 */

function buildOption(series: ResolvedSeries[]): EChartsOption {
  const rows: [string, number, string][] = [];
  for (const s of series) {
    for (const p of s.points) {
      rows.push([p.t, Math.max(0, p.v), s.label]);
    }
  }

  return {
    tooltip: { trigger: "axis", axisPointer: { type: "line" } },
    legend: { top: 0, type: "scroll", textStyle: { fontSize: 11 } },
    singleAxis: {
      type: "time",
      top: 32,
      bottom: 24,
      axisLabel: { fontSize: 9 },
    },
    color: series.map((_, i) => seriesColor(series, i)),
    series: [
      {
        type: "themeRiver",
        emphasis: { focus: "series" },
        data: rows,
        label: { show: false },
      },
    ],
  };
}

export const ThemeRiverChart = forwardRef<
  EChartsReact,
  { series: ResolvedSeries[] }
>(function ThemeRiverChart({ series }, ref) {
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
