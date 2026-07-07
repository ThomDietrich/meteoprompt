import { describe, expect, it } from "vitest";

import {
  assignSeriesColors,
  pickDistinctColors,
  WAPPEN_PALETTE,
} from "@/lib/colors";

const PALETTE = WAPPEN_PALETTE as readonly string[];

describe("pickDistinctColors", () => {
  it("returns exactly `count` colours, all from the palette", () => {
    const out = pickDistinctColors(3);
    expect(out).toHaveLength(3);
    for (const c of out) expect(PALETTE).toContain(c);
  });

  it("returns [] for a count of 0", () => {
    expect(pickDistinctColors(0)).toEqual([]);
  });

  it("wraps past the palette size without throwing", () => {
    const n = WAPPEN_PALETTE.length + 9;
    const out = pickDistinctColors(n);
    expect(out).toHaveLength(n);
    for (const c of out) expect(PALETTE).toContain(c);
  });
});

describe("assignSeriesColors", () => {
  it("preserves existing colours and only fills the gaps from the palette", () => {
    const result = assignSeriesColors([{ color: "#3E86D8" }, {}]);
    expect(result[0].color).toBe("#3E86D8"); // preserved
    expect(result[1].color).toBeDefined(); // filled
    expect(PALETTE).toContain(result[1].color as string);
  });

  it("returns the input untouched when every series already has a colour", () => {
    const input = [{ color: "#F2A81C" }, { color: "#2E9D46" }];
    expect(assignSeriesColors(input)).toBe(input);
  });
});
