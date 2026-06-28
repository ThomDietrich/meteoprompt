"use client";

import { deNum } from "@/components/charts/chart-base";
import type { ResolvedAnswer } from "@/lib/query-spec";

/**
 * Prominent KPI banner for a computed answer (spec-05 §4) — shown above the
 * context chart. A big number/value + unit, a label, and (for an extreme) the
 * exact date. Body sans (not the display font), German-formatted, tabular-nums.
 */

/** German number with a decimal comma + proper minus sign. */
const fmt = deNum;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AnswerBanner({ answer }: { answer: ResolvedAnswer }) {
  let big: string;
  let sub: string | null = null;

  if (answer.kind === "count") {
    big = `${answer.count ?? answer.value ?? 0} ${answer.unit}`;
  } else if (answer.value == null) {
    big = "–";
  } else if (answer.kind === "extreme") {
    big = `${fmt(answer.value)} ${answer.unit}`.trim();
    sub = answer.t ? `am ${fmtDate(answer.t)}` : null;
  } else {
    // scalar
    big = `${fmt(answer.value)} ${answer.unit}`.trim();
  }

  return (
    <div className="mb-2 flex w-full items-center justify-between gap-4 rounded-xl border border-brand-blue/15 bg-brand-blue/5 px-3 py-2 dark:border-white/10 dark:bg-brand-blue/15">
      <div className="min-w-0">
        <div className="truncate text-[11px] font-medium uppercase tracking-wide text-brand-blue/70 dark:text-sky-300/80">
          {answer.label}
        </div>
        {sub && (
          <div className="truncate text-xs text-brand-ink/60 dark:text-slate-400">
            {sub}
          </div>
        )}
      </div>
      {/* Big value pushed to the RIGHT edge. Body sans (not display) + bold +
          tabular-nums — German-formatted value. */}
      <div className="shrink-0 text-2xl font-bold tabular-nums text-brand-blue dark:text-sky-300">
        {big}
      </div>
    </div>
  );
}
