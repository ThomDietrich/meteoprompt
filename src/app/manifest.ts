import type { MetadataRoute } from "next";

import { appName } from "@/lib/site";

/**
 * PWA web app manifest (spec-14) — served by Next at `/manifest.webmanifest`.
 * The app NAME is env-driven (APP_NAME, falling back to SITE_NAME) so the installed
 * app can be listed under its own word (e.g. "Wetter …" to sort under W); the
 * route is dynamic to resolve it at request time (matches the force-dynamic
 * layout). Icons/colours are deployment-independent. Colours mirror the brand:
 * theme = Wappen blue, background = the off-white field colour of the page bg.
 */
export const dynamic = "force-dynamic";

export default function manifest(): MetadataRoute.Manifest {
  const name = appName();
  return {
    id: "/",
    name,
    short_name: name,
    description: "Die Zeitreihen der eigenen Wetterstation per Prompt erkunden.",
    lang: "de",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f9fc",
    theme_color: "#1f5ba8",
    categories: ["weather"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
