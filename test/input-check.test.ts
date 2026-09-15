import { describe, expect, it } from "vitest";

import { MAX_CONSONANT_RUN, checkQuery, longestConsonantRun } from "@/lib/input-check";

/** Real prompts from the production log that MUST keep working (spec-17 E). */
const ECHTE_PROMPTS = [
  "Atréju möchte heute baden. Wie warm war es gestern?",
  "Gab es die letzten fünf Tage Badewetter",
  "Zeige mir den Verlauf der Maximaltemperatur pro Tag über die letzten fünf Monate",
  "Wie schwül war es letzte Woche?",
  "Regen pro Schauer der letzten Wochen",
  "Durchschnittstemperatur der letzten 3 jahre als Tabelle",
  "Welche Windgeschwindigkeit war am 30.07.2026",
  "Wind und Böen von gestern",
  "Tageshöchsttemperatur und Tagestiefsttemperatur",
  "UV-Index dieser Woche",
  "Monatsregen in diesem Jahr",
  "05.09.2025",
];

/**
 * Stand-in for the documented keyboard mash (#2, 2026-08-04): same shape — a valid
 * question in head and tail with mashed input in between — but synthetic. The real
 * prompt is a user's input and stays out of this public repo.
 */
const SPAM = "Wind und Bösdjkfhgsdjkfhgsdjkfhgsdjkfhg xkjfhgxkjfhgxkjfhg von gestern";

describe("longestConsonantRun", () => {
  it("counts consecutive consonants; umlauts count as vowels", () => {
    expect(longestConsonantRun("Tageshöchsttemperatur")).toBe(5);
    expect(longestConsonantRun("Durchschnittstemperatur")).toBe(7);
    expect(longestConsonantRun("Angstschweiß")).toBe(8);
    expect(longestConsonantRun("jsjsjdjdhdhfff")).toBe(14);
  });

  it("keeps the threshold above the hardest real German words", () => {
    // These two are why the threshold is not 7 — they would have been rejected.
    expect(longestConsonantRun("Durchschnittstemperatur")).toBeLessThan(MAX_CONSONANT_RUN);
    expect(longestConsonantRun("Angstschweiß")).toBeLessThan(MAX_CONSONANT_RUN);
    expect(longestConsonantRun("jsjsjdjdhdhfff")).toBeGreaterThanOrEqual(MAX_CONSONANT_RUN);
  });
});

describe("checkQuery", () => {
  it("lets every real production prompt through", () => {
    for (const q of ECHTE_PROMPTS) {
      expect(checkQuery(q), q).toEqual({ ok: true });
    }
  });

  it("rejects the documented keyboard mash", () => {
    const verdict = checkQuery(SPAM);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.detail).toContain("unleserliche");
  });

  it("rejects a single letter instead of paying for an API call", () => {
    expect(checkQuery("W").ok).toBe(false);
    expect(checkQuery("  ").ok).toBe(false);
  });

  it("asks the user to rephrase rather than claiming it understood", () => {
    const verdict = checkQuery(SPAM);
    if (!verdict.ok) expect(verdict.detail).toContain("neu formulieren");
  });
});
