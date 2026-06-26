"use client";

import { useState, type FormEvent } from "react";

/**
 * Free-text search box. Two visual modes:
 * - `variant="hero"` — large, centered (empty state, Google-style).
 * - `variant="bar"`  — slim, docked at the top (≥1 card).
 *
 * Submitting calls onSubmit(query); the parent runs POST /api/ask.
 */

export function SearchBox({
  variant,
  onSubmit,
  pending,
  error,
}: {
  variant: "hero" | "bar";
  onSubmit: (query: string) => void;
  pending: boolean;
  error?: string | null;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q || pending) return;
    onSubmit(q);
  }

  if (variant === "hero") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
        <h2 className="mb-2 text-center text-2xl font-semibold tracking-tight text-slate-800 dark:text-slate-100">
          Was möchtest du über das Wetter wissen?
        </h2>
        <p className="mb-6 text-center text-sm text-slate-500 dark:text-slate-400">
          z. B. „Außentemperatur der letzten 4 Wochen“ oder „Wie viel hat es diese Woche geregnet?“
        </p>
        <form onSubmit={handleSubmit} className="w-full max-w-xl">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Frage eingeben …"
              disabled={pending}
              autoFocus
              className="flex-1 rounded-full border border-black/10 bg-white px-5 py-3 text-base shadow-sm outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-200 disabled:opacity-60 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-900"
            />
            <button
              type="submit"
              disabled={pending || value.trim().length === 0}
              className="rounded-full bg-sky-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "…" : "Anzeigen"}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-center text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </form>
      </div>
    );
  }

  // Slim docked bar.
  return (
    <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-black/5 bg-white/80 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-slate-950/70 sm:-mx-6 sm:px-6">
      <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Weitere Frage … (z. B. „Windrichtung gestern“)"
            disabled={pending}
            className="flex-1 rounded-full border border-black/10 bg-white px-4 py-2 text-sm shadow-sm outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-200 disabled:opacity-60 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-900"
          />
          <button
            type="submit"
            disabled={pending || value.trim().length === 0}
            className="rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "…" : "Anzeigen"}
          </button>
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </form>
    </div>
  );
}
