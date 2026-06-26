/**
 * Wappen-derived colour palette + random distinct series-colour assignment
 * (spec-04 §5). Colours are assigned ONCE at card creation and persisted in
 * ChartSpec.series[].color — never re-rolled on render — so a card looks the
 * same across reloads.
 *
 * Shared (no server-only dep): used client-side when building/regenerating cards.
 */

/** 11 tones from the three Wappen main colours (3 shades each) + 2 accents. */
export const WAPPEN_PALETTE = [
  // Blau
  "#3E86D8",
  "#1F5BA8",
  "#143C6E",
  // Gold
  "#F6C04E",
  "#F2A81C",
  "#B87A0E",
  // Grün
  "#4FB86A",
  "#2E9D46",
  "#1E6E30",
  // Akzente
  "#5B7FB4", // Graublau
  "#C2492E", // Ziegelrot
] as const;

/**
 * Pick `count` distinct random colours from the palette. If more colours are
 * requested than the palette holds, it wraps (still spreading them out).
 * `avoid` lets the regenerate flow bias away from the current colours so a
 * re-roll looks visibly different.
 */
export function pickDistinctColors(
  count: number,
  avoid: readonly string[] = [],
): string[] {
  const pool = WAPPEN_PALETTE.filter((c) => !avoid.includes(c));
  // If avoidance emptied the pool (asked to avoid everything), fall back to all.
  const source = pool.length >= Math.min(count, 1) ? pool : [...WAPPEN_PALETTE];

  const shuffled = [...source];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(shuffled[i % shuffled.length]);
  }
  return out;
}

/**
 * Assign a distinct colour to each series that doesn't already have one.
 * Mutates a shallow copy and returns it; existing colours are preserved so a
 * persisted card keeps its look. Returns a new array of series.
 */
export function assignSeriesColors<T extends { color?: string }>(
  series: T[],
  avoid: readonly string[] = [],
): T[] {
  const need = series.filter((s) => !s.color).length;
  if (need === 0) return series;

  const used = series.map((s) => s.color).filter(Boolean) as string[];
  const fresh = pickDistinctColors(need, [...avoid, ...used]);
  let fi = 0;
  return series.map((s) =>
    s.color ? s : { ...s, color: fresh[fi++] ?? WAPPEN_PALETTE[0] },
  );
}
