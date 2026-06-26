"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

/**
 * Free-text search box. Two visual modes:
 * - `variant="hero"` — large, centered (empty state, Google-style).
 * - `variant="bar"`  — docked at the top (≥1 card).
 *
 * The input is an auto-growing <textarea>: its height tracks scrollHeight up to a
 * max, then scrolls — long queries no longer truncate. Enter submits;
 * Shift+Enter inserts a newline. Submitting calls onSubmit(query) → POST /api/ask.
 */

function useAutoGrow(value: string, maxPx: number) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, maxPx);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxPx ? "auto" : "hidden";
  }, [value, maxPx]);
  return ref;
}

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
  const isHero = variant === "hero";
  const textareaRef = useAutoGrow(value, isHero ? 200 : 140);

  function submit() {
    const q = value.trim();
    if (!q || pending) return;
    onSubmit(q);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  // Enter submits; Shift+Enter inserts a newline.
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const sharedTextareaClasses =
    "flex-1 resize-none rounded-3xl border border-brand-blue/15 bg-white shadow-sm outline-none transition-all placeholder:text-brand-ink/40 focus:border-brand-blue/40 focus:ring-4 focus:ring-brand-blue/15 disabled:opacity-60 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-900/40";

  const sharedButtonClasses =
    "shrink-0 self-stretch rounded-3xl bg-brand-blue font-medium text-white shadow-sm transition-colors hover:bg-brand-blue/90 disabled:cursor-not-allowed disabled:opacity-50";

  if (isHero) {
    return (
      <div className="flex min-h-[58vh] flex-col items-center justify-center px-4">
        <h2 className="mb-2 text-center font-display text-2xl font-semibold tracking-tight text-brand-ink dark:text-slate-100 sm:text-3xl">
          Was möchtest du über das Wetter wissen?
        </h2>
        <p className="mb-7 text-center text-sm text-brand-ink/55 dark:text-slate-400">
          z. B. „Außentemperatur der letzten 4 Wochen“ oder „Wie viel hat es diese Woche geregnet?“
        </p>
        <form onSubmit={handleSubmit} className="w-full max-w-2xl">
          <div className="flex items-end gap-2.5">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Frage eingeben …"
              disabled={pending}
              autoFocus
              rows={1}
              className={`${sharedTextareaClasses} px-6 py-4 text-lg leading-relaxed`}
            />
            <button
              type="submit"
              disabled={pending || value.trim().length === 0}
              className={`${sharedButtonClasses} px-7 py-4 text-base`}
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

  // Docked bar.
  return (
    <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-brand-blue/10 bg-white/85 px-4 py-3.5 backdrop-blur dark:border-white/10 dark:bg-slate-950/70 sm:-mx-6 sm:px-6">
      <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2.5">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Weitere Frage … (z. B. „Windrichtung gestern“)"
            disabled={pending}
            rows={1}
            className={`${sharedTextareaClasses} px-5 py-3 text-base leading-relaxed`}
          />
          <button
            type="submit"
            disabled={pending || value.trim().length === 0}
            className={`${sharedButtonClasses} px-6 py-3 text-sm`}
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
