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

/**
 * Site/app NAME — the wordmark (header + footer), the browser/window title, and
 * the PWA app name (manifest + Apple). Configurable per deployment via SITE_NAME
 * so the public repo stays general (no location baked in); the live instance sets
 * it in .env (e.g. "Nurzen MeteoPrompt"). Read at runtime — the layout is
 * `force-dynamic` and the manifest route is dynamic, so it resolves from the
 * container's environment, not at build time.
 */
export function siteName(): string {
  return process.env.SITE_NAME?.trim() || "MeteoPrompt";
}

/**
 * PWA APP name — the INSTALLED-app / home-screen title (manifest name/short_name,
 * Apple web-app title, application-name, install button). Deliberately separate
 * from siteName() so the app can be LISTED under a different word than the
 * on-page wordmark — e.g. APP_NAME="Wetter Nurzen – Meteoprompt" so it sorts under
 * "W" (Wetter) in the phone's app list, where users look for a weather app.
 * Falls back to siteName() (then SITE_NAME, then "MeteoPrompt") when unset.
 */
export function appName(): string {
  return process.env.APP_NAME?.trim() || siteName();
}
