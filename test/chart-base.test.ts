import { describe, expect, it } from "vitest";

import { deDateTime, deNum, seriesColor } from "@/components/charts/chart-base";
import { WAPPEN_PALETTE } from "@/lib/colors";
import type { ResolvedSeries } from "@/lib/query-spec";

const s = (color?: string): ResolvedSeries => ({
  id: "s",
  label: "x",
  unit: "°C",
  points: [],
  ...(color ? { color } : {}),
});

describe("deNum", () => {
  it("formats DE with a comma and a typographic minus (U+2212)", () => {
    expect(deNum(-17.6)).toBe("−17,6"); // − not -
  });

  it("respects a 0-decimal request", () => {
    expect(deNum(5, 0)).toBe("5");
  });
});

describe("deDateTime", () => {
  it("formats an ISO instant in Europe/Berlin local time", () => {
    // 2020-10-13T00:00Z is 02:00 CEST → still the 13th locally.
    expect(deDateTime("2020-10-13T00:00:00Z")).toContain("13.10.2020");
  });

  it("falls back to the raw string for an unparseable value", () => {
    expect(deDateTime("garbage")).toBe("garbage");
  });
});

describe("seriesColor", () => {
  it("uses a persisted colour when present", () => {
    expect(seriesColor([s("#abcdef")], 0)).toBe("#abcdef");
  });

  it("falls back to the palette by index", () => {
    expect(seriesColor([s()], 0)).toBe(WAPPEN_PALETTE[0]);
    expect(seriesColor([], 0)).toBe(WAPPEN_PALETTE[0]);
  });

  it("wraps the palette index with a modulo", () => {
    expect(seriesColor([], WAPPEN_PALETTE.length)).toBe(WAPPEN_PALETTE[0]);
  });
});
