import Image from "next/image";

/**
 * Site masthead — a calm, restrained "paper" header. The Gemeinde-Wappen is the
 * sole colour anchor; the "Wetterchatty" wordmark sits in the Fraunces display
 * serif (font-display) at a balanced size, underlined by a short, thin gold
 * accent (no loud tricolor stripe). Near-white background, a single hairline
 * bottom border, and a gentle shadow keep the chrome quiet. Server component.
 * Wappen at public/wappen.png. See docs/iterations spec-03 §3.
 */
export function Header() {
  return (
    <header className="border-b border-black/5 bg-brand-field/70 shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur dark:border-white/10 dark:bg-slate-950/70">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3.5 sm:px-6">
        <span className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white p-1 ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10">
          <Image
            src="/wappen.png"
            alt="Gemeindewappen"
            width={56}
            height={56}
            priority
            className="h-10 w-auto sm:h-11"
          />
        </span>
        <div className="leading-tight">
          <h1 className="inline-flex flex-col">
            <span className="font-display text-xl font-semibold tracking-tight text-brand-blue dark:text-sky-300 sm:text-2xl">
              Wetterchatty
            </span>
            {/* Short, thin gold underline — the only accent. */}
            <span
              aria-hidden
              className="mt-1 h-px w-10 rounded-full bg-brand-gold/80"
            />
          </h1>
          <p className="mt-1.5 text-[13px] font-medium text-slate-500 dark:text-slate-400">
            Das interaktive Wetterportal für Nurzen
          </p>
        </div>
      </div>
    </header>
  );
}
