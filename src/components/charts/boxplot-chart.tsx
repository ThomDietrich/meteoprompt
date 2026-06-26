"use client";

import { forwardRef } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";

import { ECHARTS_OPTS, ECHARTS_STYLE, seriesColor } from "@/components/charts/chart-base";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Boxplot — distribution per period (month) of one metric. We compute the
 * 5-number summary [min, Q1, median, Q3, max] per group from the raw values.
 */

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

function fiveNumber(values: number[]): [number, number, number, number, number] {
  const s = [...values].sort((a, b) => a - b);
  return [
    s[0] ?? 0,
    quantile(s, 0.25),
    quantile(s, 0.5),
    quantile(s, 0.75),
    s[s.length - 1] ?? 0,
  ];
}

function buildOption(series: ResolvedSeries[]): EChartsOption {
  const s = series[0];
  const unit = s?.unit ?? "";
  const groups = s?.shaped?.shape === "distribution" ? s.shaped.groups : [];
  const color = seriesColor(series, 0);

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
        type: "boxplot",
        data: groups.map((g) => fiveNumber(g.values)),
        itemStyle: { color: `${color}33`, borderColor: color },
      },
    ],
  };
}

export const BoxplotChart = forwardRef<EChartsReact, { series: ResolvedSeries[] }>(
  function BoxplotChart({ series }, ref) {
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
