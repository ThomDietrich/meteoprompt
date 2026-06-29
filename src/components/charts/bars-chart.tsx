"use client";

import { forwardRef } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";

import { seriesColor, timeAxisTooltip } from "@/components/charts/chart-base";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Bars renderer — one bar series per resolved series, on a time x-axis. Used for
 * sums-per-window (rainfall, windrun, evapotranspiration).
 */

function buildOption(series: ResolvedSeries[]): EChartsOption {
  const unit = series[0]?.unit ?? "";

  return {
    grid: { top: 28, right: 16, bottom: 32, left: 48 },
    legend:
      series.length > 1
        ? { top: 0, type: "scroll", textStyle: { fontSize: 11 } }
        : undefined,
    tooltip: timeAxisTooltip(unit),
    xAxis: { type: "time" },
    yAxis: {
      type: "value",
      scale: false,
      min: 0,
      axisLabel: { formatter: `{value} ${unit}` },
    },
    series: series.map((s, i) => ({
      name: s.label,
      type: "bar" as const,
      itemStyle: { color: seriesColor(series, i) },
      data: s.points.map((p) => [p.t, p.v] as [string, number]),
      barMaxWidth: 24,
    })),
  };
}

export const BarsChart = forwardRef<EChartsReact, { series: ResolvedSeries[] }>(
  function BarsChart({ series }, ref) {
    return (
      <ReactECharts
        ref={ref}
        option={buildOption(series)}
        notMerge
        style={{ height: "100%", width: "100%" }}
        opts={{ renderer: "canvas" }}
      />
    );
  },
);
