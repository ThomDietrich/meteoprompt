import "server-only";

import type { SeriesPoint, TransformName } from "@/lib/query-spec";

/**
 * Server-side degree-day transform registry (spec-05 §4). Computes derived
 * quantities from a series of DAILY-MEAN temperatures. The LLM only names the
 * transform + base; ALL maths happen here — never client- or LLM-supplied.
 *
 * - GDD (Growing Degree Days): Σ max(0, Tmean − base)   default base 10 °C
 * - HDD (Heating Degree Days): Σ max(0, base − Tmean)   default base 18 °C
 * - CDD (Cooling Degree Days): Σ max(0, Tmean − base)   default base 18 °C
 *
 * Returns the cumulative series (running sum over days) and the season total.
 */

export interface TransformResult {
  cumulative: SeriesPoint[]; // running total per day
  total: number; // season sum
  unit: string;
  label: string;
}

interface TransformDef {
  defaultBase: number;
  label: string;
  /** Per-day contribution given the day's mean temperature and base. */
  dayValue: (tmean: number, base: number) => number;
}

const REGISTRY: Record<TransformName, TransformDef> = {
  gdd: {
    defaultBase: 10,
    label: "Wachstumsgradtage (GDD)",
    dayValue: (t, base) => Math.max(0, t - base),
  },
  hdd: {
    defaultBase: 18,
    label: "Heizgradtage (HDD)",
    dayValue: (t, base) => Math.max(0, base - t),
  },
  cdd: {
    defaultBase: 18,
    label: "Kühlgradtage (CDD)",
    dayValue: (t, base) => Math.max(0, t - base),
  },
};

export function isTransform(name: string): name is TransformName {
  return name === "gdd" || name === "hdd" || name === "cdd";
}

/** The default base temperature for a transform (when the spec omits `base`). */
export function defaultBase(name: TransformName): number {
  return REGISTRY[name].defaultBase;
}

/**
 * Apply a degree-day transform to a series of daily-mean temperature points.
 * `dailyMeans` must already be aggregated to one mean value per day.
 */
export function applyTransform(
  name: TransformName,
  dailyMeans: SeriesPoint[],
  base?: number,
): TransformResult {
  const def = REGISTRY[name];
  const b = base ?? def.defaultBase;

  let running = 0;
  const cumulative: SeriesPoint[] = dailyMeans.map((p) => {
    running += def.dayValue(p.v, b);
    return { t: p.t, v: Math.round(running * 10) / 10 };
  });

  return {
    cumulative,
    total: Math.round(running * 10) / 10,
    unit: "°C·d",
    label: `${def.label}, Basis ${b} °C`,
  };
}
