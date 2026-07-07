import { describe, expect, it } from "vitest";

import { computeSummaryStats } from "@/lib/summary";
import type { ResolvedSeries } from "@/lib/query-spec";

const line = (values: number[]): ResolvedSeries[] => [
  {
    id: "s",
    label: "Temp",
    unit: "°C",
    points: values.map((v, i) => ({ t: `2026-06-0${i + 1}T00:00:00Z`, v })),
  },
];

describe("computeSummaryStats", () => {
  it("derives n/min/max/mean/sum/first/last + a rising trend", () => {
    const s = computeSummaryStats(line([10, 20, 30]));
    expect(s.n).toBe(3);
    expect(s.min?.value).toBe(10);
    expect(s.max?.value).toBe(30);
    expect(s.mean).toBe(20);
    expect(s.sum).toBe(60);
    expect(s.first?.value).toBe(10);
    expect(s.last?.value).toBe(30);
    expect(s.trend).toBe("steigend");
  });

  it("treats a sub-2% first→last delta as gleichbleibend", () => {
    expect(computeSummaryStats(line([100, 101])).trend).toBe("gleichbleibend");
  });

  it("reports a falling trend", () => {
    expect(computeSummaryStats(line([100, 80])).trend).toBe("fallend");
  });

  it("returns empty stats for no series", () => {
    const s = computeSummaryStats([]);
    expect(s.n).toBe(0);
    expect(s.min).toBeNull();
    expect(s.max).toBeNull();
    expect(s.trend).toBeNull();
  });
});
