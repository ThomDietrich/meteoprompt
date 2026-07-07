/**
 * Demo example prompts shown as clickable pills above the search box (spec-09 C).
 * Clicking one fills the prompt into the textarea (no auto-submit). `pickExamples`
 * returns N distinct random ones; the search box picks once per mount so the
 * selection is stable per page load but varies across reloads.
 */

import { shuffle } from "@/lib/utils";

export const EXAMPLE_PROMPTS: string[] = [
  "Außentemperatur der letzten 4 Wochen",
  "Wie viel hat es diese Woche geregnet?",
  "Wärmster Tag im letzten Monat",
  "Regen pro Schauer der letzten Wochen",
  "Wind und Böen von gestern",
  "Luftfeuchte der letzten 7 Tage",
  "Monatsregen in diesem Jahr",
  "Tagesverlauf der Temperatur von gestern",
  "Wie schwül war es letzte Woche?",
  "Höchste Windböe im letzten Monat",
  "Luftdruck der letzten 3 Tage",
  "Durchschnittstemperatur der letzten 3 Tage als Tabelle",
  "UV-Index dieser Woche",
  "Verdunstung der letzten 2 Wochen",
  "Vergleich: Temperatur diese vs. letzte Woche",
  "Kältester Zeitpunkt in diesem Jahr",
];

/** N distinct example prompts in random order (clamped to the pool size). */
export function pickExamples(n = 3): string[] {
  const pool = shuffle([...EXAMPLE_PROMPTS]);
  return pool.slice(0, Math.min(n, pool.length));
}
