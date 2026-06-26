"use client";

import { forwardRef } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";

import { ECHARTS_OPTS, ECHARTS_STYLE, seriesColor } from "@/components/charts/chart-base";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Line renderer — one smoothed line per series, coloured from the persisted
 * Wappen palette. With a single series it shows a soft area fill and decorative
 * min/max/average markLines (spec-04 §3 — decorative only; record ANSWERS are
 * spec-05). The card forwards a ref so it can drive resize.
 */

function buildOption(series: ResolvedSeries[]): EChartsOption {
  const unit = series[0]?.unit ?? "";
  const single = series.length === 1;

  return {
    grid: { top: 28, right: 16, bottom: 32, left: 48 },
    legend: !single
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
    series: series.map((s, i) => {
      const color = seriesColor(series, i);
      return {
        name: s.label,
        type: "line" as const,
        smooth: true,
        showSymbol: false,
        itemStyle: { color },
        lineStyle: { width: 2, color },
        data: s.points.map((p) => [p.t, p.v] as [string, number]),
        areaStyle: single ? { opacity: 0.12, color } : undefined,
        // Decorative annotations only on a single-series line.
        markLine: single
          ? {
              symbol: "none",
              lineStyle: { type: "dashed", opacity: 0.5 },
              label: { fontSize: 10, formatter: "{b}: {c}" },
              data: [
                { type: "average", name: "Ø" },
                { type: "min", name: "Min" },
                { type: "max", name: "Max" },
              ],
            }
          : undefined,
      };
    }),
  };
}

export const LineChart = forwardRef<EChartsReact, { series: ResolvedSeries[] }>(
  function LineChart({ series }, ref) {
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
