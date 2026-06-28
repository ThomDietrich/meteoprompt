"use client";

import { forwardRef } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";

import {
  deNum,
  ECHARTS_OPTS,
  ECHARTS_STYLE,
  seriesColor,
} from "@/components/charts/chart-base";
import type { ResolvedSeries, ShowerEvent } from "@/lib/query-spec";

/**
 * spec-07 — Regen pro Schauer. One bar per discrete rain event (sessionized
 * in-app, see lib/shower.ts) on a CATEGORY x-axis (event start, since events are
 * discrete, not evenly spaced in time). Bar height = totalMm. A CUSTOM tooltip
 * shows Start–Ende, Dauer, Summe und Spitzenrate, all DE-formatted.
 */

/** Format an ISO instant as DD.MM.YYYY, HH:MM in Europe/Berlin (container TZ). */
function deDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Short axis label: DD.MM. HH:MM (year omitted to keep the tick compact). */
function deAxisLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildOption(series: ResolvedSeries[]): EChartsOption {
  const s = series[0];
  const unit = s?.unit ?? "mm";
  const showers: ShowerEvent[] = s?.shaped?.shape === "showers" ? s.shaped.showers : [];
  const color = seriesColor(series, 0);

  return {
    grid: { top: 16, right: 16, bottom: 56, left: 48 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      // Custom formatter over the event index → all four event fields.
      formatter: (params) => {
        const arr = Array.isArray(params) ? params : [params];
        const idx = arr[0]?.dataIndex;
        const ev = typeof idx === "number" ? showers[idx] : undefined;
        if (!ev) return "";
        return [
          `Start: ${deDateTime(ev.start)}`,
          `Ende: ${deDateTime(ev.end)}`,
          `Dauer: ${deNum(ev.durationH)} h`,
          `Summe: ${deNum(ev.totalMm)} ${unit}`,
          `Spitzenrate: ${deNum(ev.peakRateMmH)} ${unit}/h`,
        ].join("<br/>");
      },
    },
    xAxis: {
      type: "category",
      data: showers.map((ev) => deAxisLabel(ev.start)),
      axisLabel: { fontSize: 10, rotate: 45, hideOverlap: true },
    },
    yAxis: {
      type: "value",
      scale: false,
      min: 0,
      axisLabel: { formatter: `{value} ${unit}` },
    },
    series: [
      {
        name: s?.label ?? "Regen pro Schauer",
        type: "bar",
        itemStyle: { color },
        data: showers.map((ev) => ev.totalMm),
        barMaxWidth: 24,
      },
    ],
  };
}

export const ShowerBarsChart = forwardRef<
  EChartsReact,
  { series: ResolvedSeries[] }
>(function ShowerBarsChart({ series }, ref) {
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
