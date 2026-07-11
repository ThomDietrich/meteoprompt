"use client";

import { forwardRef } from "react";
import * as echarts from "echarts";
import ReactECharts from "echarts-for-react";
import type {
  CustomSeriesRenderItemAPI,
  CustomSeriesRenderItemParams,
  CustomSeriesRenderItemReturn,
  EChartsOption,
} from "echarts";
import type EChartsReact from "echarts-for-react";

import {
  deNum,
  ECHARTS_OPTS,
  ECHARTS_STYLE,
  GRAIN_MS,
  inferGrain,
  periodQualifier,
  periodTooltipHead,
  seriesColor,
  type Grain,
} from "@/components/charts/chart-base";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Bars renderer — sums-per-window (rainfall, windrun, evapotranspiration) as
 * INTERVAL bars on a time x-axis (spec-13). Each bar FILLS its bucket interval
 * `[Start, Ende)` via a custom renderItem (so it sits inside the day/week/month it
 * belongs to — no straddling of a boundary tick), the width taken from the gap to
 * the next bucket (exact for variable month lengths / DST). Axis ticks fall on the
 * period boundaries; the tooltip names the period unambiguously (no "00:00").
 * Bucket timestamps are the period START (backend `_start`, spec-13).
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** One bar datum: [bucketStartMs, value, bucketEndMs]. */
type BarDatum = [number, number, number];

/**
 * Build [start, value, end] rows; end = next bucket's start, else start +
 * fallback. Cap the width at 1.5× the typical bucket so a bar following a data
 * gap (createEmpty:false drops empty buckets) doesn't balloon to fill the whole
 * gap — the cap is loose enough to keep exact variable month widths (28–31 d)
 * while a genuine gap shows as a gap.
 */
function toBarData(series: ResolvedSeries, fallbackMs: number): BarDatum[] {
  const pts = series.points;
  const maxW = fallbackMs * 1.5;
  return pts.map((p, i): BarDatum => {
    const start = new Date(p.t).getTime();
    const rawEnd = i + 1 < pts.length ? new Date(pts[i + 1].t).getTime() : start + fallbackMs;
    return [start, p.v, Math.min(rawEnd, start + maxW)];
  });
}

/** Median consecutive-gap of a series (ms), or null for <2 points. */
function medianGap(series: ResolvedSeries): number | null {
  const ts = series.points
    .map((p) => new Date(p.t).getTime())
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1]);
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/** renderItem for one interval-bar series, offset within the band for grouping. */
function intervalBar(color: string, seriesIndex: number, nSeries: number) {
  return (
    params: CustomSeriesRenderItemParams,
    api: CustomSeriesRenderItemAPI,
  ): CustomSeriesRenderItemReturn => {
    const start = api.value(0) as number;
    const value = api.value(1) as number;
    const end = api.value(2) as number;
    const base = api.coord([start, 0]);
    const edge = api.coord([end, 0]);
    const top = api.coord([start, value]);
    const bandW = edge[0] - base[0];
    const gap = Math.min(6, Math.max(0, bandW * 0.14));
    const slot = Math.max(1, (bandW - gap) / nSeries);
    const w = Math.min(slot, 48); // cap so a few wide bars don't become monstrous
    const x = base[0] + gap / 2 + slot * seriesIndex + (slot - w) / 2;
    const rect = {
      x,
      y: Math.min(base[1], top[1]),
      width: w,
      height: Math.abs(base[1] - top[1]),
    };
    const coord = params.coordSys as unknown as { x: number; y: number; width: number; height: number };
    const clipped = echarts.graphic.clipRectByRect(rect, coord);
    return clipped ? { type: "rect", shape: clipped, style: api.style({ fill: color }) } : undefined;
  };
}

function buildOption(series: ResolvedSeries[]): EChartsOption {
  const unit = series[0]?.unit ?? "";
  const grain: Grain = inferGrain(series.flatMap((s) => s.points));
  const nSeries = series.length;

  return {
    grid: { top: 28, right: 16, bottom: 32, left: 48 },
    legend:
      nSeries > 1 ? { top: 0, type: "scroll", textStyle: { fontSize: 11 } } : undefined,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params];
        if (list.length === 0) return "";
        const d0 = list[0]?.data as BarDatum | undefined;
        const start = Array.isArray(d0) ? Number(d0[0]) : NaN;
        const end = Array.isArray(d0) ? Number(d0[2]) : start + GRAIN_MS[grain];
        const header = Number.isNaN(start)
          ? ""
          : `<strong>${periodTooltipHead(grain, start, end)}</strong>`;
        const qual = `<span style="opacity:.65">${periodQualifier(grain)}</span>`;
        const rows = list.map((p) => {
          const raw = Array.isArray(p.data) ? (p.data as BarDatum)[1] : (p.data as number);
          const n = typeof raw === "number" ? raw : Number(raw);
          const valueText = Number.isFinite(n) ? `${deNum(n)} ${unit}` : String(raw ?? "");
          return `${p.marker ?? ""} ${p.seriesName ?? ""}: ${valueText}`;
        });
        return [header, qual, ...rows].filter(Boolean).join("<br/>");
      },
    },
    xAxis: {
      type: "time",
      axisLabel: {
        hideOverlap: true,
        // Date-only ticks (never "00:00"); show the year at a Jan-1 boundary.
        formatter: (val: number) => {
          const d = new Date(val);
          const base = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
          return d.getMonth() === 0 && d.getDate() === 1 ? `${base}\n${d.getFullYear()}` : base;
        },
      },
    },
    yAxis: {
      type: "value",
      scale: false,
      min: 0,
      axisLabel: { formatter: `{value} ${unit}` },
    },
    series: series.map((s, i) => {
      const fallback = medianGap(s) ?? GRAIN_MS[grain];
      return {
        name: s.label,
        type: "custom" as const,
        // Include the end dim in the x-extent so the last bar isn't clipped.
        encode: { x: [0, 2], y: 1 },
        renderItem: intervalBar(seriesColor(series, i), i, nSeries),
        data: toBarData(s, fallback),
      };
    }),
  };
}

export const BarsChart = forwardRef<EChartsReact, { series: ResolvedSeries[] }>(
  function BarsChart({ series }, ref) {
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
