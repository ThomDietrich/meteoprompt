import { describe, expect, it } from "vitest";

import { fiveNumber, quantile } from "@/lib/stats";

describe("fiveNumber", () => {
  it("returns the exact five-number summary for an odd-length set", () => {
    expect(fiveNumber([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5]);
  });

  it("interpolates the quartiles for an even-length set", () => {
    expect(fiveNumber([1, 2, 3, 4])).toEqual([1, 1.75, 2.5, 3.25, 4]);
  });

  it("returns all zeros for an empty set", () => {
    expect(fiveNumber([])).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("quantile", () => {
  it("returns 0 for an empty set", () => {
    expect(quantile([], 0.5)).toBe(0);
  });
});
