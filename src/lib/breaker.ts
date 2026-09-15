/**
 * spec-17 D — a tiny consecutive-failure circuit breaker.
 *
 * Shared by the client fetch wrapper and the chart route. Pure and dependency-free
 * (the clock is injectable), so it is unit-tested without timers.
 *
 * Why it matters: during the InfluxDB outage on 2026-08-14 the dashboard produced
 * 325 failed requests in a day — ~22 cards, every one of them on every reload,
 * each waiting out the client timeout.
 */

export interface Breaker {
  /** True while the breaker is open — callers should fail fast instead of trying. */
  isOpen(): boolean;
  recordSuccess(): void;
  recordFailure(): void;
  /** Consecutive failures so far (diagnostics/tests). */
  failures(): number;
}

export function createBreaker({
  threshold = 3,
  cooldownMs = 30_000,
  now = () => Date.now(),
}: { threshold?: number; cooldownMs?: number; now?: () => number } = {}): Breaker {
  let consecutive = 0;
  let openUntil = 0;

  return {
    isOpen() {
      return now() < openUntil;
    },
    recordSuccess() {
      consecutive = 0;
      openUntil = 0;
    },
    recordFailure() {
      consecutive += 1;
      if (consecutive >= threshold) openUntil = now() + cooldownMs;
    },
    failures() {
      return consecutive;
    },
  };
}
