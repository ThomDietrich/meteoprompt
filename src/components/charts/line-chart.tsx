"use client";

import { forwardRef } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";

import { deNum, ECHARTS_OPTS, ECHARTS_STYLE, seriesColor } from "@/components/charts/chart-base";
import { WAPPEN_PALETTE } from "@/lib/colors";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Line renderer — one smoothed line per series, coloured from the persisted
 * Wappen palette. With a single series it shows a soft area fill and decorative
 * min/max/average markLines. When an `extreme` answer is supplied (spec-05), it
 * instead places a prominent markPoint with a big value+date label at the
 * record point. The card forwards a ref so it can drive resize.
 */

/** The record point to highlight on the context line (spec-05 extreme answer). */
export interface ExtremeMark {
  t: string;
  value: number;
  unit: string;
  label: string;
}

function buildOption(
  series: ResolvedSeries[],
  extreme?: ExtremeMark,
): EChartsOption {
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
        typeof value === "number" ? `${deNum(value)} ${unit}` : String(value),
    },
    xAxis: { type: "time" },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { formatter: `{value} ${unit}` },
    },
    series: series.map((s, i) => {
      const color = seriesColor(series, i);
      const isFirst = i === 0;
      return {
        name: s.label,
        type: "line" as const,
        smooth: true,
        showSymbol: false,
        itemStyle: { color },
        lineStyle: { width: 2, color },
        data: s.points.map((p) => [p.t, p.v] as [string, number]),
        areaStyle: single ? { opacity: 0.12, color } : undefined,
        // Extreme answer → a prominent markPoint on the first series. The signed
        // German value (e.g. "−19,5 °C") sits ABOVE the pin so the leading minus
        // is never clipped by the symbol; the pin itself stays a compact marker.
        markPoint:
          extreme && isFirst
            ? {
                symbol: "pin",
                symbolSize: 18,
                itemStyle: { color: WAPPEN_PALETTE[10] }, // Ziegelrot accent
                label: {
                  position: "top" as const,
                  distance: 4,
                  fontSize: 11,
                  fontWeight: "bold" as const,
                  color: WAPPEN_PALETTE[10],
                  formatter: `${deNum(extreme.value)} ${extreme.unit}`,
                },
                data: [{ coord: [extreme.t, extreme.value], name: extreme.label }],
              }
            : undefined,
        // Decorative markLines only when there's no extreme highlight.
        markLine:
          single && !extreme
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

export const LineChart = forwardRef<
  EChartsReact,
  { series: ResolvedSeries[]; extreme?: ExtremeMark }
>(function LineChart({ series, extreme }, ref) {
  return (
    <ReactECharts
      ref={ref}
      option={buildOption(series, extreme)}
      notMerge
      style={ECHARTS_STYLE}
      opts={ECHARTS_OPTS}
    />
  );
});
