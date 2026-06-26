import Image from "next/image";

/**
 * Site header — Gemeinde-Wappen + title, in the brand-blue theme.
 * Server component (no interactivity). Wappen lives at public/wappen.png.
 * See docs/iterations spec-03 §3.
 */
export function Header() {
  return (
    <header className="border-b border-brand-blue/15 bg-gradient-to-r from-brand-blue/10 via-white to-white dark:from-brand-blue/25 dark:via-slate-900 dark:to-slate-900">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        <Image
          src="/wappen.png"
          alt="Gemeindewappen"
          width={48}
          height={48}
          priority
          className="h-10 w-auto sm:h-12"
        />
        <div className="leading-tight">
          <p className="text-lg font-bold tracking-tight text-brand-blue dark:text-sky-300 sm:text-xl">
            wetter.nurzen.de
          </p>
          <p className="text-sm font-medium text-brand-ink/70 dark:text-slate-300">
            Dein Wetter-Chat
          </p>
        </div>
      </div>
    </header>
  );
}
