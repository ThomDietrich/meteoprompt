import { NextResponse } from "next/server";

import { deriveQuerySpec, UnmappableQueryError } from "@/lib/claude";
import { ChartShapeError, resolveChartSeries } from "@/lib/flux";
import type { AskResponse, ChartResult } from "@/lib/query-spec";

// Never run at build time — Claude + InfluxDB are called per request at runtime,
// so `next build` stays green without a DB connection or API key (Gate A).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  let q: string;
  let currentChart: string | undefined;
  try {
    const body = (await request.json()) as {
      q?: unknown;
      currentChart?: unknown;
    };
    if (typeof body.q !== "string" || body.q.trim().length === 0) {
      return NextResponse.json(
        { error: "Bad request", detail: "Body must include a non-empty 'q' string." },
        { status: 400 },
      );
    }
    q = body.q.trim();
    // Optional regenerate nudge: the card's current chart type.
    if (typeof body.currentChart === "string" && body.currentChart.length > 0) {
      currentChart = body.currentChart;
    }
  } catch {
    return NextResponse.json(
      { error: "Bad request", detail: "Invalid JSON body." },
      { status: 400 },
    );
  }

  // 1) NL → validated QuerySpec via Claude tool-use.
  let charts;
  try {
    const spec = await deriveQuerySpec(q, currentChart);
    charts = spec.charts;
  } catch (error) {
    if (error instanceof UnmappableQueryError) {
      // Representative, honest message per category (spec-03 §7).
      const detail =
        error.reason === "record"
          ? "Solche Rekord-/Extrem-Fragen (z. B. „wann war es am kältesten“) kann ich noch nicht beantworten — das kommt in einer späteren Ausbaustufe."
          : error.reason === "out_of_scope"
            ? "Dazu habe ich keine Daten — ich kenne nur die Historie der eigenen Wetterstation (keine Vorhersage, kein Radar, keine Fremddaten)."
            : "Konnte die Anfrage nicht zuordnen — bitte präzisieren (z. B. „Außentemperatur der letzten 7 Tage“).";
      return NextResponse.json(
        { error: "unmappable_query", reason: error.reason, detail },
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

    // Claude chose a chart type its data shape can't satisfy → clean 422 (no crash).
    if (error instanceof ChartShapeError) {
      return NextResponse.json(
        {
          error: "chart_shape",
          detail:
            "Der gewählte Diagrammtyp passt nicht zur Datenform — bitte die Anfrage anders formulieren.",
        },
        { status: 422 },
      );
    }
    const status = /Missing InfluxDB configuration/.test(message) ? 503 : 500;
    console.error("[api/ask] data step failed:", message);
    return NextResponse.json(
      { error: "data_error", detail: message },
      { status },
    );
  }
}
