import { describe, expect, it } from "vitest";

import { applyTransform, defaultBase, isTransform } from "@/lib/transforms";
import type { SeriesPoint } from "@/lib/query-spec";

/** Build daily-mean points from bare values (timestamps are irrelevant here). */
const daily = (values: number[]): SeriesPoint[] =>
  values.map((v, i) => ({ t: `2026-06-0${i + 1}T00:00:00Z`, v }));

describe("applyTransform", () => {
  it("computes GDD (base 10) cumulative + total + unit + label", () => {
    const r = applyTransform("gdd", daily([12, 8, 15]));
    expect(r.cumulative.map((p) => p.v)).toEqual([2, 2, 7]);
    expect(r.total).toBe(7);
    expect(r.unit).toBe("°C·d");
    expect(r.label).toBe("Wachstumsgradtage (GDD), Basis 10 °C");
  });

  it("computes HDD (base 18) cumulative + total", () => {
    const r = applyTransform("hdd", daily([10, 20]));
    expect(r.cumulative.map((p) => p.v)).toEqual([8, 8]);
    expect(r.total).toBe(8);
  });

  it("computes CDD (base 18) cumulative + total", () => {
    const r = applyTransform("cdd", daily([20, 25]));
    expect(r.cumulative.map((p) => p.v)).toEqual([2, 9]);
    expect(r.total).toBe(9);
  });

  it("honours a custom base (GDD base 5)", () => {
    const r = applyTransform("gdd", daily([15]), 5);
    expect(r.total).toBe(10);
  });
});

describe("isTransform / defaultBase", () => {
  it("recognises the degree-day transforms but not waterBalance", () => {
    expect(isTransform("gdd")).toBe(true);
    expect(isTransform("waterBalance")).toBe(false);
  });

  it("returns the default base for a transform", () => {
    expect(defaultBase("hdd")).toBe(18);
  });
});
