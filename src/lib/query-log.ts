import "server-only";

import { appendJsonl } from "@/lib/store";

/**
 * Append-only log of queries the app couldn't answer (spec-05 §6). Every 422
 * (out_of_scope / unmappable / unknown metric / shape error) and server-side
 * failure in /api/ask (and /api/chart) is recorded to data/failed-queries.jsonl
 * for later analysis. No secrets are written. Best-effort: a logging failure
 * never breaks the request.
 */

const LOG_FILE = "failed-queries.jsonl";

export interface FailedQueryRecord {
  query: string;
  reason: string; // e.g. "out_of_scope" | "unmappable" | "chart_shape" | "server_error"
  detail?: string;
  route: string; // "/api/ask" | "/api/chart"
}

export async function logFailedQuery(rec: FailedQueryRecord): Promise<void> {
  try {
    await appendJsonl(LOG_FILE, { ts: new Date().toISOString(), ...rec });
  } catch {
    // Logging must never break the response path.
  }
}
