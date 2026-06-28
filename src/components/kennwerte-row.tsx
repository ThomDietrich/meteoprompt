"use client";

import { useEffect, useState } from "react";
import {
  Thermometer,
  ThermometerSun,
  Droplets,
  Droplet,
  Wind,
  Gauge,
  Compass,
  CloudRain,
  CloudDrizzle,
  Sun,
  SunMedium,
  type LucideIcon,
} from "lucide-react";

import {
  KENNWERTE,
  type KennwertValue,
  type NowResponse,
  type OverviewResponse,
} from "@/lib/kennwerte";

/**
 * Header Kennwert-Zeile: 12 live-value pills (icon + label + value/unit),
 * fetched from /api/now after mount, plus a data-grounded Wetterlage-Überblick
 * below them (fetched separately from /api/overview so the values appear
 * instantly while the text loads). Wraps responsively. See spec-03 §4, spec-06 E.
 */

const ICONS: Record<string, LucideIcon> = {
  Thermometer,
  ThermometerSun,
  Droplets,
  Droplet,
  Wind,
  Gauge,
  Compass,
  CloudRain,
  CloudDrizzle,
  Sun,
  SunMedium,
};

/** Format a numeric value with a German decimal comma and unit-aware precision. */
function formatValue(v: number | null, unit: string): string {
  if (v == null || Number.isNaN(v)) return "–";
  // Degrees and W/m² and UV read better as integers; everything else 1 decimal.
  const decimals = unit === "°" || unit === "W/m²" || unit === "–" ? 0 : 1;
  return v.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * One borderless cell in the instrument panel: a muted brand icon, an uppercase
 * label, and the tabular-nums value. Separated from neighbours by the panel's
 * hairline dividers (no per-cell border/box) — calm, not 12 loud cards.
 */
function Cell({ kv }: { kv: KennwertValue }) {
  const def = KENNWERTE.find((k) => k.key === kv.key);
  const Icon = def ? (ICONS[def.icon] ?? Thermometer) : Thermometer;
  const valueText = formatValue(kv.value, kv.unit);
  // Show the unit only when there is a value and the unit is meaningful ("–" = none).
  const unitText = kv.value == null || kv.unit === "–" ? "" : ` ${kv.unit}`;
  const compassText = kv.compass ? ` ${kv.compass}` : "";

  return (
    <div className="flex items-center gap-2.5 px-3.5 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <Icon
        className="h-4 w-4 shrink-0 text-brand-blue opacity-70 dark:text-sky-400"
        aria-hidden
      />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {kv.label}
        </div>
        <div className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
          {valueText}
          {unitText}
          {compassText}
        </div>
      </div>
    </div>
  );
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; values: KennwertValue[] };

/**
 * The Wetterlage-Überblick state (spec-06 E). Independent of the values fetch so
 * the values render immediately. "loading" shows a shimmer; "ready" without text
 * (missing key / data / error) renders nothing — the overview is best-effort.
 */
type OverviewState =
  | { status: "loading" }
  | { status: "ready"; text: string | null };

/** A one-line shimmer placeholder shown beneath the cells while the text loads. */
function OverviewShimmer() {
  return (
    <div className="space-y-1.5" aria-hidden>
      <div className="h-3 w-[92%] animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/40" />
      <div className="h-3 w-[64%] animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/40" />
    </div>
  );
}

export function KennwerteRow() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [overview, setOverview] = useState<OverviewState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/now");
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try {
            const body = (await res.json()) as { detail?: string };
            if (body?.detail) detail = body.detail;
          } catch {
            // keep status message
          }
          throw new Error(detail);
        }
        const data = (await res.json()) as NowResponse;
        if (!cancelled) setState({ status: "ready", values: data.values });
      } catch (e) {
        if (!cancelled) {
          setState({
            status: "error",
            message: e instanceof Error ? e.message : "Unbekannter Fehler",
          });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Overview: fetched separately so it never delays the values. Any failure
  // (missing key, error, empty) just yields no text — the panel still shows
  // the 12 values. Regenerated on every load (consistent with spec-06 A).
  useEffect(() => {
    let cancelled = false;
    async function loadOverview() {
      try {
        const res = await fetch("/api/overview");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as OverviewResponse;
        if (!cancelled) {
          setOverview({ status: "ready", text: data.overview ?? null });
        }
      } catch {
        if (!cancelled) setOverview({ status: "ready", text: null });
      }
    }
    loadOverview();
    return () => {
      cancelled = true;
    };
  }, []);

  // One calm "instrument panel": a single rounded container holding the cells,
  // separated by hairline dividers (not 12 loud boxes).
  const panelClass =
    "overflow-hidden rounded-2xl border border-black/5 bg-white/70 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/60";
  const gridClass =
    "grid grid-cols-2 divide-x divide-y divide-black/5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 dark:divide-white/5";

  if (state.status === "loading") {
    return (
      <div className={panelClass}>
        <div className={gridClass}>
          {KENNWERTE.map((k) => (
            <div key={k.key} className="px-3.5 py-3">
              <div className="h-[34px] animate-pulse rounded bg-slate-200/60 dark:bg-slate-700/40" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-2xl border border-amber-300/50 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300">
        Aktuelle Werte konnten nicht geladen werden: {state.message}
      </div>
    );
  }

  // Wetterlage-Überblick: a "nachgelagertes Element" inside the SAME rounded
  // panel, below the 12 cells (spec-06 E). Shimmer while loading; nothing if the
  // overview is unavailable — the values above always stand on their own.
  const showOverview =
    overview.status === "loading" ||
    (overview.status === "ready" && overview.text != null);

  return (
    <div className={panelClass}>
      <div className={gridClass}>
        {state.values.map((kv) => (
          <Cell key={kv.key} kv={kv} />
        ))}
      </div>
      {showOverview && (
        <div className="border-t border-black/5 px-3.5 py-3 dark:border-white/5">
          {overview.status === "loading" ? (
            <OverviewShimmer />
          ) : (
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {overview.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
