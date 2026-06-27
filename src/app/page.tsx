"use client";

import dynamic from "next/dynamic";

import { KennwerteRow } from "@/components/kennwerte-row";
import { SectionDivider } from "@/components/section-divider";

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

      {/*
        Sections 2–4 (spec-05 §7): search + private cards, a divider, then the
        global pinned cards — all owned by DashboardGrid so pinning can move a
        card private→global atomically.
      */}
      <section className="mt-6">
        <DashboardGrid />
      </section>

      {/* Trennlinie zum fixen Bereich (5). */}
      <SectionDivider label="Stations-Dashboard" />

      {/* Permanentes Dashboard: feste Charts (6). */}
      <PermanentDashboard />
    </main>
  );
}
