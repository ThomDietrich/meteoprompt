import { NextResponse } from "next/server";

import { ChartShapeError, resolveChart } from "@/lib/flux";
import { categorizeDataError } from "@/lib/query-error";
import { logFailedQuery } from "@/lib/query-log";
import { generateSummary } from "@/lib/summary";
import type { ChartResponse, ChartSpec } from "@/lib/query-spec";

// Reload-refresh endpoint: ChartSpec → data. force-dynamic so `next build` needs
// no DB connection (Gate A). spec-06: for NL cards (those that pass an
// `originQuery`) this now ALSO runs a Claude call to (re)generate the data-
// grounded summary, so the text stays current to the (possibly relative) data.
// Permanent/pinned cards without an originQuery stay LLM-free.
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
  let originQuery: string | undefined;
  try {
    const body = (await request.json()) as {
      spec?: unknown;
      originQuery?: unknown;
    };
    if (!isChartSpecShape(body.spec)) {
      return NextResponse.json(
        { error: "Bad request", detail: "Body must include a valid 'spec' (ChartSpec)." },
        { status: 400 },
      );
    }
    spec = body.spec;
    // Only NL cards pass an originQuery → only they get a (re)generated summary.
    if (typeof body.originQuery === "string" && body.originQuery.trim().length > 0) {
      originQuery = body.originQuery.trim();
    }
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
    // spec-06: regenerate the data-grounded summary for NL cards only (those
    // with an originQuery) so the text is always current to the data. Best-
    // effort — generateSummary never throws.
    const summary = originQuery
      ? await generateSummary(spec, series, originQuery, answer)
      : undefined;
    const payload: ChartResponse = {
      spec,
      series,
      ...(answer ? { answer } : {}),
      ...(summary ? { summary } : {}),
    };
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
    // Interpret the data error (timeout / config / generic) → actionable German.
    const { category, httpStatus, detail } = categorizeDataError(error);
    console.error(`[api/chart] query failed (${category}):`, message);
    await logFailedQuery({ query: spec.title, reason: category, detail: message, route: "/api/chart" });
    return NextResponse.json(
      { error: "data_error", category, detail },
      { status: httpStatus },
    );
  }
}
