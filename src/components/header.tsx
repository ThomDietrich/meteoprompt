import Image from "next/image";

/**
 * Site masthead — Gemeinde-Wappen + title in the Wappen theme. A thin tricolor
 * (blue/gold/green) accent line caps the top edge; the title uses the Fraunces
 * display serif (font-display). Server component. Wappen at public/wappen.png.
 * See docs/iterations spec-03 §3.
 */
export function Header() {
  return (
    <header className="relative border-b border-brand-blue/15 bg-gradient-to-b from-brand-blue/10 via-white to-white shadow-sm dark:from-brand-blue/25 dark:via-slate-900 dark:to-slate-900">
      {/* Thin Wappen tricolor accent line along the top edge. */}
      <div
        aria-hidden
        className="h-[3px] w-full bg-gradient-to-r from-brand-blue via-brand-gold to-brand-green"
      />
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6">
        <span className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-white/70 p-1.5 shadow-sm ring-1 ring-brand-blue/15 dark:bg-slate-800/60 dark:ring-white/10">
          <Image
            src="/wappen.png"
            alt="Gemeindewappen"
            width={64}
            height={64}
            priority
            className="h-12 w-auto sm:h-14"
          />
        </span>
        <div className="leading-tight">
          <h1 className="font-display text-2xl font-bold tracking-tight text-brand-blue dark:text-sky-300 sm:text-3xl">
            wetter.nurzen.de
          </h1>
          <p className="mt-0.5 flex items-center gap-2 text-sm font-medium text-brand-ink/70 dark:text-slate-300">
            <span className="inline-block h-3 w-0.5 rounded-full bg-brand-gold" aria-hidden />
            Dein Wetter-Chat
          </p>
        </div>
      </div>
    </header>
  );
}
