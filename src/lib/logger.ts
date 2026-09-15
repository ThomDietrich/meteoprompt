import "server-only";

import { appendJsonl } from "@/lib/store";

/**
 * spec-15 — structured event log for prompt & app activity. Every event is
 * written BOTH to the console (→ `docker compose logs`) and, best-effort, to
 * `data/prompts.jsonl` (host-visible via the ./data bind mount). Fire-and-forget:
 * logging must NEVER throw into or delay a request. Deliberately carries NO
 * secrets and NO client IP / user-agent (spec-15 privacy decision).
 */

const LOG_FILE = "prompts.jsonl";

export type LogLevel = "info" | "error";

export interface LogEvent {
  /**
   * prompt_received | prompt_ok | prompt_error | chart_ok (spec-17 C)
   * | server_start | data_dir_ok | data_dir_error | db_connect | db_error
   */
  event: string;
  level?: LogLevel;
  query?: string;
  route?: string;
  reason?: string;
  detail?: string;
  chartTypes?: string[];
  chartCount?: number;
  /** spec-17 C: catalog metrics behind a chart, for per-widget runtime analysis. */
  metrics?: string[];
  /** spec-17 C: the requested range, e.g. "-365d→now". */
  range?: string;
  durationMs?: number;
  bucket?: string;
}

/** A compact, human-readable one-line console rendering per event type. */
export function consoleLine(e: LogEvent): string {
  const q = e.query != null ? ` · ${JSON.stringify(e.query)}` : "";
  const d = e.durationMs != null ? ` · ${e.durationMs}ms` : "";
  switch (e.event) {
    case "prompt_received":
      return `[prompt] received${q}`;
    case "prompt_ok":
      return `[prompt] ok${q} · ${(e.chartTypes ?? []).join(",")}${d}`;
    case "prompt_error":
      return `[prompt] error${q} · ${e.reason ?? ""}${d}${e.detail ? ` · ${e.detail}` : ""}`;
    case "chart_ok":
      return `[chart] ok${q} · ${(e.chartTypes ?? []).join(",")}${e.range ? ` · ${e.range}` : ""}${d}`;
    case "server_start":
      return `[server] start`;
    case "db_connect":
      return `[db] connect${e.bucket ? ` · bucket=${e.bucket}` : ""}`;
    case "db_error":
      return `[db] error${e.detail ? ` · ${e.detail}` : ""}`;
    default:
      return `[${e.event}]${q}${d}`;
  }
}

/**
 * Emit one structured event. Synchronous for callers (the file append is
 * fire-and-forget) so it never delays or breaks the request path.
 */
export function logEvent(e: LogEvent): void {
  const level: LogLevel = e.level ?? (e.event.endsWith("_error") ? "error" : "info");
  const record = { ts: new Date().toISOString(), level, ...e };
  const line = consoleLine(e);
  if (level === "error") console.error(line);
  else console.log(line);
  // Best-effort persist; a logging failure must never surface to the caller.
  void appendJsonl(LOG_FILE, record).catch(() => {});
}
