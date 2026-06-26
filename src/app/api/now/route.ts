import { NextResponse } from "next/server";

import { resolveKennwerte } from "@/lib/flux";
import type { NowResponse } from "@/lib/kennwerte";

// Live values fetched per request at runtime — force-dynamic so `next build`
// needs no DB connection (Gate A).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const values = await resolveKennwerte();
    const payload: NowResponse = { values };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown InfluxDB error";
    const status = /Missing InfluxDB configuration/.test(message) ? 503 : 500;
    console.error("[api/now] query failed:", message);
    return NextResponse.json(
      { error: "data_error", detail: message },
      { status },
    );
  }
}
