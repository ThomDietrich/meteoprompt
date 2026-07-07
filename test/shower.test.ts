import { describe, expect, it } from "vitest";

import { groupShowers } from "@/lib/shower";
import type { SeriesPoint } from "@/lib/query-spec";

/** Wet-increment point helper. */
const p = (t: string, v: number): SeriesPoint => ({ t, v });

describe("groupShowers", () => {
  it("merges two wet readings 1h apart into a single event", () => {
    const events = groupShowers([
      p("2026-07-05T10:00:00Z", 1),
      p("2026-07-05T11:00:00Z", 2),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      durationH: 1,
      totalMm: 3,
      peakRateMmH: 2,
    });
  });

  it("splits readings separated by a 10h dry gap into two events", () => {
    const events = groupShowers([
      p("2026-07-05T00:00:00Z", 1),
      p("2026-07-05T10:00:00Z", 5),
    ]);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.totalMm)).toEqual([1, 5]);
    for (const e of events) {
      expect(e.durationH).toBe(0);
      expect(e.peakRateMmH).toBe(0);
    }
  });

  it("floors the rate gap at the ~5-min archive interval (12, not 60)", () => {
    // 1-min gap is below the 5/60h floor → rate uses 5/60h: 1 ÷ (5/60) = 12.
    const events = groupShowers([
      p("2026-07-05T10:00:00Z", 0.5),
      p("2026-07-05T10:01:00Z", 1),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].peakRateMmH).toBe(12);
    expect(events[0].totalMm).toBe(1.5);
  });

  it("drops unparseable timestamps and non-positive increments", () => {
    const events = groupShowers([
      p("not-a-date", 5), // dropped: unparseable timestamp
      p("2026-07-05T10:00:00Z", -2), // dropped: non-positive value
      p("2026-07-05T11:00:00Z", 3), // the only surviving reading
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].totalMm).toBe(3);
  });

  it("returns [] for empty input", () => {
    expect(groupShowers([])).toEqual([]);
  });

  it("falls back to the 4h default MIT for 0 / NaN mitHours", () => {
    // 1h apart: with the 4h default they stay ONE event; a literal 0/NaN MIT
    // would split them. A single event proves the fallback kicked in.
    const pts = [p("2026-07-05T10:00:00Z", 1), p("2026-07-05T11:00:00Z", 2)];
    expect(groupShowers(pts, 0)).toHaveLength(1);
    expect(groupShowers(pts, Number.NaN)).toHaveLength(1);
  });
});
