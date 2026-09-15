import { describe, expect, it } from "vitest";

import { todayHint } from "@/lib/claude";

/**
 * spec-17 A: the system prompt must state today's date. Without it the model
 * guessed, and rejected valid historical ranges as out_of_scope.
 */
describe("todayHint", () => {
  it("names today's date", () => {
    expect(todayHint(new Date("2026-09-16T10:00:00Z"))).toContain("16.09.2026");
  });

  it("uses the Berlin calendar day, not the UTC day", () => {
    // 22:30Z in summer is already the next day in Berlin (CEST).
    expect(todayHint(new Date("2026-07-04T22:30:00Z"))).toContain("05.07.2026");
    // 23:30Z in winter is still the same day in Berlin (CET).
    expect(todayHint(new Date("2026-01-01T22:30:00Z"))).toContain("01.01.2026");
  });

  it("states the archive start and that only the future is out of scope", () => {
    const hint = todayHint(new Date("2026-09-16T10:00:00Z"));
    expect(hint).toContain("19.10.2021");
    expect(hint).toContain("ZUKUNFT");
    expect(hint).toContain("VERGANGENHEIT");
  });
});
