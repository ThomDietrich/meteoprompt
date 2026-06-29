"use client";

import { forwardRef } from "react";
import * as echarts from "echarts";
import ReactECharts from "echarts-for-react";
import type { EChartsOption, TooltipComponentFormatterCallbackParams } from "echarts";
import type EChartsReact from "echarts-for-react";
import lineRangeInstaller from "@echarts-x/custom-line-range";

import { deDateTime, deNum, ECHARTS_OPTS, ECHARTS_STYLE, seriesColor } from "@/components/charts/chart-base";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Range band ("Sonnendiagramm") — filled min/max envelope over time via the
 * Apache-2.0 `@echarts-x/custom-line-range` custom series, registered once
 * against the same echarts instance echarts-for-react uses. Data per the
 * package API: [xIndex, low, high] on a category x-axis.
 */

// Register the 'lineRange' custom series type once at module load (client-only).
echarts.use(lineRangeInstaller);

function buildOption(series: ResolvedSeries[]): EChartsOption {
  const s = series[0];
  const unit = s?.unit ?? "";
  const band = s?.shaped?.shape === "band" ? s.shaped.band : [];
  const color = seriesColor(series, 0);

  return {
    grid: { top: 20, right: 16, bottom: 32, left: 48 },
    // Time-axis tooltip (spec-09 B): a BOLD DE date+time header (from the full
    // ISO category value) + the low/high band values. The category axis keeps
    // full ISO so the header resolves; axisLabel shortens it for the axis itself.
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "line" as const },
      formatter: (params: TooltipComponentFormatterCallbackParams) => {
        const list = Array.isArray(params) ? params : [params];
        const head = list[0] as { axisValue?: string; data?: number[]; marker?: string } | undefined;
        if (!head) return "";
        const header = head.axisValue ? `<strong>${deDateTime(head.axisValue)}</strong>` : "";
        // Custom lineRange datum: [index, low, high].
        const d = Array.isArray(head.data) ? head.data : [];
        const low = typeof d[1] === "number" ? `${deNum(d[1])} ${unit}` : "–";
        const high = typeof d[2] === "number" ? `${deNum(d[2])} ${unit}` : "–";
        return [header, `${head.marker ?? ""} Tief: ${low}`, `Hoch: ${high}`]
          .filter(Boolean)
          .join("<br/>");
      },
    },
    xAxis: {
      type: "category",
      data: band.map((d) => d.t),
      axisLabel: {
        fontSize: 9,
        interval: Math.ceil(band.length / 8),
        formatter: (v: string) => v.slice(5, 16).replace("T", " "),
      },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { formatter: `{value} ${unit}` },
    },
    series: [
      {
        type: "custom",
        renderItem: "lineRange" as unknown as undefined,
        name: s?.label,
        data: band.map((d, i) => [i, d.low, d.high]),
        encode: { x: 0, y: [1, 2], tooltip: [1, 2] },
        itemPayload: {
          areaStyle: { color, opacity: 0.22 },
          lineStyle: { color, opacity: 0.9 },
        },
      } as unknown as echarts.CustomSeriesOption,
    ],
  };
}

export const RangeBandChart = forwardRef<
  EChartsReact,
  { series: ResolvedSeries[] }
>(function RangeBandChart({ series }, ref) {
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
