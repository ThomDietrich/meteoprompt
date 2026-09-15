"use client";

import { createBreaker } from "@/lib/breaker";
import type { ChartResponse, ChartSpec } from "@/lib/query-spec";

/**
 * spec-17 D — client side of the breaker: guards REPEATED fetches within one tab
 * (regenerate, remount, navigation). It cannot throttle the initial wave — all ~22
 * cards mount and call at the same instant, before any answer is back — and its
 * state is gone on reload. The breaker that actually stops an outage storm lives in
 * the chart route (one per server process, shared across page loads).
 */

export const BREAKER_MESSAGE =
  "Datenbank nicht erreichbar — weitere Abrufe sind kurz pausiert.";

const shared = createBreaker();

/**
 * Fetch one chart. Throws on any failure; the caller renders the message. Only 5xx
 * and network errors count towards opening the breaker — a bad spec (4xx) is the
 * card's own problem, not an outage.
 */
export async function fetchChart(body: {
  spec: ChartSpec;
  originQuery?: string;
}): Promise<ChartResponse> {
  if (shared.isOpen()) throw new Error(BREAKER_MESSAGE);

  let res: Response;
  try {
    res = await fetch("/api/chart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    shared.recordFailure(); // network/transport failure — the backend is unreachable
    throw error;
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const parsed = (await res.json()) as { detail?: string };
      if (parsed?.detail) detail = parsed.detail;
    } catch {
      // Non-JSON error body — keep the status-code message.
    }
    if (res.status >= 500) shared.recordFailure();
    throw new Error(detail);
  }

  shared.recordSuccess();
  return (await res.json()) as ChartResponse;
}
