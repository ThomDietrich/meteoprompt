import { describe, expect, it } from "vitest";

import {
  adaptiveWindow,
  compareOp,
  dayKey,
  dayLengthHours,
  durationMs,
  extremeWindow,
  rangeSpanMs,
  sanitizeRangeToken,
  sanitizeWindow,
} from "@/lib/flux-helpers";

describe("sanitizeRangeToken (Flux-injection guard)", () => {
  it("normalises now, relative and ISO tokens; rejects junk to the fallback", () => {
    expect(sanitizeRangeToken("now", "-7d")).toBe("now()");
    expect(sanitizeRangeToken("-730d", "-7d")).toBe("-730d");
    expect(sanitizeRangeToken("2026-06-01T00:00:00Z", "-7d")).toBe(
      "2026-06-01T00:00:00.000Z",
    );
    expect(sanitizeRangeToken("DROP TABLE", "-7d")).toBe("-7d");
  });
});

describe("sanitizeWindow", () => {
  it("accepts a well-formed window; everything else → fallback", () => {
    expect(sanitizeWindow("30m", "1d")).toBe("30m");
    expect(sanitizeWindow("-1h", "1d")).toBe("1d"); // no leading minus allowed
    expect(sanitizeWindow(undefined, "1d")).toBe("1d");
    expect(sanitizeWindow("abc", "1d")).toBe("1d");
  });
});

describe("adaptiveWindow", () => {
  it("coarsens a long range past ~800 buckets, never finer than requested", () => {
    const w = adaptiveWindow({ start: "-730d" }, "1h");
    // coarser than the requested 1h ...
    expect(durationMs(w)!).toBeGreaterThan(durationMs("1h")!);
    // ... and yields at most ~800 buckets.
    const span = rangeSpanMs({ start: "-730d" })!;
    expect(span / durationMs(w)!).toBeLessThanOrEqual(800);
  });

  it("leaves a short range at its requested window", () => {
    expect(adaptiveWindow({ start: "-7d" }, "1h")).toBe("1h");
  });

  it("does not go finer when the requested window is already coarse", () => {
    expect(adaptiveWindow({ start: "-730d" }, "1d")).toBe("1d");
  });
});

describe("durationMs", () => {
  it("converts window tokens to milliseconds, null on garbage", () => {
    expect(durationMs("2h")).toBe(7_200_000);
    expect(durationMs("1mo")).toBe(2_592_000_000);
    expect(durationMs("bad")).toBeNull();
  });
});

describe("dayLengthHours (astronomical, lat 51.08 = station)", () => {
  it("is long in summer and short in winter", () => {
    const summer = dayLengthHours(51.08, new Date("2026-06-21T12:00:00Z"));
    const winter = dayLengthHours(51.08, new Date("2026-12-21T12:00:00Z"));
    expect(summer).toBeGreaterThan(16);
    expect(summer).toBeLessThan(17);
    expect(winter).toBeGreaterThan(7);
    expect(winter).toBeLessThan(8);
  });

  it("clamps polar day to 24h", () => {
    expect(dayLengthHours(80, new Date("2026-06-21T12:00:00Z"))).toBe(24);
  });
});

describe("compareOp", () => {
  it("passes a valid operator through and defaults junk to >", () => {
    expect(compareOp("<=")).toBe("<=");
    expect(compareOp("bad")).toBe(">");
  });
});

describe("dayKey (Europe/Berlin calendar day)", () => {
  it("shifts a late-evening UTC instant into the next Berlin day", () => {
    // 22:30Z in July (CEST, +2h) → 00:30 the next local day.
    expect(dayKey("2026-07-05T22:30:00Z")).toBe("2026-07-06");
  });
});

describe("extremeWindow", () => {
  it("scales the envelope with the range", () => {
    expect(extremeWindow(durationMs("1d"))).toBe("15m");
    expect(extremeWindow(durationMs("7d"))).toBe("1h");
    expect(extremeWindow(durationMs("60d"))).toBe("6h");
    expect(extremeWindow(durationMs("365d"))).toBe("1d");
    expect(extremeWindow(durationMs("1000d"))).toBe("3d");
    expect(extremeWindow(null)).toBe("1d");
  });

  it("never goes below 1d for daily-grain series", () => {
    expect(extremeWindow(durationMs("7d"), true)).toBe("1d");
    expect(extremeWindow(durationMs("60d"), true)).toBe("1d");
    expect(extremeWindow(durationMs("1000d"), true)).toBe("3d");
  });
});
