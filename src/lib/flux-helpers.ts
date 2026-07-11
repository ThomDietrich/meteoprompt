/**
 * Pure, DB-free Flux helper functions extracted verbatim from `flux.ts` so
 * they can be unit-tested without pulling in `server-only` / the InfluxDB
 * client. These are the query-string builders' guards + duration/window maths
 * (sanitizers, adaptive downsampling, day-key/day-length, compare-op). flux.ts
 * imports them back, so behaviour is byte-identical to before the move.
 *
 * SECURITY: `sanitizeRangeToken` / `sanitizeWindow` are the whitelist guards
 * that keep LLM-supplied range/window tokens from injecting arbitrary Flux.
 */

import type { TimeRange } from "@/lib/query-spec";

/**
 * Timezone preamble prepended to EVERY aggregating Flux query so windows align
 * to Europe/Berlin local boundaries (not UTC). Without it, `aggregateWindow`
 * buckets and `today()` snap to UTC midnight → daily/hourly boundaries appear
 * ~2h off in CEST. With it, a daily bucket's `_time` becomes local midnight
 * (e.g. `…T22:00:00Z` in summer). Must sit right after the import, before `from`.
 */
export const TZ_PREAMBLE =
  'import "timezone"\noption location = timezone.location(name: "Europe/Berlin")\n';

/**
 * Terminal sort appended as the FINAL pipe of every TIME-SERIES Flux query (the
 * convention). Flux does not guarantee chronological output — `aggregateWindow`
 * over a long, multi-shard range can return groups out of order (ascending then
 * jumping back to the earliest), which made a connected line/area chart draw a
 * phantom arc from the last point to the first. Sorting by `_time` at the source
 * guarantees chronological order. Scalar/single-row queries (mean/sum/count/last)
 * don't need it — it's a harmless no-op there, so we simply omit it.
 */
export const TERMINAL_SORT = '|> sort(columns: ["_time"])';

/**
 * Validate a relative Flux duration (`-7d`, `-28d`, `now`) or an absolute ISO time.
 * Rejects anything else so the LLM can't inject arbitrary Flux into range().
 */
const RELATIVE_DURATION = /^-?\d+(ns|us|µs|ms|s|m|h|d|w|mo|y)$/;

export function sanitizeRangeToken(token: string, fallback: string): string {
  const t = token.trim();
  if (t === "now" || t === "now()") return "now()";
  if (RELATIVE_DURATION.test(t)) return t;
  // Absolute ISO timestamp, e.g. 2026-06-01T00:00:00Z
  if (!Number.isNaN(Date.parse(t)) && /^\d{4}-\d{2}-\d{2}/.test(t)) {
    return new Date(t).toISOString();
  }
  return fallback;
}

/** A Flux window duration like `1h`, `1d`, `30m`. Falls back if malformed. */
const WINDOW_DURATION = /^\d+(ns|us|µs|ms|s|m|h|d|w|mo|y)$/;

export function sanitizeWindow(window: string | undefined, fallback: string): string {
  if (!window) return fallback;
  const w = window.trim();
  return WINDOW_DURATION.test(w) ? w : fallback;
}

// ── Adaptive downsampling (long-range query timeout fix) ─────────────────────

export const MS = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  mo: 2_592_000_000, // ≈30d
  y: 31_536_000_000, // ≈365d
} as const;

/** Duration of a Flux window/relative token (e.g. "1h", "30m", "2d") in ms. */
export function durationMs(token: string): number | null {
  const m = /^-?(\d+)(ns|us|µs|ms|s|m|h|d|w|mo|y)$/.exec(token.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] as keyof typeof MS;
  const base = MS[unit];
  return base ? n * base : null;
}

/**
 * Estimate the span (ms) covered by a TimeRange. Handles relative starts like
 * `-730d` (→ now - 730d) and absolute ISO start/stop. Returns null if unknown.
 */
export function rangeSpanMs(timeRange: TimeRange): number | null {
  const start = timeRange.start.trim();
  const stop = (timeRange.stop ?? "now").trim();

  // Stop is usually now(); resolve to a timestamp for the math.
  const stopMs =
    stop === "now" || stop === "now()" || stop === ""
      ? Date.now()
      : Number.isNaN(Date.parse(stop))
        ? Date.now()
        : Date.parse(stop);

  // Relative start like "-730d" → span is just that duration (when stop ≈ now).
  if (/^-\d+/.test(start)) {
    const d = durationMs(start);
    if (d != null) return d;
  }
  // Absolute ISO start → stopMs - startMs.
  if (!Number.isNaN(Date.parse(start))) {
    return Math.max(0, stopMs - Date.parse(start));
  }
  return null;
}

/** Candidate aggregate windows, coarsest-first selection happens by scanning up. */
const WINDOW_LADDER = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "3h",
  "6h",
  "12h",
  "1d",
  "2d",
  "7d",
  "30d",
] as const;

/**
 * Coarsen the requested aggregate window so a query over `timeRange` yields at
 * most `maxPoints` buckets — the fix for long-range transfer-heavy queries
 * (e.g. a −730d line at 1h ≈ 17.5k points → 1d ≈ 730). NEVER goes FINER than the
 * requested window, so short ranges keep their fine resolution unchanged.
 */
export function adaptiveWindow(
  timeRange: TimeRange,
  requestedWindow: string,
  maxPoints = 800,
): string {
  const span = rangeSpanMs(timeRange);
  const reqMs = durationMs(requestedWindow);
  if (span == null || reqMs == null || reqMs <= 0) return requestedWindow;

  // Already coarse enough at the requested window? Keep it.
  if (span / reqMs <= maxPoints) return requestedWindow;

  // Otherwise climb the ladder to the smallest window that is BOTH ≥ requested
  // and yields ≤ maxPoints buckets.
  for (const w of WINDOW_LADDER) {
    const wMs = durationMs(w);
    if (wMs == null || wMs < reqMs) continue; // never finer than requested
    if (span / wMs <= maxPoints) return w;
  }
  // Range so large even 30d exceeds the cap → use the coarsest ladder step.
  return WINDOW_LADDER[WINDOW_LADDER.length - 1];
}

/**
 * Every aggregate bucket is timestamped at its START (`_start`, spec-13).
 * `aggregateWindow` defaults to the bucket's `_stop` (the NEXT boundary), so on a
 * time axis a bar drifts one period to the RIGHT and reads as the following
 * period — a daily bar for the 6th lands on the 7th tick; May's total sits on the
 * May/June line and looks like June. Anchoring at `_start` makes the bucket
 * timestamp equal the period it represents, so placement AND the date/label are
 * correct. Uniform across day/week/month/year (previously only mo/y). Matches the
 * convention already used in overview.ts. The `window` arg is kept for call-site
 * symmetry (all windows are start-anchored now, so it is unused).
 */
export function timeSrcClause(_window: string): string {
  return ', timeSrc: "_start"';
}

export function compareOp(op: string): "<" | "<=" | ">" | ">=" {
  switch (op) {
    case "<":
    case "<=":
    case ">":
    case ">=":
      return op;
    default:
      return ">";
  }
}

/** Round to one decimal — the chart/label/tooltip precision used across the app. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Map a daily bucket's `_time` to its Europe/Berlin calendar date. After the
 * TZ_PREAMBLE shifts daily buckets to local midnight (e.g. `…T22:00:00Z` of the
 * PREVIOUS UTC day in summer), a naive UTC slice would be off by one — so format
 * the instant in Berlin local time. `sv-SE` locale yields `YYYY-MM-DD`.
 */
export function dayKey(iso: string): string {
  // Container runs TZ=Europe/Berlin, so toLocaleDateString uses Berlin time.
  return new Date(iso).toLocaleDateString("sv-SE");
}

/**
 * Astronomical day length (sunrise→sunset) in hours for a latitude + date. Simple
 * solar-declination model — accurate to a few minutes, enough for a "% of possible
 * sunshine" estimate. Clamps the hour angle for polar day/night → [0, 24] h.
 */
export function dayLengthHours(latDeg: number, date: Date): number {
  const yearStart = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor(
    (date.getTime() - yearStart.getTime()) / 86_400_000,
  );
  const decl = 0.4093 * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
  const latRad = (latDeg * Math.PI) / 180;
  const cosH = -Math.tan(latRad) * Math.tan(decl);
  const H = Math.acos(Math.max(-1, Math.min(1, cosH))); // sunrise hour angle (rad)
  return (2 * H * 180) / Math.PI / 15;
}
