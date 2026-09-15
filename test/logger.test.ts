import { describe, expect, it } from "vitest";

import { consoleLine } from "@/lib/logger";

describe("consoleLine (spec-15 event rendering)", () => {
  it("renders a successful prompt with chart types + duration", () => {
    expect(
      consoleLine({
        event: "prompt_ok",
        query: "Regen letzte Woche",
        chartTypes: ["bars"],
        chartCount: 1,
        durationMs: 512,
      }),
    ).toBe('[prompt] ok · "Regen letzte Woche" · bars · 512ms');
  });

  it("renders a prompt error with reason + detail", () => {
    expect(
      consoleLine({ event: "prompt_error", query: "x", reason: "timeout", detail: "deadline" }),
    ).toBe('[prompt] error · "x" · timeout · deadline');
  });

  it("renders a chart render with its type, range and duration (spec-17 C)", () => {
    expect(
      consoleLine({
        event: "chart_ok",
        query: "Tagesregen (30 Tage)",
        chartTypes: ["bars"],
        range: "-30d→now",
        durationMs: 1840,
      }),
    ).toBe('[chart] ok · "Tagesregen (30 Tage)" · bars · -30d→now · 1840ms');
  });

  it("renders server + db lifecycle events", () => {
    expect(consoleLine({ event: "server_start" })).toBe("[server] start");
    expect(consoleLine({ event: "db_connect", bucket: "weather" })).toBe(
      "[db] connect · bucket=weather",
    );
    expect(consoleLine({ event: "db_error", detail: "unauthorized" })).toBe(
      "[db] error · unauthorized",
    );
  });

  it("quotes the query so newlines/commas can't break the line", () => {
    expect(consoleLine({ event: "prompt_received", query: 'a\nb "c"' })).toBe(
      '[prompt] received · "a\\nb \\"c\\""',
    );
  });
});
