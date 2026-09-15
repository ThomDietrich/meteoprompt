import "server-only";

import { logEvent } from "@/lib/logger";

/**
 * Failed-query logging (spec-05 §6). As of spec-15 this is a thin wrapper over the
 * unified event logger: a failed query is recorded as a `prompt_error` event in
 * `data/prompts.jsonl` (host-visible) AND on the console — no separate
 * `failed-queries.jsonl`. Call sites in /api/ask and /api/chart are unchanged.
 * No secrets are written. Best-effort: a logging failure never breaks the request.
 */

export interface FailedQueryRecord {
  query: string;
  reason: string; // out_of_scope | unmappable | chart_shape | timeout | config | server_error | llm_error | invalid_spec
  detail?: string;
  route: string; // "/api/ask" | "/api/chart"
  durationMs?: number; // spec-17 C: how long the request ran before it failed
}

export function logFailedQuery(rec: FailedQueryRecord): void {
  logEvent({ event: "prompt_error", ...rec });
}
