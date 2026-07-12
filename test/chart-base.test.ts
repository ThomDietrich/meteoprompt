import { describe, expect, it } from "vitest";

import {
  deDate,
  deDateTime,
  deNum,
  inferGrain,
  isoWeek,
  periodAxisLabel,
  periodLabel,
  periodQualifier,
  periodTooltipHead,
  seriesColor,
} from "@/components/charts/chart-base";
import { WAPPEN_PALETTE } from "@/lib/colors";
import type { ResolvedSeries } from "@/lib/query-spec";

const DAY = 86_400_000;
/** Local-midnight epoch ms (tests pin TZ=Europe/Berlin). */
const localMidnight = (y: number, m: number, d: number) => new Date(y, m, d).getTime();
/** Build spec-13 bucket points spaced `stepMs` apart from a local-midnight start. */
const pts = (y: number, m: number, d: number, stepMs: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ t: new Date(localMidnight(y, m, d) + i * stepMs).toISOString() }));

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

describe("deDate (date-only, no time)", () => {
  it("formats an ISO instant as DD.MM.YYYY in Europe/Berlin", () => {
    // 10:00Z in July (CEST) → 12:00 local, still the 7th; no time in the output.
    expect(deDate("2026-07-07T10:00:00Z")).toBe("07.07.2026");
  });
  it("falls back to the raw string for garbage", () => {
    expect(deDate("nope")).toBe("nope");
  });
});

describe("isoWeek (ISO-8601, local)", () => {
  it("puts Jan 4 in week 1 and the next Monday in week 2 (2026)", () => {
    expect(isoWeek(new Date(2026, 0, 4))).toBe(1); // Sun 04.01 → week 1
    expect(isoWeek(new Date(2026, 0, 5))).toBe(2); // Mon 05.01 → week 2
  });
  it("computes a mid-year week (Mon 06.07.2026 = KW 28)", () => {
    expect(isoWeek(new Date(2026, 6, 6))).toBe(28);
  });
});

describe("inferGrain (median gap → bucket grain)", () => {
  it("classifies hour/day/week/month spacing", () => {
    expect(inferGrain(pts(2026, 6, 1, 3_600_000, 5))).toBe("hour");
    expect(inferGrain(pts(2026, 6, 1, DAY, 5))).toBe("day");
    expect(inferGrain(pts(2026, 6, 1, 7 * DAY, 5))).toBe("week");
    expect(inferGrain(pts(2026, 0, 1, 30 * DAY, 5))).toBe("month");
  });
  it("defaults an empty or single-point series to day", () => {
    expect(inferGrain([])).toBe("day");
    expect(inferGrain(pts(2026, 6, 1, DAY, 1))).toBe("day");
  });
  it("stays daily when two series share a grid (duplicate timestamps → 0 gaps skipped)", () => {
    // Multi-series bars: two daily series flattened → each timestamp appears twice.
    const two = [...pts(2026, 6, 1, DAY, 5), ...pts(2026, 6, 1, DAY, 5)];
    expect(inferGrain(two)).toBe("day");
  });
});

describe("periodTooltipHead (names the period, no 00:00)", () => {
  const start = localMidnight(2026, 6, 7); // Tue 07.07.2026, local midnight
  it("labels a day with weekday + date, no time", () => {
    expect(periodTooltipHead("day", start, start + DAY)).toBe("Di, 07.07.2026");
  });
  it("upgrades a Monday-aligned 7d bucket to KW + range", () => {
    const mon = localMidnight(2026, 6, 6);
    expect(periodTooltipHead("week", mon, mon + 7 * DAY)).toBe("KW 28 · 06.07.–12.07.2026");
  });
  it("upgrades a 1st-of-month bucket to the month name", () => {
    const jul1 = localMidnight(2026, 6, 1);
    const aug1 = localMidnight(2026, 7, 1);
    expect(periodTooltipHead("month", jul1, aug1)).toBe("Juli 2026");
  });
  it("falls back to an inclusive date range for a non-calendar-aligned bucket", () => {
    const thu = localMidnight(2026, 6, 2); // Thu, not a Monday
    expect(periodTooltipHead("week", thu, thu + 7 * DAY)).toBe("02.07.2026 – 08.07.2026");
  });
});

describe("periodLabel (compact table cell)", () => {
  it("renders a plain date for a day (no weekday, no 00:00)", () => {
    const d = localMidnight(2026, 6, 7);
    expect(periodLabel("day", d, d + DAY)).toBe("07.07.2026");
  });
  it("renders KW + range for a Monday week", () => {
    const mon = localMidnight(2026, 6, 6);
    expect(periodLabel("week", mon, mon + 7 * DAY)).toBe("KW 28 (06.07.–12.07.2026)");
  });
  it("renders the month name for a calendar month", () => {
    expect(periodLabel("month", localMidnight(2026, 6, 1), localMidnight(2026, 7, 1))).toBe("Juli 2026");
  });
  it("falls back to a date range for a non-aligned bucket", () => {
    const thu = localMidnight(2026, 6, 2);
    expect(periodLabel("week", thu, thu + 7 * DAY)).toBe("02.07.2026 – 08.07.2026");
  });
});

describe("periodAxisLabel / periodQualifier", () => {
  it("renders a compact per-grain tick", () => {
    expect(periodAxisLabel("day", localMidnight(2026, 6, 7))).toBe("07.07.");
    expect(periodAxisLabel("week", localMidnight(2026, 6, 6))).toBe("KW 28");
    expect(periodAxisLabel("month", localMidnight(2026, 6, 1))).toBe("Jul 26");
    expect(periodAxisLabel("hour", new Date(2026, 6, 7, 14).getTime())).toBe("14:00");
  });
  it("names the neutral qualifier per grain", () => {
    expect(periodQualifier("day")).toBe("Tageswert");
    expect(periodQualifier("month")).toBe("Monatswert");
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
