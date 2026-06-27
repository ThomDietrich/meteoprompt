import { NextResponse } from "next/server";

import { ChartShapeError, resolveChart } from "@/lib/flux";
import { logFailedQuery } from "@/lib/query-log";
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
    // resolveChart throws on unknown metric keys / unsupported source kinds
    // (ChartShapeError) or an unsatisfiable chart/data-shape combination. For
    // extreme-line specs it resolves the series + answer in a single scan.
    const { series, answer } = await resolveChart(spec);
    const payload: ChartResponse = { spec, series, ...(answer ? { answer } : {}) };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown InfluxDB error";

    // Bad chart/data shape or unknown metric → the spec is invalid (400), not a crash.
    if (
      error instanceof ChartShapeError ||
      /unknown metric|unsupported source/i.test(message)
    ) {
      await logFailedQuery({ query: spec.title, reason: "invalid_spec", detail: message, route: "/api/chart" });
      return NextResponse.json(
        { error: "invalid_spec", detail: message },
        { status: 400 },
      );
    }
    const status = /Missing InfluxDB configuration/.test(message) ? 503 : 500;
    console.error("[api/chart] query failed:", message);
    await logFailedQuery({ query: spec.title, reason: "server_error", detail: message, route: "/api/chart" });
    return NextResponse.json(
      { error: "data_error", detail: message },
      { status },
    );
  }
}
