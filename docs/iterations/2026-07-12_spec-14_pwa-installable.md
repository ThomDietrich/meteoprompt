# Iteration spec-14 — Installierbare PWA (Add-to-Homescreen)

> **Status:** ✅ abgeschlossen — 2026-07-12
>
> MeteoPrompt als **installierbare Progressive Web App**: Nutzer können sie auf dem Smartphone
> (Android & iOS) als App zum Homescreen hinzufügen, sie startet im Standalone-Modus (ohne
> Browser-Chrome) mit App-Icon und Splash. **Dependency-frei** (Next-16-natives `manifest.ts`,
> handgeschriebener Service-Worker, Icons via bereits vorhandenes `sharp`) — respektiert die
> Regel „keine Library ohne Rücksprache".

---

## Entscheidungen (mit dem Menschen abgestimmt)

- **Offline-Verhalten: App-Shell + Live-Daten.** Der SW cached die App-Hülle (HTML-Shell, gehashte
  `_next/static`-Assets, Icons) → startet sofort wie eine App. **Wetterdaten (`/api/*`) sind IMMER
  live** (netzwerk-only, nie aus dem Cache) — ein Live-Dashboard darf keine veralteten Werte zeigen.
  Offline: die Shell lädt, die Karten zeigen ihren „keine Verbindung"-Zustand.
- **Eigener Install-Button:** dezenter „App installieren"-Button im Header, der `beforeinstallprompt`
  abfängt (Android/Desktop-Chrome). Auf iOS (kein `beforeinstallprompt`) stattdessen ein kurzer
  Hinweis „Teilen → Zum Home-Bildschirm". Button verschwindet, wenn bereits installiert.

## Umsetzung

**Manifest** — `src/app/manifest.ts` (Next `MetadataRoute.Manifest` → `/manifest.webmanifest`,
`dynamic`): `name`/`short_name` = **`appName()`** (env `APP_NAME`, Fallback `SITE_NAME`; z. B. „Wetter
Nurzen – Meteoprompt", damit die App unter „W" einsortiert), `display: "standalone"`, `start_url: "/"`,
`scope: "/"`, `lang: "de"`, `theme_color: "#1f5ba8"` (Marken-Blau), `background_color: "#f7f9fc"`
(Feld-Farbe), `categories: ["weather"]`, Icons 192/512/maskable.

**Icons** — Quelle ist das quadratische Marken-Icon `src/app/icon.svg` (nicht das hochkante
`wappen.png`). Ein Einmal-Skript `scripts/gen-pwa-icons.mjs` (rendert via `sharp`, läuft in Docker)
erzeugt nach `public/`:
- `icon-192.png`, `icon-512.png` (vollflächig, `purpose: any`),
- `icon-maskable-512.png` (Icon auf ~78 % zentriert auf Marken-Blau → Android-Safe-Zone, `purpose: maskable`),
- `apple-icon-180.png` (Apple-Touch-Icon).
Die PNGs werden committet; das Skript ist ein reines Dev-Werkzeug (kein Build-Schritt, `.mjs` → nicht
vom `tsc`-Gate erfasst).

**Service-Worker** — `public/sw.js` (Vanilla, Scope `/`, kein Build-Step):
- `install`: Shell precachen (`/`, Manifest, Icons) + `skipWaiting`.
- `activate`: alte Cache-Versionen löschen + `clients.claim`.
- `fetch`: `/api/*` und Nicht-GET → **nicht abgefangen** (immer Netz, Live-Daten). Navigationen →
  **network-first**, offline Fallback = gecachte `/`-Shell. Gehashte Static-Assets →
  **stale-while-revalidate**. `CACHE_VERSION` bumpen invalidiert.

**Registrierung** — `src/components/pwa-register.tsx` (Client, in Layout gemountet): registriert
`/sw.js` **nur in Production** (`NODE_ENV === "production"`). **In Dev wird ein etwaiger SW aktiv
de-registriert** — sonst würde ein cache-first-SW die bekannten stale-Turbopack-Bundles servieren
(siehe Docker-Gotcha im Projektgedächtnis).

**Install-Button** — `src/components/install-button.tsx` (Client, rechts im Header): fängt
`beforeinstallprompt` ab, zeigt einen Pill-Button, ruft bei Klick `prompt()`; hört auf `appinstalled`
und `display-mode: standalone`, um sich auszublenden; iOS-Safari-Zweig zeigt den Teilen-Hinweis.

**Layout/Meta** — `src/app/layout.tsx`: `metadata.manifest`, `metadata.appleWebApp`
(`capable`, `statusBarStyle`, `title`), `metadata.icons.apple`; neuer `viewport`-Export mit
`themeColor: "#1f5ba8"`, `width: device-width`, `initialScale: 1`, `viewportFit: "cover"` (iOS-Notch
im Standalone). Bestehendes `icon.svg`-Favicon bleibt unangetastet. `<PwaRegister/>` mounten;
`<InstallButton/>` in `header.tsx` einhängen.

## Bekannte Grenzen (bewusst, aus dem Review)

- **Offline erst nach einer Online-Sitzung vollständig.** Der Precache enthält die `/`-Shell +
  Icons/Manifest, aber NICHT die gehashten `_next/static`-Chunks (deren Namen zur SW-Schreibzeit
  unbekannt sind) — die füllen sich cache-first, während der SW die Seite kontrolliert. Ein
  Offline-Reload unmittelbar nach der Erstinstallation (ohne jeden weiteren Online-Load) kann daher
  noch nicht hydrieren. Für ein Live-Dashboard mit „Offline = Karten zeigen ‚keine Verbindung'"
  akzeptabel; ein Precache-Manifest-Build-Step wäre der Vollausbau (später, ggf. dependency-pflichtig).
- **`CACHE_VERSION` ist manuell.** Bei Releases, die neue `_next/static`-Hashes bringen, sammeln sich
  alte Assets im selben Cache, bis `CACHE_VERSION` erhöht wird → in die Release-Routine aufnehmen.
- **`beforeinstallprompt`/Install-Prompt** lässt sich headless nicht zuverlässig auslösen → der
  sichtbare Button ist auf einem echten Android-Gerät gegenzuprüfen (alle objektiven Kriterien erfüllt).

## Verifikations-Gate

Alle drei mit Exit 0 (DB-frei):

```bash
docker compose run --rm web npm run typecheck
docker compose run --rm web npm run build
docker compose run --rm web npm run test
```

Zusätzlich (separater Durchgang, keine Selbstabnahme):
- **Artefakte (Dev-Server):** `/manifest.webmanifest` liefert valides JSON mit korrekten Icons;
  `/icon-192.png` (192×192), `/icon-512.png` (512×512), `/icon-maskable-512.png`, `/apple-icon-180.png`
  jeweils 200 + korrekte Maße; `/sw.js` liefert 200. HTML enthält `<link rel="manifest">`,
  `apple-touch-icon`, `theme-color`, `apple-mobile-web-app-*`.
- **Installierbarkeit (Prod-Build):** gegen einen Production-Server (SW registriert nur dort) prüfen,
  dass der SW aktiv wird und die Installierbarkeits-Kriterien erfüllt sind (Lighthouse/PWA-Audit bzw.
  `navigator.serviceWorker.controller` gesetzt).
- **Regression:** Dashboard/Charts unverändert; Dev-Server registriert KEINEN SW (kein stale-Bundle-Risiko).
- **Visuell:** Install-Button erscheint im installierbaren Zustand und ist im Header sauber platziert.
