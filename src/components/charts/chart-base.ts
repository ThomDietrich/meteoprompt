import type { TooltipComponentFormatterCallbackParams } from "echarts";

import { WAPPEN_PALETTE } from "@/lib/colors";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * Shared helpers for the chart renderers (spec-04). Resolves a per-series colour
 * (the persisted `color`, or a stable palette fallback by index) so every chart
 * type styles series consistently from the Wappen palette.
 */

/** The colour for series `i`: its persisted colour, else a palette fallback. */
export function seriesColor(series: ResolvedSeries[], i: number): string {
  return series[i]?.color ?? WAPPEN_PALETTE[i % WAPPEN_PALETTE.length];
}

/**
 * German-localized number: decimal comma and a proper typographic minus sign
 * (−, U+2212, not the hyphen-minus -). Used in markPoint labels and tooltips so
 * values read e.g. "−17,6".
 */
export function deNum(n: number, decimals = 1): string {
  return n
    .toLocaleString("de-DE", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    .replace("-", "−");
}

/**
 * German date+time for a tooltip header (spec-09 B): "DD.MM.YYYY, HH:MM". Accepts
 * an epoch-ms number or a date string; falls back to the raw String(v) on NaN.
 */
export function deDateTime(v: number | string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Period-bucket labelling (spec-13) ───────────────────────────────────────
// Perioden-Aggregate (Tages-/Wochen-/Monatssummen) sind INTERVALLE, keine
// Zeitpunkte. Diese Helfer benennen die Periode eindeutig (ohne „00:00") und
// werden vom Balken-Renderer + candlestick/barRange geteilt.

export type Grain = "hour" | "day" | "week" | "month" | "year";

const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MON_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const MON_FULL = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Grain → the fallback bucket width (ms) when a series has a single point. */
export const GRAIN_MS: Record<Grain, number> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000,
  year: 31_536_000_000,
};

/** German date WITHOUT time: "DD.MM.YYYY" (local). For period tooltips. */
export function deDate(v: number | string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** ISO-8601 week number (1–53) of a date, in local time. */
export function isoWeek(d: Date): number {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (t.getDay() + 6) % 7; // Mon=0..Sun=6
  t.setDate(t.getDate() - day + 3); // Thursday of this ISO week
  const firstThu = new Date(t.getFullYear(), 0, 4); // Jan 4 is always in week 1
  const fday = (firstThu.getDay() + 6) % 7;
  firstThu.setDate(firstThu.getDate() - fday + 3);
  return 1 + Math.round((t.getTime() - firstThu.getTime()) / (7 * 86_400_000));
}

/**
 * Infer the bucket grain from the MEDIAN gap between consecutive timestamps —
 * robust to occasional missing buckets and DST/variable-length months. Empty or
 * single-point series default to daily.
 */
export function inferGrain(points: { t: string }[]): Grain {
  const ts = points
    .map((p) => new Date(p.t).getTime())
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  // Skip zero gaps so DUPLICATE timestamps (e.g. a multi-series bars chart whose
  // series share the same bucket grid, flattened into one list) don't collapse
  // the median to 0 and misclassify a daily/weekly sum as hourly.
  const deltas: number[] = [];
  for (let i = 1; i < ts.length; i++) {
    const d = ts[i] - ts[i - 1];
    if (d > 0) deltas.push(d);
  }
  if (deltas.length === 0) return "day";
  deltas.sort((a, b) => a - b);
  const med = deltas[Math.floor(deltas.length / 2)];
  const H = 3_600_000, D = 86_400_000;
  if (med < 20 * H) return "hour";
  if (med < 4 * D) return "day";
  if (med < 20 * D) return "week";
  if (med < 250 * D) return "month";
  return "year";
}

/** Neutral period qualifier for a tooltip value row (agnostic of sum vs mean). */
export function periodQualifier(grain: Grain): string {
  return { hour: "Stundenwert", day: "Tageswert", week: "Wochenwert", month: "Monatswert", year: "Jahreswert" }[grain];
}

/**
 * Bold-ready tooltip header naming the period a bucket `[startMs, endMs)` covers.
 * Day/hour are calendar-aligned (1d/1h buckets) → clean single labels. Coarser
 * grains fall back to an inclusive date RANGE (always correct regardless of window
 * alignment — 7d/30d buckets are epoch-anchored, not calendar weeks/months) and
 * only upgrade to "KW N"/"Juli 2026"/"2026" when the bucket IS a genuine
 * Monday-week / 1st-of-month / Jan-1 calendar period.
 */
export function periodTooltipHead(grain: Grain, startMs: number, endMs: number): string {
  const s = new Date(startMs);
  const wd = WD[s.getDay()];
  if (grain === "hour") {
    const h = s.getHours();
    return `${wd}, ${pad(s.getDate())}.${pad(s.getMonth() + 1)}.${s.getFullYear()}, ${pad(h)}–${pad((h + 1) % 24)} Uhr`;
  }
  if (grain === "day") {
    return `${wd}, ${pad(s.getDate())}.${pad(s.getMonth() + 1)}.${s.getFullYear()}`;
  }
  const lastDay = new Date(endMs - 86_400_000); // last day the bucket covers (end exclusive)
  const spanD = (endMs - startMs) / 86_400_000;
  if (grain === "week" && s.getDay() === 1 && spanD > 6.5 && spanD < 7.5) {
    return `KW ${isoWeek(s)} · ${pad(s.getDate())}.${pad(s.getMonth() + 1)}.–${pad(lastDay.getDate())}.${pad(lastDay.getMonth() + 1)}.${lastDay.getFullYear()}`;
  }
  if (grain === "month" && s.getDate() === 1 && spanD > 27 && spanD < 32) {
    // Starts on the 1st and spans ~a month → a calendar month. (Don't also require
    // endMs to land on the 1st: the LAST bar's end is a synthesized fallback
    // (~30d), so July-1 + 30d = July-31 would otherwise lose its "Juli 2026" head.)
    return `${MON_FULL[s.getMonth()]} ${s.getFullYear()}`;
  }
  if (grain === "year" && s.getMonth() === 0 && s.getDate() === 1) {
    return `${s.getFullYear()}`;
  }
  return `${deDate(s.getTime())} – ${deDate(lastDay.getTime())}`;
}

/** Compact axis tick for a bucket starting at `ms`, by grain (used by category axes). */
export function periodAxisLabel(grain: Grain, ms: number): string {
  const d = new Date(ms);
  if (grain === "hour") return `${pad(d.getHours())}:00`;
  if (grain === "day") return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  if (grain === "week") return d.getDay() === 1 ? `KW ${isoWeek(d)}` : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  if (grain === "month")
    return d.getDate() === 1 ? `${MON_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  return `${d.getFullYear()}`;
}

/** One row in a tooltip-axis formatter's params array (the bits we read). */
type AxisTooltipParam = {
  axisValue?: number | string;
  seriesName?: string;
  marker?: string;
  // Either a bare number, or a [time, value] tuple (line/bars on a time axis).
  value?: number | (number | string)[];
  data?: number | (number | string)[];
};

/**
 * A time-series tooltip (spec-09 B): triggers on the axis, headed by the BOLD DE
 * date+time of the hovered point, then one `{marker} {seriesName}: {value} {unit}`
 * row per series. Used by the time-axis charts (line, bars, range-band,
 * candlestick); supersedes any prior valueFormatter-only tooltip on those.
 */
export function timeAxisTooltip(unit: string) {
  return {
    trigger: "axis" as const,
    axisPointer: { type: "line" as const },
    formatter: (params: TooltipComponentFormatterCallbackParams) => {
      const list = (Array.isArray(params) ? params : [params]) as AxisTooltipParam[];
      if (list.length === 0) return "";
      const head = list[0];
      // Prefer the axis value; fall back to the first data tuple's time slot.
      const headTime =
        head.axisValue ??
        (Array.isArray(head.data) ? head.data[0] : undefined) ??
        (Array.isArray(head.value) ? head.value[0] : undefined);
      const header =
        headTime != null
          ? `<strong>${deDateTime(headTime as number | string)}</strong>`
          : "";
      const rows = list.map((p) => {
        // value/data may be a bare number or a [time, value] tuple → take value.
        const raw = p.value ?? p.data;
        const n = Array.isArray(raw) ? raw[raw.length - 1] : raw;
        const valueText = typeof n === "number" ? `${deNum(n)} ${unit}` : String(n ?? "");
        return `${p.marker ?? ""} ${p.seriesName ?? ""}: ${valueText}`;
      });
      return [header, ...rows].filter(Boolean).join("<br/>");
    },
  };
}

/** Default ECharts wrapper props shared by every renderer. */
export const ECHARTS_STYLE = { height: "100%", width: "100%" } as const;
export const ECHARTS_OPTS = { renderer: "canvas" as const };
