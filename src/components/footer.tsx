import Image from "next/image";
import { Sun } from "lucide-react";

/**
 * Site footer — a calm, balanced counterpart to the masthead (spec-03 §3).
 * Two zones: LEFT a small Wappen + "Wetterchatty" wordmark + tagline; RIGHT the
 * data-source/Impressum links + copyright. Two restrained on-brand decorations:
 * a soft GREEN HILL silhouette along the top edge (echoing the green hill of the
 * Nurzen coat of arms) and a faint GOLD sun glyph. Server component.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-10 shrink-0 overflow-hidden border-t border-brand-green/15 bg-brand-green/[0.06] dark:bg-brand-green/15">
      {/* Decoration 1 — soft green hill silhouette rising into the page along the
          top edge (echoes the rounded green hill of the Nurzen Wappen). The curve
          crests upward; the green tint fills below it down into the footer. */}
      <svg
        aria-hidden
        viewBox="0 0 1440 56"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 top-0 h-7 w-full text-brand-green/15 dark:text-brand-green/25"
      >
        <path
          fill="currentColor"
          d="M0,28 C320,4 560,4 720,18 C900,34 1140,40 1440,16 L1440,56 L0,56 Z"
        />
      </svg>

      {/* Decoration 2 — faint gold sun glyph, low-key second accent. */}
      <Sun
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 text-brand-gold/10 dark:text-brand-gold/15"
        strokeWidth={1}
      />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 pb-6 pt-9 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        {/* LEFT zone — identity. */}
        <div className="flex items-center gap-3">
          <span className="inline-flex shrink-0 items-center justify-center rounded-lg bg-white p-1 ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10">
            <Image
              src="/wappen.png"
              alt="Gemeindewappen"
              width={32}
              height={32}
              className="h-7 w-auto"
            />
          </span>
          <div className="leading-tight">
            <p className="font-display text-base font-semibold tracking-tight text-brand-blue dark:text-sky-300">
              Wetterchatty
            </p>
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              Das interaktive Wetterportal für Nurzen
            </p>
          </div>
        </div>

        {/* RIGHT zone — links + copyright. */}
        <div className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 sm:text-right">
          <p>
            Datenquelle:{" "}
            <a
              href="https://wetter.nurzen.de/neowx/"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand-blue underline-offset-2 hover:underline dark:text-sky-300"
            >
              wetter.nurzen.de/neowx
            </a>
            <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
            <a
              href="#"
              className="font-medium text-brand-blue underline-offset-2 hover:underline dark:text-sky-300"
            >
              Impressum
            </a>
          </p>
          <p className="mt-1 text-slate-400 dark:text-slate-500">
            © {year} Wetterchatty
          </p>
        </div>
      </div>
    </footer>
  );
}
