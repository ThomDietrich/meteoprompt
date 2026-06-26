import { NextResponse } from "next/server";

import { queryOutdoorTemperature } from "@/lib/influx";

// Never run this at build time — the data is fetched per request at runtime,
// so `next build` stays green without a DB connection (Gate A).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const series = await queryOutdoorTemperature();
    return NextResponse.json(series, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown InfluxDB error";

    // Missing configuration → 503 (service not configured); anything else → 500.
    const status = /Missing InfluxDB configuration/.test(message) ? 503 : 500;

    console.error("[api/series/outdoor-temperature] query failed:", message);

    return NextResponse.json(
      { error: "Failed to load outdoor temperature series", detail: message },
      { status },
    );
  }
}
