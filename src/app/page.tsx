"use client";

import dynamic from "next/dynamic";

import { KennwerteRow } from "@/components/kennwerte-row";

// react-grid-layout + ECharts need the DOM — load grids client-only to avoid
// hydration mismatches (spec §10).
const DashboardGrid = dynamic(() => import("@/components/dashboard-grid"), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full animate-pulse rounded-xl bg-slate-200/60 dark:bg-slate-800/40" />
  ),
});

const PermanentDashboard = dynamic(
  () => import("@/components/permanent-dashboard"),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 w-full animate-pulse rounded-xl bg-slate-200/60 dark:bg-slate-800/40" />
    ),
  },
);

export default function Home() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
      {/* Kennwert-Zeile: 12 aktuelle Werte (spec §4). */}
      <KennwerteRow />

      {/* Dynamischer Freitext-Bereich aus Iteration 2 (spec §1). */}
      <section className="mt-6">
        <DashboardGrid />
      </section>

      {/* Trennlinie: dynamischer Bereich ↑ / fixer Bereich ↓ (spec §5). */}
      <div className="my-8 flex items-center gap-3" role="separator">
        <span className="h-px flex-1 bg-brand-blue/20" />
        <span className="rounded-full bg-brand-blue/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-blue dark:text-sky-300">
          Stations-Dashboard
        </span>
        <span className="h-px flex-1 bg-brand-blue/20" />
      </div>

      {/* Permanentes Dashboard: 10 feste Charts (spec §5). */}
      <PermanentDashboard />
    </main>
  );
}
