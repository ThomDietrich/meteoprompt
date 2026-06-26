"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import type EChartsReact from "echarts-for-react";

import { isChartEmpty, renderChart } from "@/components/charts/render-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ChartResponse, ChartSpec, ResolvedSeries } from "@/lib/query-spec";

/**
 * Generic chart card: header (title + origin-query line + regenerate + trash
 * icons), a renderer switch by ChartSpec.chart, and loading/error/empty states.
 * Fetches its own data from /api/chart on mount (no Claude) so new cards and
 * reload-rehydrated cards follow the same path. ResizeObserver drives
 * chart.resize() on grid resize. The "Neu erstellen" button (spec-04 §5b) asks
 * the parent to re-roll this card's chart type + colours in place.
 */

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; series: ResolvedSeries[] };

export function ChartCard({
  spec,
  originQuery,
  onRemove,
  onRegenerate,
  regenerating = false,
}: {
  spec: ChartSpec;
  originQuery: string;
  onRemove: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const chartRef = useRef<EChartsReact>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch this card's data once on mount (and whenever the spec identity changes).
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
            // Non-JSON error body — keep the status-code message.
          }
          throw new Error(detail);
        }
        const data = (await res.json()) as ChartResponse;
        if (!cancelled) setState({ status: "ready", series: data.series });
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
  }, [spec]);

  // Reflow the chart whenever the card container is resized (grid resize/drag).
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
    <Card className="h-full w-full">
      <CardHeader className="card-drag-handle cursor-move select-none">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate">{spec.title}</CardTitle>
            <CardDescription className="truncate" title={originQuery}>
              {originQuery}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {onRegenerate && (
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onRegenerate();
                }}
                disabled={regenerating}
                aria-label="Neu erstellen"
                title="Neu erstellen (anderer Diagrammtyp + Farben)"
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-sky-50 hover:text-brand-blue disabled:opacity-50 dark:hover:bg-sky-950/40 dark:hover:text-sky-400"
              >
                <RefreshCw className={`h-4 w-4 ${regenerating ? "animate-spin" : ""}`} />
              </button>
            )}
            <button
              type="button"
              // Don't let the drag handle swallow the click.
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              aria-label="Card löschen"
              title="Card löschen"
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
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
