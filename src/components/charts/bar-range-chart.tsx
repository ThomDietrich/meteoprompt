"use client";

import { forwardRef } from "react";
import * as echarts from "echarts";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";
import barRangeInstaller from "@echarts-x/custom-bar-range";

import {
  deNum,
  ECHARTS_OPTS,
  ECHARTS_STYLE,
  GRAIN_MS,
  inferGrain,
  periodAxisLabel,
  periodTooltipHead,
  seriesColor,
  type Grain,
} from "@/components/charts/chart-base";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Bar range — min↔max range bars per period via `@echarts-x/custom-bar-range`
 * (Apache-2.0). Data per the package API: [xIndex, low, high] on a category axis.
 * Axis + tooltip name the PERIOD each bar covers (local day, no "00:00"); bucket
 * timestamps are the period START (backend `_start`, spec-13).
 */

echarts.use(barRangeInstaller);

function buildOption(series: ResolvedSeries[]): EChartsOption {
  const s = series[0];
  const unit = s?.unit ?? "";
  const band = s?.shaped?.shape === "band" ? s.shaped.band : [];
  const color = seriesColor(series, 0);
  const grain: Grain = inferGrain(band.map((d) => ({ t: d.t })));
  const starts = band.map((d) => new Date(d.t).getTime());
  const ends = starts.map((ms, i) => (i + 1 < starts.length ? starts[i + 1] : ms + GRAIN_MS[grain]));

  return {
    grid: { top: 20, right: 16, bottom: 32, left: 48 },
    tooltip: {
      trigger: "axis",
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params];
        const idx = list[0]?.dataIndex;
        if (typeof idx !== "number" || !band[idx]) return "";
        const b = band[idx];
        const header = `<strong>${periodTooltipHead(grain, starts[idx], ends[idx])}</strong>`;
        return [
          header,
          `${list[0].marker ?? ""} Tief: ${deNum(b.low)} ${unit}`,
          `Hoch: ${deNum(b.high)} ${unit}`,
        ].join("<br/>");
      },
    },
    xAxis: {
      type: "category",
      data: band.map((_, i) => periodAxisLabel(grain, starts[i])),
      axisLabel: { fontSize: 9, interval: Math.ceil(band.length / 8) },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { formatter: `{value} ${unit}` },
    },
    series: [
      {
        type: "custom",
        renderItem: "barRange" as unknown as undefined,
        name: s?.label,
        data: band.map((d, i) => [i, d.low, d.high]),
        encode: { x: 0, y: [1, 2], tooltip: [1, 2] },
        itemPayload: { itemStyle: { color, opacity: 0.85 } },
      } as unknown as echarts.CustomSeriesOption,
    ],
  };
}

export const BarRangeChart = forwardRef<
  EChartsReact,
  { series: ResolvedSeries[] }
>(function BarRangeChart({ series }, ref) {
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
