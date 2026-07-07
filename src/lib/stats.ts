/**
 * Pure statistical helpers, extracted verbatim from boxplot-chart.tsx so they are
 * unit-testable without importing the client chart component (React + echarts).
 *
 * `quantile` uses linear interpolation between the two nearest ranks; `fiveNumber`
 * returns the boxplot 5-number summary [min, Q1, median, Q3, max]. Behaviour is
 * byte-identical to the originals — this is a move, not a rewrite.
 */

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

export function fiveNumber(values: number[]): [number, number, number, number, number] {
  const s = [...values].sort((a, b) => a - b);
  return [
    s[0] ?? 0,
    quantile(s, 0.25),
    quantile(s, 0.5),
    quantile(s, 0.75),
    s[s.length - 1] ?? 0,
  ];
}
