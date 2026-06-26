"use client";

import { useEffect, useRef, useState } from "react";
import type EChartsReact from "echarts-for-react";

import { isChartEmpty, renderChart } from "@/components/charts/render-chart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PERMANENT_CHARTS } from "@/lib/permanent-dashboard";
import type { ChartResponse, ChartSpec, ResolvedSeries } from "@/lib/query-spec";

/**
 * Permanent "Stations-Dashboard": a fixed, responsive CSS grid of the 12
 * predefined charts (spec-04 §8), now spanning many chart types. NOT
 * react-grid-layout — not draggable, resizable, or deletable, and never
 * persisted. Each chart resolves its data through the existing /api/chart path
 * (no Claude). Charts reflow on container resize via ResizeObserver.
 */

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; series: ResolvedSeries[] };

function PermanentChartCard({ spec }: { spec: ChartSpec }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const chartRef = useRef<EChartsReact>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    async function load() {
      try {
        const res = await fetch("/api/chart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spec }),
        });
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try {
            const body = (await res.json()) as { detail?: string };
            if (body?.detail) detail = body.detail;
          } catch {
            // keep status message
          }
          throw new Error(detail);
        }
        const data = (await res.json()) as ChartResponse;
        if (!cancelled) setState({ status: "ready", series: data.series });
      } catch (e) {
        if (!cancelled) {
          setState({
            status: "error",
            message: e instanceof Error ? e.message : "Unbekannter Fehler",
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [spec]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
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

  const isEmpty =
    state.status === "ready" && isChartEmpty(state.series);

  return (
    <Card className="h-80">
      <CardHeader>
        <CardTitle>{spec.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={containerRef} className="h-full w-full">
          {state.status === "loading" && (
            <div className="h-full w-full animate-pulse rounded-md bg-slate-200/60 dark:bg-slate-700/40" />
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
          {state.status === "ready" && isEmpty && (
            <div className="flex h-full w-full items-center justify-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Keine Daten im gewählten Zeitraum.
              </p>
            </div>
          )}
          {state.status === "ready" && !isEmpty &&
            renderChart(spec, state.series, chartRef)}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PermanentDashboard() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {PERMANENT_CHARTS.map((spec) => (
        <PermanentChartCard key={spec.id} spec={spec} />
      ))}
    </div>
  );
}
