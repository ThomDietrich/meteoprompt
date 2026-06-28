import { NextResponse } from "next/server";

import type { OverviewResponse } from "@/lib/kennwerte";
import { generateOverview } from "@/lib/overview";

// Computed per request at runtime (5-day Influx stats + a Claude call), so
// force-dynamic keeps `next build` DB/key-free (Gate A).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // generateOverview never throws — it returns undefined on missing key / data /
  // any error, so a hiccup just omits the text (the Kennwerte values are
  // fetched separately by the client and are never blocked by this route).
  const overview = await generateOverview();
  const payload: OverviewResponse = overview ? { overview } : {};
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
