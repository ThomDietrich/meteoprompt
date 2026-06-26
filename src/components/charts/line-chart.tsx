"use client";

import { forwardRef } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";

import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Line renderer — one smoothed line per series. Shared unit drives the y-axis
 * label and tooltip formatting. The card forwards a ref so it can drive resize.
 */

function buildOption(series: ResolvedSeries[]): EChartsOption {
  const unit = series[0]?.unit ?? "";

  return {
    grid: { top: 28, right: 16, bottom: 32, left: 48 },
    legend:
      series.length > 1
        ? { top: 0, type: "scroll", textStyle: { fontSize: 11 } }
        : undefined,
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) =>
        typeof value === "number" ? `${value.toFixed(1)} ${unit}` : String(value),
    },
    xAxis: { type: "time" },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { formatter: `{value} ${unit}` },
    },
    series: series.map((s) => ({
      name: s.label,
      type: "line" as const,
      smooth: true,
      showSymbol: false,
      data: s.points.map((p) => [p.t, p.v] as [string, number]),
      lineStyle: { width: 2 },
      areaStyle: series.length === 1 ? { opacity: 0.12 } : undefined,
    })),
  };
}

export const LineChart = forwardRef<EChartsReact, { series: ResolvedSeries[] }>(
  function LineChart({ series }, ref) {
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
