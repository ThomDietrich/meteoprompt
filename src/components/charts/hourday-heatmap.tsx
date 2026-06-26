"use client";

import { forwardRef } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";

import { ECHARTS_OPTS, ECHARTS_STYLE } from "@/components/charts/chart-base";
import { WAPPEN_PALETTE } from "@/lib/colors";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Hour×weekday heatmap — diurnal pattern: mean per hour (x) × weekday (y).
 * Cartesian heatmap with a Wappen colour ramp via visualMap.
 */

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const HOURS = Array.from({ length: 24 }, (_, h) => `${h}`);

function buildOption(series: ResolvedSeries[]): EChartsOption {
  const s = series[0];
  const unit = s?.unit ?? "";
  const matrix = s?.shaped?.shape === "matrix" ? s.shaped.matrix : [];

  const values = matrix.map((m) => m.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;

  // ECharts heatmap datum: [xIndex, yIndex, value] = [hour, weekday, value].
  const data = matrix.map(
    (m) => [m.hour, m.weekday, Math.round(m.value * 10) / 10] as [number, number, number],
  );

  return {
    grid: { top: 12, right: 12, bottom: 56, left: 36 },
    tooltip: {
      position: "top",
      formatter: (p: unknown) => {
        const d = (p as { data: [number, number, number] }).data;
        return `${WEEKDAYS[d[1]]} ${d[0]}:00 — ${d[2].toFixed(1)} ${unit}`;
      },
    },
    xAxis: {
      type: "category",
      data: HOURS,
      splitArea: { show: true },
      axisLabel: { fontSize: 9, interval: 2 },
    },
    yAxis: {
      type: "category",
      data: WEEKDAYS,
      splitArea: { show: true },
      axisLabel: { fontSize: 10 },
    },
    visualMap: {
      min,
      max,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      itemWidth: 12,
      itemHeight: 80,
      textStyle: { fontSize: 10 },
      inRange: {
        color: [WAPPEN_PALETTE[0], WAPPEN_PALETTE[6], WAPPEN_PALETTE[3], WAPPEN_PALETTE[10]],
      },
    },
    series: [
      {
        type: "heatmap",
        data,
        label: { show: false },
        emphasis: { itemStyle: { shadowBlur: 6, shadowColor: "rgba(0,0,0,0.3)" } },
      },
    ],
  };
}

export const HourDayHeatmap = forwardRef<
  EChartsReact,
  { series: ResolvedSeries[] }
>(function HourDayHeatmap({ series }, ref) {
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
