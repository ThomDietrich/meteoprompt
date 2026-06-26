/**
 * Site footer — green-tinted (Wappen green), data-source line + year.
 * Server component. See docs/iterations spec-03 §3.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-10 border-t border-brand-green/20 bg-brand-green/10 dark:bg-brand-green/15">
      <div className="mx-auto max-w-7xl px-4 py-5 text-sm text-brand-ink/70 dark:text-slate-300 sm:px-6">
        <p>
          Daten: eigene Wetterstation · Inspiriert von{" "}
          <a
            href="https://wetter.nurzen.de/neowx/"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand-blue underline-offset-2 hover:underline dark:text-sky-300"
          >
            wetter.nurzen.de/neowx
          </a>
        </p>
        <p className="mt-1 text-xs text-brand-ink/50 dark:text-slate-400">
          © {year} · Impressum (Platzhalter)
        </p>
      </div>
    </footer>
  );
}
