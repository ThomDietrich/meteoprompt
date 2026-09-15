/**
 * spec-17 E — cheap sanity check BEFORE the LLM call.
 *
 * A keyboard-mash prompt was answered normally in production (a chart, 7.7 s, one
 * paid API call). The catch: it carried a valid question in its head and tail, so a
 * blunt rejection would also throw away real requests. This check therefore looks
 * only for signals that no German question produces, and the caller asks the user to
 * rephrase rather than pretending the request was understood.
 *
 * Pure and dependency-free → unit-tested against the documented production prompts.
 */

/** Shortest input we even try to map ("W" cost a full API call in production). */
const MIN_LENGTH = 3;

/**
 * Longest run of consecutive consonants. Measured against real prompts: German goes
 * further than it looks — "Durchschnittstemperatur" has 7 (rchschn) and
 * "Angstschweiß" 8 — while the documented keyboard mash had 13. Nine keeps every
 * real word safe and still catches mashed input.
 */
export const MAX_CONSONANT_RUN = 9;

/** No German word is this long; a token beyond it is mashed input, not language. */
const MAX_TOKEN_LENGTH = 40;

const VOWELS = "aeiouyäöüàáâéèêíìóòôúù";

export type InputVerdict = { ok: true } | { ok: false; detail: string };

const RETRY_HINT =
  "Bitte die Frage kurz neu formulieren (z. B. „Wind und Böen von gestern“).";

/** Longest run of consecutive consonant letters in `token`. */
export function longestConsonantRun(token: string): number {
  let run = 0;
  let longest = 0;
  for (const ch of token.toLowerCase()) {
    const isLetter = /\p{L}/u.test(ch);
    if (isLetter && !VOWELS.includes(ch)) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  return longest;
}

/** Judge a free-text query before it reaches the model. */
export function checkQuery(query: string): InputVerdict {
  const trimmed = query.trim();

  if (trimmed.length < MIN_LENGTH) {
    return {
      ok: false,
      detail: `Die Eingabe ist zu kurz, um sie zuzuordnen. ${RETRY_HINT}`,
    };
  }

  for (const token of trimmed.split(/\s+/)) {
    if (token.length > MAX_TOKEN_LENGTH || longestConsonantRun(token) >= MAX_CONSONANT_RUN) {
      return {
        ok: false,
        detail: `Die Eingabe enthält eine sehr lange unleserliche Zeichenfolge. ${RETRY_HINT}`,
      };
    }
  }

  return { ok: true };
}
