import { describe, expect, it } from "vitest";

import { CATALOG, HISTORY_DEPTH, getByKey } from "@/lib/catalog";
import {
  answerKeepsMeaning,
  berlinDay,
  planHistory,
  rangeStartMs,
  startsBeforeHistory,
} from "@/lib/history";
import type { Aggregation, ChartSpec } from "@/lib/query-spec";

const NOW = Date.parse("2026-09-15T12:00:00Z");

function lineSpec(
  metric: string,
  aggregation: Aggregation,
  start: string,
  extra: Partial<ChartSpec> = {},
): ChartSpec {
  return {
    id: "c0",
    title: "t",
    chart: "line",
    timeRange: { start, stop: "now" },
    series: [
      { id: "c0s0", label: "x", source: { kind: "metric", metric, aggregation, window: "1d" } },
    ],
    ...extra,
  };
}

describe("rangeStartMs", () => {
  it("resolves relative, absolute and now tokens; null on junk", () => {
    expect(rangeStartMs({ start: "-1d" }, NOW)).toBe(NOW - 86_400_000);
    expect(rangeStartMs({ start: "2026-07-01T00:00:00Z" }, NOW)).toBe(
      Date.parse("2026-07-01T00:00:00Z"),
    );
    expect(rangeStartMs({ start: "now" }, NOW)).toBe(NOW);
    expect(rangeStartMs({ start: "bogus" }, NOW)).toBeNull();
  });

  it("treats month and year tokens as calendar units, like Flux", () => {
    expect(rangeStartMs({ start: "-3mo" }, NOW)).toBe(Date.parse("2026-06-15T12:00:00Z"));
    expect(rangeStartMs({ start: "-1y" }, NOW)).toBe(Date.parse("2025-09-15T12:00:00Z"));
  });

  it("clamps to the target month's last day, matching Flux date.sub", () => {
    const at = (iso: string) => Date.parse(iso);
    expect(rangeStartMs({ start: "-3mo" }, at("2026-05-31T12:00:00Z"))).toBe(at("2026-02-28T12:00:00Z"));
    expect(rangeStartMs({ start: "-1mo" }, at("2026-03-31T12:00:00Z"))).toBe(at("2026-02-28T12:00:00Z"));
    expect(rangeStartMs({ start: "-1mo" }, at("2026-07-31T12:00:00Z"))).toBe(at("2026-06-30T12:00:00Z"));
    expect(rangeStartMs({ start: "-1y" }, at("2028-02-29T12:00:00Z"))).toBe(at("2027-02-28T12:00:00Z"));
  });
});

describe("berlinDay", () => {
  it("uses the Berlin calendar day, not the UTC day", () => {
    expect(berlinDay(Date.parse("2026-07-04T22:30:00Z"))).toBe("2026-07-05"); // 00:30 CEST
    expect(berlinDay(Date.parse("2026-01-01T22:30:00Z"))).toBe("2026-01-01"); // 23:30 CET
  });
});

describe("catalog history metadata", () => {
  it("merges every HISTORY_DEPTH entry into an existing catalog key", () => {
    for (const [key, h] of Object.entries(HISTORY_DEPTH)) {
      expect(getByKey(key)?.historyFrom, key).toBe(h.historyFrom);
    }
  });

  it("uses YYYY-MM-DD dates and fallbacks that exist, share the unit and reach further back", () => {
    for (const e of CATALOG) {
      if (e.historyFrom) expect(e.historyFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (!e.historyFallback) continue;
      expect(e.historyFrom, e.key).toBeDefined();
      const fb = getByKey(e.historyFallback.metric);
      expect(fb, `${e.key} → ${e.historyFallback.metric}`).toBeDefined();
      expect(fb!.unit).toBe(e.unit);
      // Tripwire: planHistory's uniform-grain rule holds because every equivalent is daily.
      // A finer fallback would have to compare windows there too.
      expect(e.historyFallback.window, e.key).toBe("1d");
      expect((fb!.historyFrom ?? "0000-00-00") < e.historyFrom!).toBe(true);
    }
  });

  it("keeps the backfilled temperature extremes at full history", () => {
    expect(getByKey("outdoor_temp_daily_max")?.historyFrom).toBeUndefined();
    expect(getByKey("outdoor_temp_daily_min")?.historyFrom).toBeUndefined();
  });
});

describe("startsBeforeHistory", () => {
  it("compares Berlin calendar days", () => {
    const cat = getByKey("dry_spell")!; // historyFrom 2026-07-05
    expect(startsBeforeHistory(cat, { start: "2026-07-04T21:59:00Z" }, NOW)).toBe(true); // 04.07. 23:59
    expect(startsBeforeHistory(cat, { start: "2026-07-04T22:00:00Z" }, NOW)).toBe(false); // 05.07. 00:00
  });
});

describe("answerKeepsMeaning", () => {
  it("accepts only the reading that matches the equivalent's extreme, counts only per day", () => {
    expect(answerKeepsMeaning({ kind: "extreme", mode: "max", metric: "m" }, "max")).toBe(true);
    expect(answerKeepsMeaning({ kind: "extreme", mode: "min", metric: "m" }, "max")).toBe(false);
    expect(answerKeepsMeaning({ kind: "scalar", agg: "mean", metric: "m" }, "max")).toBe(false);
    expect(
      answerKeepsMeaning({ kind: "count", metric: "m", op: ">", threshold: 30, per: "day" }, "max"),
    ).toBe(true);
    expect(
      answerKeepsMeaning({ kind: "count", metric: "m", op: ">", threshold: 30, per: "hour" }, "max"),
    ).toBe(false);
    expect(
      answerKeepsMeaning({ kind: "count", metric: "m", op: "<", threshold: 0, per: "day" }, "min"),
    ).toBe(true);
  });
});

describe("planHistory", () => {
  it("returns the same spec and no notice when the range is covered", () => {
    const spec = lineSpec("outdoor_temp_18h_max", "max", "-7d");
    const plan = planHistory(spec, NOW);
    expect(plan.spec).toBe(spec);
    expect(plan.notice).toBeUndefined();
  });

  it("swaps a late series for its long-history equivalent and says so", () => {
    const plan = planHistory(lineSpec("outdoor_temp_18h_max", "mean", "-150d"), NOW);
    expect(plan.spec.series[0].source).toEqual({
      kind: "metric",
      metric: "outdoor_temp_daily_max",
      aggregation: "max",
      window: "1d",
    });
    expect(plan.spec.series[0].id).toBe("c0s0");
    expect(plan.notice).toContain("05.07.2026");
    expect(plan.notice).toContain("Tageshöchsttemperatur");
  });

  it("only notes the gap when no usable equivalent exists", () => {
    for (const [metric, agg, day] of [
      ["sunshine_duration", "sum", "30.06.2026"],
      ["wind_gust_daily_max", "max", "06.07.2026"],
      ["rain_24h", "max", "03.07.2026"],
    ] as const) {
      const spec = lineSpec(metric, agg, "-365d");
      const plan = planHistory(spec, NOW);
      expect(plan.spec, metric).toBe(spec);
      expect(plan.notice, metric).toContain(day);
    }
  });

  it("swaps a metric in every series so a comparison never mixes readings", () => {
    const spec = lineSpec("outdoor_temp_18h_max", "max", "-7d");
    spec.series = [
      {
        id: "a",
        label: "August 2026",
        timeRange: { start: "2026-08-01T00:00:00Z", stop: "2026-09-01T00:00:00Z" },
        source: { kind: "metric", metric: "outdoor_temp_18h_max", aggregation: "max", window: "1d" },
      },
      {
        id: "b",
        label: "August 2025",
        timeRange: { start: "2025-08-01T00:00:00Z", stop: "2025-09-01T00:00:00Z" },
        source: { kind: "metric", metric: "outdoor_temp_18h_max", aggregation: "max", window: "1d" },
      },
    ];
    const plan = planHistory(spec, NOW);
    expect(plan.spec.series.map((s) => (s.source.kind === "metric" ? s.source.metric : ""))).toEqual([
      "outdoor_temp_daily_max",
      "outdoor_temp_daily_max",
    ]);
  });

  it("swaps the answer along with the series when it keeps its meaning", () => {
    const plan = planHistory(
      lineSpec("outdoor_temp_18h_max", "max", "-2y", {
        answer: { kind: "extreme", mode: "max", metric: "outdoor_temp_18h_max" },
      }),
      NOW,
    );
    expect(plan.spec.series[0].source).toMatchObject({ metric: "outdoor_temp_daily_max" });
    expect(plan.spec.answer).toMatchObject({ metric: "outdoor_temp_daily_max" });
  });

  it("does not swap at all when the answer would change meaning", () => {
    const spec = lineSpec("outdoor_temp_18h_max", "max", "-2y", {
      answer: { kind: "extreme", mode: "min", metric: "outdoor_temp_18h_max" },
    });
    const plan = planHistory(spec, NOW);
    expect(plan.spec).toBe(spec);
    expect(plan.notice).toContain("05.07.2026");
  });

  it("does not swap for chart types that read the raw values directly", () => {
    for (const chart of ["heatmapCalendar", "candlestick", "rangeBand", "boxplot", "scatter", "themeRiver"] as const) {
      const spec = lineSpec("outdoor_temp_18h_max", "max", "-365d", { chart });
      const plan = planHistory(spec, NOW);
      expect(plan.spec, chart).toBe(spec);
      expect(plan.notice, chart).toContain("05.07.2026");
    }
  });

  it("does not swap for an hourly count", () => {
    const spec = lineSpec("outdoor_temp_18h_max", "max", "-2y", {
      answer: { kind: "count", metric: "outdoor_temp_18h_max", op: ">", threshold: 30, per: "hour" },
    });
    expect(planHistory(spec, NOW).spec).toBe(spec);
  });

  it("swaps every series when each metric has a daily equivalent", () => {
    const spec = lineSpec("outdoor_temp_18h_max", "max", "-150d");
    spec.series.push({
      id: "c0s1",
      label: "Tief",
      source: { kind: "metric", metric: "outdoor_temp_18h_min", aggregation: "min", window: "1d" },
    });
    const plan = planHistory(spec, NOW);
    expect(plan.spec.series.map((s) => (s.source.kind === "metric" ? s.source.metric : ""))).toEqual([
      "outdoor_temp_daily_max",
      "outdoor_temp_daily_min",
    ]);
    expect(plan.notice).toContain("Tagestiefsttemperatur");
  });

  it("does not swap when the chart also shows other metrics", () => {
    const spec = lineSpec("outdoor_temp_18h_max", "max", "-80d", { chart: "table" });
    spec.series.push({
      id: "c0s1",
      label: "y",
      source: { kind: "metric", metric: "outdoor_temperature", aggregation: "mean", window: "1h" },
    });
    const plan = planHistory(spec, NOW);
    expect(plan.spec).toBe(spec);
    expect(plan.notice).toContain("05.07.2026");
  });
});
