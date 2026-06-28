"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Pin, PinOff, RefreshCw, Trash2 } from "lucide-react";
import type EChartsReact from "echarts-for-react";

import { isChartEmpty, renderChart } from "@/components/charts/render-chart";
import { AnswerBanner } from "@/components/cards/answer-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { downloadSeriesCsv } from "@/lib/csv";
import type {
  ChartResponse,
  ChartSpec,
  ResolvedAnswer,
  ResolvedSeries,
} from "@/lib/query-spec";

/**
 * Generic chart card: header (title + origin-query line + action icons), a
 * renderer switch by ChartSpec.chart, and loading/error/empty states. Fetches
 * its own data from /api/chart on mount. For NL cards (those with an
 * originQuery) it also passes the originQuery so the route (re)generates the
 * spec-06 data-grounded summary, rendered UNDER the chart. ResizeObserver drives
 * chart.resize() on grid resize.
 *
 * spec-06 additions: the summary text under the chart, a "Prompt kopieren"
 * (Copy) button and a "Als CSV herunterladen" (Download) button in the action
 * row. Copy + summary appear only on cards WITH an originQuery; CSV appears on
 * every card.
 */

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      series: ResolvedSeries[];
      answer?: ResolvedAnswer;
      summary?: string;
    };

export function ChartCard({
  spec,
  originQuery,
  onRemove,
  onRegenerate,
  regenerating = false,
  pinned = false,
  onPin,
  onUnpin,
}: {
  spec: ChartSpec;
  originQuery: string;
  onRemove?: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
  pinned?: boolean;
  onPin?: () => void;
  onUnpin?: () => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const chartRef = useRef<EChartsReact>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // An NL/pinned card carries a non-empty origin query → it gets a summary +
  // copy button. (The permanent dashboard never uses ChartCard, so it never
  // triggers a summary call.)
  const hasQuery = originQuery.trim().length > 0;

  // Fetch this card's data once on mount (and whenever the spec identity changes).
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    async function load() {
      try {
        const res = await fetch("/api/chart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Pass originQuery only for NL cards → route (re)generates the summary.
          body: JSON.stringify(
            hasQuery ? { spec, originQuery } : { spec },
          ),
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
        if (!cancelled)
          setState({
            status: "ready",
            series: data.series,
            answer: data.answer,
            summary: data.summary,
          });
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
  }, [spec, originQuery, hasQuery]);

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

  const isEmpty = state.status === "ready" && isChartEmpty(state.series);

  // Copy the original prompt to the clipboard with brief "Kopiert" feedback.
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(originQuery);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context / permission) — non-fatal.
    }
  };

  // Build + download a CSV of the loaded data points (client-side only).
  const handleDownload = () => {
    if (state.status !== "ready") return;
    downloadSeriesCsv(spec.title, state.series);
  };

  const canDownload = state.status === "ready" && !isEmpty;

  return (
    <Card className="h-full w-full">
      <CardHeader className="card-drag-handle cursor-move select-none">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {/* pb-0.5 gives the truncate (overflow-hidden) box a hair of room so
                g/p/y descenders clear; CardTitle now uses leading-snug too. */}
            <CardTitle className="truncate pb-0.5">{spec.title}</CardTitle>
            <CardDescription className="truncate" title={originQuery}>
              {originQuery}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {/* CSV download — on EVERY card (charts + tables, NL + permanent). */}
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
              disabled={!canDownload}
              aria-label="Als CSV herunterladen"
              title="Als CSV herunterladen"
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-40 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400"
            >
              <Download className="h-4 w-4" />
            </button>
            {/* Copy original prompt — only on cards WITH an origin query. */}
            {hasQuery && (
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy();
                }}
                aria-label="Prompt kopieren"
                title={copied ? "Kopiert" : "Prompt kopieren"}
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-sky-50 hover:text-brand-blue dark:hover:bg-sky-950/40 dark:hover:text-sky-400"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            )}
            {/* Pinned cards are fixed: only Unpin. Private cards: pin + regen + delete. */}
            {pinned ? (
              onUnpin && (
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnpin();
                  }}
                  aria-label="Lösen"
                  title="Anpinnen aufheben"
                  className="rounded-md p-1 text-brand-blue transition-colors hover:bg-sky-50 dark:hover:bg-sky-950/40"
                >
                  <PinOff className="h-4 w-4" />
                </button>
              )
            ) : (
              <>
                {onPin && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPin();
                    }}
                    aria-label="Anpinnen"
                    title="Anpinnen (global für alle sichtbar)"
                    className="rounded-md p-1 text-slate-400 transition-colors hover:bg-amber-50 hover:text-brand-gold dark:hover:bg-amber-950/40"
                  >
                    <Pin className="h-4 w-4" />
                  </button>
                )}
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
                {onRemove && (
                  <button
                    type="button"
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
                )}
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex h-full w-full flex-col">
          {/* Prominent computed answer (spec-05), above the context chart. */}
          {state.status === "ready" && state.answer && (
            <AnswerBanner answer={state.answer} />
          )}

          <div ref={containerRef} className="min-h-0 w-full flex-1">
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
              renderChart(spec, state.series, chartRef, state.answer)}
          </div>

          {/* spec-06 A) data-grounded narrative UNDER the chart — NL cards only.
              While loading, a small shimmer stands in (data renders first). */}
          {hasQuery && (
            <SummaryBlock
              loading={state.status === "loading"}
              summary={state.status === "ready" ? state.summary : undefined}
              empty={isEmpty}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The narrative block beneath the chart. Shows a one-line shimmer while the card
 * is loading (the summary co-arrives with the data from /api/chart), the prose
 * once ready, and nothing if the chart is empty or no summary came back.
 */
function SummaryBlock({
  loading,
  summary,
  empty,
}: {
  loading: boolean;
  summary?: string;
  empty: boolean;
}) {
  if (empty) return null;
  if (loading) {
    return (
      <div className="mt-2 shrink-0 space-y-1" aria-hidden>
        <div className="h-2.5 w-full animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/40" />
        <div className="h-2.5 w-4/5 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/40" />
      </div>
    );
  }
  if (!summary) return null;
  return (
    <p className="mt-2 shrink-0 border-t border-black/5 pt-2 text-xs leading-relaxed text-slate-600 dark:border-white/5 dark:text-slate-300">
      {summary}
    </p>
  );
}
