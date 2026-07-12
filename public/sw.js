/*
 * MeteoPrompt service worker (spec-14) — "app-shell + live data".
 *
 * Precache the app shell so the installed app starts instantly, but NEVER cache
 * weather data: a live dashboard must not show stale values.
 *   - /api/*  and non-GET       → not intercepted (always straight to network)
 *   - navigations (HTML)        → network-first, offline fallback = cached "/"
 *   - hashed static assets      → stale-while-revalidate
 * Bump CACHE_VERSION to invalidate all caches on the next activate.
 *
 * Registered ONLY in production (see components/pwa-register.tsx); in dev it is
 * actively unregistered so it can't serve stale Turbopack bundles.
 */
const CACHE_VERSION = "meteoprompt-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // POST /api/ask etc. → always network
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // cross-origin → passthrough
  if (url.pathname.startsWith("/api/")) return; // weather data → always live

  // Navigations: network-first so online users get fresh SSR; offline → shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const shell = await caches.match("/", { ignoreSearch: true });
        return (
          shell ||
          new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }),
    );
    return;
  }

  // Cache ONLY genuinely-immutable assets (content-hashed bundles, icons, fonts,
  // images, manifest). Everything else — notably App-Router RSC fetches
  // (`/path?_rsc=…`, mode !== "navigate") — falls through to the network, so no
  // dynamic content is ever served stale. This keeps the "always live" contract
  // robust even if a non-/api dynamic GET route is added later.
  const p = url.pathname;
  const isStaticAsset =
    p.startsWith("/_next/static/") ||
    p.startsWith("/_next/image") ||
    p === "/manifest.webmanifest" ||
    /\.(?:png|svg|ico|webp|jpe?g|gif|woff2?|ttf)$/i.test(p);
  if (!isStaticAsset) return; // dynamic GET (RSC, etc.) → always network

  // Cache-first — these assets are content-hashed or rarely change. Always
  // resolves to a Response (Response.error() on an offline miss) so respondWith
  // can never reject with undefined.
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const resp = await fetch(request);
        if (resp && resp.status === 200) cache.put(request, resp.clone());
        return resp;
      } catch {
        return Response.error();
      }
    }),
  );
});
