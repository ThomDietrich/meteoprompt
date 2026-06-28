/**
 * Site tagline — the subtitle under the wordmark (header + footer) and the page
 * title suffix. Configurable per deployment via the SITE_TAGLINE env var so the
 * public repo stays general; the live instance sets it in .env (e.g. the
 * Nurzen value). Read at runtime — the app renders dynamically (app/layout.tsx
 * sets `force-dynamic`).
 */
export function siteTagline(): string {
  return process.env.SITE_TAGLINE?.trim() || "Wetterdaten per Prompt erkunden";
}
