"use client";

import { forwardRef } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";

import { ECHARTS_OPTS, ECHARTS_STYLE } from "@/components/charts/chart-base";
import { WAPPEN_PALETTE } from "@/lib/colors";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Calendar heatmap — a daily value over a long range, on ECharts' calendar
 * coordinate system. visualMap maps the value to a Wappen blue→gold→… ramp.
 */

function buildOption(series: ResolvedSeries[]): EChartsOption {
  const s = series[0];
  const unit = s?.unit ?? "";
  const cal = s?.shaped?.shape === "calendar" ? s.shaped.calendar : [];

  const values = cal.map((d) => d.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;

  // Year range from the data (fallback: current year).
  const years = cal.map((d) => d.date.slice(0, 4));
  const year = years.length ? years[years.length - 1] : `${new Date().getFullYear()}`;
  const rangeStart = cal.length ? cal[0].date : `${year}-01-01`;
  const rangeEnd = cal.length ? cal[cal.length - 1].date : `${year}-12-31`;

  return {
    tooltip: {
      formatter: (p: unknown) => {
        const d = (p as { data: [string, number] }).data;
        return `${d[0]}: ${d[1].toFixed(1)} ${unit}`;
      },
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
    calendar: {
      top: 24,
      left: 30,
      right: 16,
      cellSize: ["auto", 14],
      range: [rangeStart, rangeEnd],
      itemStyle: { borderWidth: 0.5, borderColor: "#eee" },
      yearLabel: { show: false },
      dayLabel: { fontSize: 9 },
      monthLabel: { fontSize: 9 },
    },
    series: [
      {
        type: "heatmap",
        coordinateSystem: "calendar",
        data: cal.map((d) => [d.date, d.value] as [string, number]),
      },
    ],
  };
}

export const CalendarHeatmap = forwardRef<
  EChartsReact,
  { series: ResolvedSeries[] }
>(function CalendarHeatmap({ series }, ref) {
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
