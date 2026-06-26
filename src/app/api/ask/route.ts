import { NextResponse } from "next/server";

import { deriveQuerySpec, UnmappableQueryError } from "@/lib/claude";
import { resolveChartSeries } from "@/lib/flux";
import type { AskResponse, ChartResult } from "@/lib/query-spec";

// Never run at build time — Claude + InfluxDB are called per request at runtime,
// so `next build` stays green without a DB connection or API key (Gate A).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  let q: string;
  try {
    const body = (await request.json()) as { q?: unknown };
    if (typeof body.q !== "string" || body.q.trim().length === 0) {
      return NextResponse.json(
        { error: "Bad request", detail: "Body must include a non-empty 'q' string." },
        { status: 400 },
      );
    }
    q = body.q.trim();
  } catch {
    return NextResponse.json(
      { error: "Bad request", detail: "Invalid JSON body." },
      { status: 400 },
    );
  }

  // 1) NL → validated QuerySpec via Claude tool-use.
  let charts;
  try {
    const spec = await deriveQuerySpec(q);
    charts = spec.charts;
  } catch (error) {
    if (error instanceof UnmappableQueryError) {
      return NextResponse.json(
        {
          error: "unmappable_query",
          detail:
            "Konnte die Anfrage nicht zuordnen — bitte präzisieren (z. B. „Außentemperatur der letzten 7 Tage“).",
        },
        { status: 422 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown LLM error";
    const status = /Missing ANTHROPIC_API_KEY/.test(message) ? 503 : 500;
    console.error("[api/ask] LLM step failed:", message);
    return NextResponse.json(
      { error: "llm_error", detail: message },
      { status },
    );
  }

  // 2) Resolve each ChartSpec to data via Flux.
  try {
    const results: ChartResult[] = await Promise.all(
      charts.map(async (spec) => ({
        spec,
        series: await resolveChartSeries(spec),
      })),
    );

    const payload: AskResponse = { query: q, charts: results };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown InfluxDB error";
    const status = /Missing InfluxDB configuration/.test(message) ? 503 : 500;
    console.error("[api/ask] data step failed:", message);
    return NextResponse.json(
      { error: "data_error", detail: message },
      { status },
    );
  }
}
