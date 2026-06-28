import type { SeriesPoint, ShowerEvent } from "@/lib/query-spec";

/**
 * spec-07 — rain-event ("shower") sessionization. PURE + unit-testable: no DB,
 * no server-only dependency, so it can run in both /api/ask and /api/chart and
 * be exercised by a standalone self-check.
 *
 * Input: the rain accumulator's WET INCREMENTS — `{ t, v }` where `v` is the
 * positive mm added since the previous reading (the Flux side already does
 * `difference(nonNegative:true)` + `filter(_value > 0)` + sort). We DON'T trust
 * the input order and re-sort defensively.
 *
 * A "shower"/rain event is a contiguous wet phase; two wet readings belong to the
 * SAME event when the dry gap between them is < MIT (Minimum Inter-event Time, the
 * hydrology standard for event separation). A gap ≥ MIT opens a new event.
 */

/** Default Minimum Inter-event Time in hours (configurable per query). */
export const SHOWER_MIT_HOURS = 4;

const MS_PER_HOUR = 3_600_000;

/**
 * Floor for the per-interval gap when deriving a rain RATE (~5-min station archive
 * interval). Home Assistant over-samples the accumulator, so two wet increments can
 * land microseconds apart; without this clamp `mm ÷ tinyGap` blows the peak rate up
 * to absurd values (e.g. 34 000 mm/h). Matches the catalog dedup window ("5m").
 */
const MIN_INTERVAL_H = 5 / 60;

/** Round to one decimal — matches the chart-label / tooltip precision. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Group time-sorted wet rain increments into discrete shower events. A gap to the
 * previous wet reading greater than `mitHours` starts a new event. Per event:
 *   - `start`/`end`  = first/last wet reading time
 *   - `totalMm`      = Σ increments
 *   - `durationH`    = (end − start) in hours
 *   - `peakRateMmH`  = the strongest single increment expressed as a rate
 *                      (increment ÷ the hours since the previous wet reading IN
 *                      THE SAME EVENT). The first reading of an event has no
 *                      in-event predecessor, so its rate is left at 0 unless a
 *                      later interval is stronger.
 *
 * `mitHours` defaults to SHOWER_MIT_HOURS. Non-finite/≤0 values fall back to the
 * default so a bad query parameter can never produce one giant event.
 */
export function groupShowers(
  points: SeriesPoint[],
  mitHours: number = SHOWER_MIT_HOURS,
): ShowerEvent[] {
  const mit =
    Number.isFinite(mitHours) && mitHours > 0 ? mitHours : SHOWER_MIT_HOURS;
  const mitMs = mit * MS_PER_HOUR;

  // Defensive sort (ascending) + drop unparseable timestamps.
  const wet = points
    .map((p) => ({ ms: Date.parse(p.t), t: p.t, v: p.v }))
    .filter((p) => !Number.isNaN(p.ms) && p.v > 0)
    .sort((a, b) => a.ms - b.ms);

  const events: ShowerEvent[] = [];

  // Accumulator for the event currently being built.
  let startMs = 0;
  let startT = "";
  let endMs = 0;
  let endT = "";
  let total = 0;
  let peakRate = 0;
  let prevMs = 0;
  let open = false;

  const flush = () => {
    if (!open) return;
    const durationH = (endMs - startMs) / MS_PER_HOUR;
    events.push({
      start: startT,
      end: endT,
      durationH: round1(durationH),
      totalMm: round1(total),
      peakRateMmH: round1(peakRate),
    });
    open = false;
  };

  for (const p of wet) {
    if (open && p.ms - prevMs >= mitMs) {
      // Dry gap ≥ MIT → the previous event ends, a new one begins.
      flush();
    }

    if (!open) {
      startMs = p.ms;
      startT = p.t;
      total = 0;
      peakRate = 0;
      open = true;
    } else {
      // In-event interval: convert this increment to a rate (mm/h). Clamp the gap
      // to the archive interval so HA's near-simultaneous duplicate writes (tiny
      // dt) can't inflate the rate to absurd values.
      const gapH = Math.max((p.ms - prevMs) / MS_PER_HOUR, MIN_INTERVAL_H);
      const rate = p.v / gapH;
      if (rate > peakRate) peakRate = rate;
    }

    total += p.v;
    endMs = p.ms;
    endT = p.t;
    prevMs = p.ms;
  }
  flush();

  return events;
}
