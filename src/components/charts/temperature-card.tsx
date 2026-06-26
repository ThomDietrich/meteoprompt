"use client";

import { useEffect, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type EChartsReact from "echarts-for-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SeriesPoint = { t: string; v: number };

type SeriesResponse = {
  unit: string;
  entity: string;
  points: SeriesPoint[];
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: SeriesResponse };

const API_URL = "/api/series/outdoor-temperature";

function buildOption(data: SeriesResponse): EChartsOption {
  const seriesData = data.points.map((p) => [p.t, p.v] as [string, number]);

  return {
    grid: { top: 24, right: 16, bottom: 32, left: 44 },
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) =>
        typeof value === "number"
          ? `${value.toFixed(1)} ${data.unit}`
          : String(value),
    },
    xAxis: {
      type: "time",
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { formatter: `{value} ${data.unit}` },
    },
    series: [
      {
        name: "Außentemperatur",
        type: "line",
        smooth: true,
        showSymbol: false,
        data: seriesData,
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.12 },
      },
    ],
  };
}

export function TemperatureCard() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const chartRef = useRef<EChartsReact>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch the series once on mount.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(API_URL);
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try {
            const body = (await res.json()) as { detail?: string };
            if (body?.detail) detail = body.detail;
          } catch {
            // Non-JSON error body — keep the status-code message.
          }
          throw new Error(detail);
        }
        const data = (await res.json()) as SeriesResponse;
        if (!cancelled) setState({ status: "ready", data });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error ? error.message : "Unbekannter Fehler",
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reflow the chart whenever the card container is resized (grid resize/drag).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      // Debounce to one resize per animation frame.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        chartRef.current?.getEchartsInstance().resize();
      });
    });

    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <Card className="h-full w-full">
      <CardHeader className="card-drag-handle cursor-move select-none">
        <CardTitle>Außentemperatur Garten — letzte 4 Wochen</CardTitle>
        <CardDescription>
          Stunden-Mittel aus InfluxDB · °C
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div ref={containerRef} className="h-full w-full">
          {state.status === "loading" && (
            <div className="flex h-full w-full items-center justify-center">
              <div className="h-full w-full animate-pulse rounded-md bg-slate-200/60 dark:bg-slate-700/40" />
            </div>
          )}

          {state.status === "error" && (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-center">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                Daten konnten nicht geladen werden
              </p>
              <p className="max-w-xs text-xs text-slate-500 dark:text-slate-400">
                {state.message}
              </p>
            </div>
          )}

          {state.status === "ready" && state.data.points.length === 0 && (
            <div className="flex h-full w-full items-center justify-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Keine Daten im gewählten Zeitraum.
              </p>
            </div>
          )}

          {state.status === "ready" && state.data.points.length > 0 && (
            <ReactECharts
              ref={chartRef}
              option={buildOption(state.data)}
              notMerge
              style={{ height: "100%", width: "100%" }}
              opts={{ renderer: "canvas" }}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
