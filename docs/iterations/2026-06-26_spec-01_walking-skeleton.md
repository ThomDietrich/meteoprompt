# Iteration 1 — Walking Skeleton

> **Status:** ✅ abgeschlossen & verifiziert — Commit `5b15f33`. Gate A grün
> (typecheck + build exit 0), Gate B per Playwright + Live-Token bestätigt
> (628 Punkte, Card rendert echte Daten, Drag + Resize mit Chart-Reflow).
>
> Diese Iteration beschreibt **genau einen** Loop-Durchgang: das lauffähige
> Grundgerüst mit einer echten, datengetriebenen Card.

---

## 1. Ziel (Scope dieser Iteration)

Ein **Next.js + TypeScript**-Projekt aufsetzen, das **in einer Docker-Compose-Umgebung**
(nicht nativ) läuft, mit installiertem Stack (Tailwind, shadcn/ui, react-grid-layout,
ECharts, TanStack Table). Die Dashboard-Startseite (`/`) rendert **genau eine**
verschieb- und größenänderbare **Card**, die ein **ECharts-Liniendiagramm** der
**Außentemperatur der letzten 4 Wochen** aus der bestehenden InfluxDB anzeigt.

Das ist der kleinste sinnvolle End-to-End-Schnitt: Docker → Next.js → Grid → Card →
ECharts → API-Route → InfluxDB → echte Daten.

---

## 2. Erfolgskriterien (Verification Gate)

### Gate A — harte, automatisierte Bedingung (ohne Secrets, das ist die `/goal`-Bedingung)
Beide Befehle laufen **innerhalb der Docker-Umgebung** grün durch (Exit 0):

```bash
docker compose run --rm web npm run typecheck   # tsc --noEmit, 0 Fehler
docker compose run --rm web npm run build        # next build, erfolgreich
```

> Build & Typecheck dürfen **keine** DB-Verbindung brauchen (die Datenabfrage passiert
> zur Laufzeit, nicht zur Buildzeit). Damit ist Gate A ohne Token erfüllbar/prüfbar.

### Gate B — funktionale Abnahme (braucht Token, manuell verifiziert)
Mit gesetztem `INFLUXDB_TOKEN` in `.env`:
1. `docker compose up` startet die App, erreichbar unter `http://localhost:3000`.
2. Die API-Route `GET /api/series/outdoor-temperature` liefert **JSON mit ≥ 1 Datenpunkt**.
3. Die Seite `/` zeigt **genau eine** Card mit einem Liniendiagramm echter Temperaturwerte
   der letzten 4 Wochen (°C auf der Y-Achse, Zeit auf der X-Achse).
4. Die Card lässt sich **per Drag verschieben** und **per Resize-Griff vergrößern/verkleinern**;
   das Diagramm **reflowed** dabei (kein Abschneiden) — via `ResizeObserver` → `chart.resize()`.

**Empfohlene `/goal`-Bedingung (für den Execution-Schritt):**
> „`docker compose run --rm web npm run typecheck` **und** `docker compose run --rm web npm run build`
> beenden sich beide mit Exit 0."

Gate B wird nach erfolgreichem Gate A manuell abgenommen (sobald der Token vorliegt).

---

## 3. Tech-Stack & exakte Versionen

Versions-Stimmigkeit ist Anforderung. Stand der Recherche (neueste, zueinander passende):

| Bereich            | Paket / Tool                         | Version (Floor)   | Hinweis |
|--------------------|--------------------------------------|-------------------|---------|
| Framework          | `next`                               | 16.2.x            | App Router, Turbopack default |
| UI-Runtime         | `react` / `react-dom`                | 19.2.x            | React 19 |
| Sprache            | `typescript`                         | 6.0.x             | `strict: true` |
| Styling            | `tailwindcss`                        | 4.3.x             | Tailwind v4 (CSS-first, `@import "tailwindcss"`) |
| Komponenten        | shadcn/ui (CLI `shadcn@latest`)      | aktuell           | kopiert Komponenten, kein Versions-Dep; Tailwind-v4-/React-19-kompatibel |
| Dashboard-Grid     | `react-grid-layout`                  | 2.2.x             | v2 = TS-Rewrite; Drag+Resize+Persist |
| Diagramme          | `echarts`                            | 6.1.x             | |
| Diagramme (React)  | `echarts-for-react`                  | 3.0.x             | unterstützt React 18/19 |
| Tabellen           | `@tanstack/react-table`              | 8.21.x            | installiert (in Iteration 1 noch ohne sichtbare Tabelle) |
| Tabellen (virtual) | `@tanstack/react-virtual`            | 3.14.x            | installiert, für spätere große Tabellen |
| DB-Client          | `@influxdata/influxdb-client`        | 1.35.x            | **serverseitig**, Flux-Query gegen InfluxDB 2.x |
| Laufzeit (Docker)  | Node.js                              | aktuelle LTS (≥22; **24 LTS empfohlen**) | Image z. B. `node:24-alpine` |

> Versionen als **Floor** verstehen: jeweils die neueste kompatible Patch/Minor installieren,
> Lockfile (`package-lock.json`) committen. Bei React-19-Peer-Warnungen siehe §10.

---

## 4. Architektur & Datenfluss

```
Browser (Client Component, "use client")
  └─ react-grid-layout  →  Card (shadcn)  →  ECharts-LineChart (echarts-for-react)
        │  fetch()
        ▼
Next.js Route Handler  /api/series/outdoor-temperature   (server-only)
  └─ @influxdata/influxdb-client  →  Flux-Query
        ▼
InfluxDB 2.x @ your-influxdb-host   (org: your-org, bucket: your-bucket)
```

**Kernregeln:**
- Der **InfluxDB-Token bleibt serverseitig** (Route Handler / Server-Umgebung). Er darf
  **niemals** in Client-Code oder `NEXT_PUBLIC_*` landen.
- Das **Diagramm rendert client-seitig** (ECharts braucht das DOM): Chart-Komponente
  `"use client"`.
- **react-grid-layout ist client-only**: per `next/dynamic(() => import(...), { ssr: false })`
  laden bzw. in einer `"use client"`-Komponente, sonst Hydration-Mismatch.
- Die Seite holt Daten **zur Laufzeit** (Client-`fetch` auf die Route, oder dynamische
  Server-Route) — **nicht** zur Buildzeit. So bleibt `next build` ohne DB lauffähig (Gate A).

### MCP-Klarstellung (wichtig)
Der lokal konfigurierte **InfluxDB-MCP-Server ist ein Werkzeug für den Agenten/die
Entwicklung** (Datenexploration, Query-Design, Verifikation) — **nicht** die
Laufzeit-Datenquelle der App. MCP ist ein Agent-Protokoll, kein Web-App-Runtime-API.
Die App verbindet sich **direkt** via `@influxdata/influxdb-client`. (Die exakte
Flux-Query unten wurde per MCP gegen die echte DB verifiziert.)

---

## 5. Datenquelle — InfluxDB (verifiziert)

| Parameter   | Wert |
|-------------|------|
| Host        | `your-influxdb-host` |
| Org         | `your-org` |
| Bucket      | `your-bucket` |
| entity_id   | `garten_ventus_w830_outdoor_temperature` |
| _field      | `value` |
| _measurement| `°C` (= Einheit, Home-Assistant-Konvention) |
| weitere Tags| `domain=sensor` |

**Verifizierte Stichprobe (letzte 28 Tage):** 19.614 Rohpunkte (~alle 2 min),
Stunden-Mittel ≈ 672 Punkte; Wertebereich 4,6 – 36,4 °C, Mittel 20,8 °C; aktuell bis jetzt.

**Flux-Query der App** (Stunden-Mittel über 4 Wochen, ~672 Punkte → ideal fürs Liniendiagramm):

```flux
from(bucket: "your-bucket")
  |> range(start: -28d)
  |> filter(fn: (r) => r["entity_id"] == "garten_ventus_w830_outdoor_temperature")
  |> filter(fn: (r) => r["_field"] == "value")
  |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
  |> yield(name: "mean")
```

**Antwortformat der Route** (`GET /api/series/outdoor-temperature`):
```json
{
  "unit": "°C",
  "entity": "garten_ventus_w830_outdoor_temperature",
  "points": [ { "t": "2026-05-29T10:00:00Z", "v": 22.54 }, ... ]
}
```
Fehlerfall (kein Token / DB nicht erreichbar): HTTP 500/503 mit JSON-Fehlerobjekt,
die Card zeigt einen lesbaren Fehlerzustand (kein Crash).

---

## 6. Docker / Docker Compose

Alles läuft in Containern; **nicht** nativ. Die bestehende InfluxDB ist **extern**
(am Host `your-influxdb-host`) — **kein** DB-Container, nur Egress aus dem App-Container.

**`Dockerfile`** (Multi-Stage):
- `base`: `node:24-alpine`
- `deps`: `npm ci`
- `dev` (Target für Compose-Entwicklung): `next dev` (Turbopack), Port 3000
- `builder`: `npm run build` (Next `output: 'standalone'`)
- `runner`: schlankes Prod-Image, `node server.js` (standalone)

**`docker-compose.yml`** (Dev-Default):
- Service `web`: `build: { context: ., target: dev }`, `ports: ["3000:3000"]`,
  `env_file: .env`
- Hot-Reload-Pattern: Source als Bind-Mount, `node_modules` und `.next` als
  **anonyme/named Volumes** (damit der Host-Mount sie nicht überdeckt)
- Default-`command`: `npm run dev`

**Scripts in `package.json`:**
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "typecheck": "tsc --noEmit",
  "lint": "next lint"
}
```

---

## 7. Projektstruktur (Soll)

```
wetter-chat/
├─ Dockerfile
├─ docker-compose.yml
├─ .dockerignore
├─ .env.example            # committet, mit Platzhaltern
├─ .env                    # gitignored, echte Secrets
├─ next.config.ts          # output: 'standalone'
├─ tsconfig.json           # strict
├─ postcss.config.mjs      # @tailwindcss/postcss
├─ components.json         # shadcn
├─ package.json / package-lock.json
├─ src/
│  ├─ app/
│  │  ├─ globals.css       # @import "tailwindcss";
│  │  ├─ layout.tsx
│  │  ├─ page.tsx          # Dashboard-Seite (rendert das Grid client-only)
│  │  └─ api/series/outdoor-temperature/route.ts   # Route Handler (server-only)
│  ├─ components/
│  │  ├─ ui/               # shadcn-Komponenten (card, …)
│  │  ├─ dashboard-grid.tsx        # "use client", react-grid-layout
│  │  └─ charts/temperature-card.tsx  # "use client", ECharts + ResizeObserver
│  └─ lib/
│     └─ influx.ts         # InfluxDB-Client + Query-Helper (server-only)
└─ docs/iterations/2026-06-26_spec-01_walking-skeleton.md   # diese Spec
```

---

## 8. Das erste Diagramm (Detailspezifikation)

- **Titel:** „Außentemperatur Garten — letzte 4 Wochen"
- **Typ:** ECharts Liniendiagramm (`type: 'line'`), glatte Linie (`smooth: true`),
  dezenter Flächen-Gradient optional.
- **X-Achse:** Zeit (`type: 'time'`), formatierte Datums-/Stundenlabels.
- **Y-Achse:** Temperatur in °C, Auto-Range (Daten ~4–37 °C), Einheit im Achsen-/Tooltip-Label.
- **Tooltip:** `trigger: 'axis'`, zeigt Zeit + Wert mit °C und 1 Nachkommastelle.
- **Datenbindung:** `points` aus der API → `series[0].data = points.map(p => [p.t, p.v])`.
- **Resize:** `ResizeObserver` am Card-Container → `chartInstance.resize()` (debounced).
- **Ladezustände:** Loading-Skeleton während `fetch`, lesbare Fehlermeldung bei Fehler,
  „keine Daten"-Hinweis bei leerem Array.

---

## 9. Konfiguration / Secrets

**`.env.example`** (committet):
```env
INFLUXDB_URL=https://your-influxdb-host:8086
INFLUXDB_ORG=your-org
INFLUXDB_BUCKET=your-bucket
INFLUXDB_TOKEN=__HIER_READ_TOKEN_EINSETZEN__
```
- `.env` ist **gitignored**. Nur `.env.example` wird eingecheckt.
- Token braucht **Read-Rechte** auf Bucket `your-bucket`.
- `URL` exakt bestätigen (Protokoll/Port) — siehe §11.

---

## 10. Bekannte Stolpersteine / Kompatibilität

1. **React 19 Peer-Deps:** `react-grid-layout` deklariert „React 18+"; in der Praxis mit 19
   lauffähig. Falls `npm ci` an Peer-Konflikten scheitert → `overrides` in `package.json`
   bevorzugen (sauberer als `--legacy-peer-deps`). `echarts-for-react` 3.0.x unterstützt 19 nativ.
2. **react-grid-layout CSS:** `react-grid-layout/css/styles.css` **und**
   `react-resizable/css/styles.css` importieren, sonst keine Drag-/Resize-Optik.
3. **SSR/Hydration:** Grid + Chart strikt client-only (`"use client"` / `dynamic ssr:false`).
4. **Tailwind v4:** kein klassisches `tailwind.config.js` nötig; `@import "tailwindcss";` in
   `globals.css`, `@tailwindcss/postcss` in `postcss.config.mjs`. shadcn-init richtet das ein.
5. **shadcn init unter React 19:** ggf. Peer-Friction beim Hinzufügen von Komponenten —
   notfalls mit den dokumentierten Flags des shadcn-CLI lösen.
6. **Docker Bind-Mount:** `node_modules`/`.next` als separate Volumes, sonst überdeckt der
   Host-Mount die Container-Installation.
7. **ECharts-Bundle:** bei Bedarf modular importieren (`echarts/core`) — für Iteration 1
   genügt der Standardimport.

---

## 11. Offene Punkte (vom Nutzer benötigt, bevor Gate B abgenommen wird)

1. **InfluxDB Read-Token** für die App (in `.env`). → einziger echter Blocker für Live-Daten.
2. **Exakte Base-URL** bestätigen: `https://your-influxdb-host:8086` vs. ohne Port /
   anderes Schema. (MCP erreicht die DB; die App braucht die exakte URL.)
3. Optional: Soll Compose primär **Dev-Modus** (Hot Reload) oder den **Prod-Build** starten?
   Default dieser Spec: Dev-Service mit Hot Reload; Prod-Target im Dockerfile vorhanden.

> Gate A (Build/Typecheck) ist **ohne** diese Punkte erfüllbar — die Execution kann sofort
> starten; Token/URL werden erst für die funktionale Abnahme (Gate B) gebraucht.

---

## 12. Nicht-Ziele (bewusst außerhalb dieser Iteration)

- Mehr als eine Card / weitere Diagrammtypen (Windrose, Heatmap, Temperatur-Band, Tabellen).
- Chat-Funktion / LLM-Anbindung.
- Layout-Persistenz in einer DB (für Iteration 1 genügt In-Memory bzw. localStorage optional).
- Auth, Multi-User, Deployment-Pipeline, Tests jenseits von typecheck/build.
- Generische Entity-Auswahl/Konfigurierbarkeit der Datenquelle (vorerst hartverdrahtet auf
  die eine verifizierte Temperatur-Entity).
```
