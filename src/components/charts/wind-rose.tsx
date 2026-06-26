"use client";

import { forwardRef } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";

import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Wind rose — polar bar chart. Direction series (role 'direction', degrees) and
 * magnitude series (role 'magnitude', km/h) are paired by timestamp: each sample
 * is binned into one of 8 compass sectors (angle) and one of several speed bins
 * (stacked bars), so the bar length shows how often the wind blew from a sector
 * and the colour stack shows how strong it was. See spec-02 §9 / §12.
 */

const SECTORS = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"] as const;

// Speed bins in km/h (upper bounds); the last is open-ended.
const SPEED_BINS: { label: string; max: number }[] = [
  { label: "0–5", max: 5 },
  { label: "5–15", max: 15 },
  { label: "15–25", max: 25 },
  { label: "25–40", max: 40 },
  { label: "> 40", max: Infinity },
];

const BIN_COLORS = ["#bae6fd", "#7dd3fc", "#38bdf8", "#0284c7", "#0c4a6e"];

/** Map a degree (0–360, 0 = N) to one of 8 compass sectors. */
function sectorIndex(deg: number): number {
  const normalized = ((deg % 360) + 360) % 360;
  // Each sector spans 45°, centered on its compass point (N = -22.5..22.5).
  return Math.floor(((normalized + 22.5) % 360) / 45);
}

function speedBinIndex(speed: number): number {
  for (let i = 0; i < SPEED_BINS.length; i++) {
    if (speed <= SPEED_BINS[i].max) return i;
  }
  return SPEED_BINS.length - 1;
}

function findSeries(
  series: ResolvedSeries[],
  role: "direction" | "magnitude",
): ResolvedSeries | undefined {
  return series.find((s) => s.role === role);
}

/** Build a [sector][speedBin] count matrix from paired direction+magnitude samples. */
function buildMatrix(
  direction: ResolvedSeries,
  magnitude: ResolvedSeries,
): number[][] {
  // counts[sector][bin]
  const counts: number[][] = SECTORS.map(() => SPEED_BINS.map(() => 0));

  // Pair by timestamp; magnitude lookup keyed on ISO time.
  const speedByTime = new Map<string, number>();
  for (const p of magnitude.points) speedByTime.set(p.t, p.v);

  for (const p of direction.points) {
    const speed = speedByTime.get(p.t);
    if (speed == null) continue;
    const si = sectorIndex(p.v);
    const bi = speedBinIndex(speed);
    counts[si][bi] += 1;
  }
  return counts;
}

function buildOption(series: ResolvedSeries[]): EChartsOption | null {
  const direction = findSeries(series, "direction");
  const magnitude = findSeries(series, "magnitude");
  if (!direction || !magnitude) return null;

  const counts = buildMatrix(direction, magnitude);

  // One stacked bar series per speed bin; each has 8 values (one per sector).
  const barSeries = SPEED_BINS.map((bin, bi) => ({
    name: bin.label,
    type: "bar" as const,
    coordinateSystem: "polar" as const,
    stack: "wind",
    data: SECTORS.map((_, si) => counts[si][bi]),
    itemStyle: { color: BIN_COLORS[bi] },
  }));

  return {
    polar: { radius: ["8%", "72%"] },
    legend: {
      bottom: 0,
      type: "scroll",
      textStyle: { fontSize: 11 },
      data: SPEED_BINS.map((b) => b.label),
    },
    tooltip: { trigger: "item" },
    angleAxis: {
      type: "category",
      data: [...SECTORS],
      startAngle: 90, // put N at the top
      boundaryGap: true,
      axisLine: { show: true },
      axisTick: { show: false },
    },
    radiusAxis: {
      min: 0,
      axisLabel: { show: true, fontSize: 10 },
    },
    series: barSeries,
  };
}

export const WindRose = forwardRef<EChartsReact, { series: ResolvedSeries[] }>(
  function WindRose({ series }, ref) {
    const option = buildOption(series);
    if (!option) {
      return (
        <div className="flex h-full w-full items-center justify-center text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Windrose braucht eine Richtungs- und eine Geschwindigkeitsreihe.
          </p>
        </div>
      );
    }
    return (
      <ReactECharts
        ref={ref}
        option={option}
        notMerge
        style={{ height: "100%", width: "100%" }}
        opts={{ renderer: "canvas" }}
      />
    );
  },
);
