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

import { KENNWERTE, type KennwertValue, type NowResponse } from "@/lib/kennwerte";

/**
 * Header Kennwert-Zeile: 12 live-value pills (icon + label + value/unit),
 * fetched from /api/now after mount. Wraps responsively. See spec-03 §4.
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

function Pill({ kv }: { kv: KennwertValue }) {
  const def = KENNWERTE.find((k) => k.key === kv.key);
  const Icon = def ? (ICONS[def.icon] ?? Thermometer) : Thermometer;
  const valueText = formatValue(kv.value, kv.unit);
  // Show the unit only when there is a value and the unit is meaningful ("–" = none).
  const unitText =
    kv.value == null || kv.unit === "–" ? "" : ` ${kv.unit}`;
  const compassText = kv.compass ? ` ${kv.compass}` : "";

  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-brand-blue/10 bg-white/80 px-3 py-2.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue/20 hover:shadow-md dark:border-white/10 dark:bg-slate-900/70">
      <span className="inline-flex shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 p-1.5 dark:bg-brand-blue/25">
        <Icon className="h-4 w-4 text-brand-blue dark:text-sky-400" aria-hidden />
      </span>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[11px] text-brand-ink/60 dark:text-slate-400">
          {kv.label}
        </div>
        <div className="text-sm font-semibold tabular-nums text-brand-ink dark:text-slate-100">
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

export function KennwerteRow() {
  const [state, setState] = useState<State>({ status: "loading" });

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

  if (state.status === "loading") {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {KENNWERTE.map((k) => (
          <div
            key={k.key}
            className="h-[52px] animate-pulse rounded-lg bg-slate-200/60 dark:bg-slate-700/40"
          />
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300">
        Aktuelle Werte konnten nicht geladen werden: {state.message}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {state.values.map((kv) => (
        <Pill key={kv.key} kv={kv} />
      ))}
    </div>
  );
}
