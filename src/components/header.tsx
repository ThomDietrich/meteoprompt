import Image from "next/image";

/**
 * Site masthead — a bold "Wappen-Farbband": a blue→green gradient band (Wappen
 * blue #1F5BA8 → green #2E9D46) capped by a thin gold accent line. The
 * "Wetterchatty" wordmark sits in Archivo Black (.font-wordmark), white, over
 * the blue end of the band; the tagline in white. The Gemeinde-Wappen
 * rides on a white chip so it reads on the colour. Markant + farbig, aber wertig.
 * Wordmark + tagline are white over the blue-dominant left side → WCAG ≥4.5:1.
 * Server component. Wappen at public/wappen.png. See docs/iterations spec-03 §3.
 */
export function Header() {
  return (
    <header className="relative border-b-2 border-brand-gold bg-gradient-to-r from-brand-blue via-brand-blue to-brand-green shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        {/* Wappen on a white chip so it reads on the colour band. */}
        <span className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/10">
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
          <h1 className="font-wordmark text-xl uppercase tracking-tight text-white drop-shadow-sm sm:text-2xl">
            Wetterchatty
          </h1>
          <p className="mt-0.5 text-[13px] font-medium text-white">
            Das interaktive Wetterportal für Nurzen
          </p>
        </div>
      </div>
    </header>
  );
}
