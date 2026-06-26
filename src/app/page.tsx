"use client";

import dynamic from "next/dynamic";

// react-grid-layout + ECharts need the DOM — load the grid client-only to
// avoid hydration mismatches (SPEC §4 / §10).
const DashboardGrid = dynamic(
  () => import("@/components/dashboard-grid"),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full animate-pulse rounded-xl bg-slate-200/60 dark:bg-slate-800/40" />
    ),
  },
);

export default function Home() {
  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">wetter-chat</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Wetter-Dashboard · Freitext-Abfrage
        </p>
      </header>
      <DashboardGrid />
    </main>
  );
}
