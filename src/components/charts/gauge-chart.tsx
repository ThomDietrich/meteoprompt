"use client";

import { forwardRef } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";

import { ECHARTS_OPTS, ECHARTS_STYLE, seriesColor } from "@/components/charts/chart-base";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Gauge — a single latest value (shaped scalar). Scale min/max are chosen by
 * unit so the needle sits in a sensible range (spec-04 §10.5).
 */

function scaleForUnit(unit: string): { min: number; max: number } {
  switch (unit) {
    case "°C":
      return { min: -20, max: 45 };
    case "%":
      return { min: 0, max: 100 };
    case "km/h":
      return { min: 0, max: 120 };
    case "hPa":
      return { min: 960, max: 1050 };
    case "W/m²":
      return { min: 0, max: 1200 };
    case "°":
      return { min: 0, max: 360 };
    case "mm/h":
      return { min: 0, max: 50 };
    case "–": // UV index
      return { min: 0, max: 12 };
    default:
      return { min: 0, max: 100 };
  }
}

function buildOption(series: ResolvedSeries[]): EChartsOption {
  const s = series[0];
  const unit = s?.unit ?? "";
  const value = s?.shaped?.shape === "scalar" ? s.shaped.scalar : null;
  const { min, max } = scaleForUnit(unit);
  const color = seriesColor(series, 0);

  return {
    series: [
      {
        type: "gauge",
        min,
        max,
        progress: { show: true, width: 14, itemStyle: { color } },
        axisLine: { lineStyle: { width: 14 } },
        axisLabel: { fontSize: 9, distance: 12 },
        axisTick: { show: false },
        splitLine: { length: 10 },
        pointer: { itemStyle: { color } },
        anchor: { show: true, itemStyle: { color } },
        detail: {
          valueAnimation: true,
          fontSize: 22,
          offsetCenter: [0, "60%"],
          formatter: (v: number) =>
            value == null ? "–" : `${v.toFixed(1)} ${unit}`.trim(),
        },
        title: { offsetCenter: [0, "88%"], fontSize: 11 },
        data: [{ value: value ?? min, name: s?.label ?? "" }],
      },
    ],
  };
}

export const GaugeChart = forwardRef<EChartsReact, { series: ResolvedSeries[] }>(
  function GaugeChart({ series }, ref) {
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
