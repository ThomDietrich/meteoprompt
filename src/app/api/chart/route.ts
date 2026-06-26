import { NextResponse } from "next/server";

import { resolveChartSeries } from "@/lib/flux";
import type { ChartResponse, ChartSpec } from "@/lib/query-spec";

// Reload-refresh endpoint: ChartSpec → data, WITHOUT Claude. Deterministic and
// cheap. force-dynamic so `next build` needs no DB connection (Gate A).
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Minimal structural check so a malformed persisted spec yields 400, not 500. */
function isChartSpecShape(v: unknown): v is ChartSpec {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.title === "string" &&
    typeof r.chart === "string" &&
    typeof r.timeRange === "object" &&
    r.timeRange !== null &&
    Array.isArray(r.series) &&
    r.series.length > 0
  );
}

export async function POST(request: Request) {
  let spec: ChartSpec;
  try {
    const body = (await request.json()) as { spec?: unknown };
    if (!isChartSpecShape(body.spec)) {
      return NextResponse.json(
        { error: "Bad request", detail: "Body must include a valid 'spec' (ChartSpec)." },
        { status: 400 },
      );
    }
    spec = body.spec;
  } catch {
    return NextResponse.json(
      { error: "Bad request", detail: "Invalid JSON body." },
      { status: 400 },
    );
  }

  try {
    // resolveChartSeries throws on unknown metric keys / unsupported source kinds.
    const series = await resolveChartSeries(spec);
    const payload: ChartResponse = { spec, series };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown InfluxDB error";

    // Unknown-metric / unsupported-source → the persisted spec is invalid (400).
    if (/unknown metric|unsupported source/i.test(message)) {
      return NextResponse.json(
        { error: "invalid_spec", detail: message },
        { status: 400 },
      );
    }
    const status = /Missing InfluxDB configuration/.test(message) ? 503 : 500;
    console.error("[api/chart] query failed:", message);
    return NextResponse.json(
      { error: "data_error", detail: message },
      { status },
    );
  }
}
