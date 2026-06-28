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
import { PERMANENT_GROUPS } from "@/lib/permanent-dashboard";
import type { ChartResponse, ChartSpec, ResolvedSeries } from "@/lib/query-spec";

/**
 * Permanent "Stations-Dashboard" (spec-07): the 16 predefined charts grouped into
 * 5 vertically-stacked, full-width GROUP cards. Inside each card a responsive
 * sub-grid (Desktop 2/Reihe, mobil 1) of graph blocks; under every graph a short,
 * STATIC German caption (always visible — no Claude). NOT react-grid-layout — not
 * draggable, resizable, or deletable, and never persisted. Each graph resolves its
 * data through the existing /api/chart path (no Claude). Charts reflow on
 * container resize via ResizeObserver.
 */

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; series: ResolvedSeries[] };

/**
 * The inner chart + its load/resize/empty/error state for ONE graph — WITHOUT an
 * outer Card (the group card is the outer container). A fixed graph height that
 * reflows via ResizeObserver; collapses cleanly to 1 column on mobile.
 */
function PermanentChart({ spec }: { spec: ChartSpec }) {
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

  const isEmpty = state.status === "ready" && isChartEmpty(state.series);

  return (
    <div ref={containerRef} className="h-64 w-full">
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
  );
}

/**
 * One graph block: the chart title, the chart itself, and the always-visible
 * static caption below it. Stacks cleanly inside the responsive sub-grid.
 */
function GraphBlock({ spec, caption }: { spec: ChartSpec; caption: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {spec.title}
      </p>
      <PermanentChart spec={spec} />
      <p className="text-sm text-slate-500 dark:text-slate-400">{caption}</p>
    </div>
  );
}

export default function PermanentDashboard() {
  return (
    <div className="flex flex-col gap-4">
      {PERMANENT_GROUPS.map((group) => (
        <Card key={group.id}>
          <CardHeader>
            <CardTitle className="text-base">{group.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2">
              {group.charts.map((g) => (
                <GraphBlock key={g.spec.id} spec={g.spec} caption={g.caption} />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
