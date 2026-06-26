# Iteration 2 — Natürlichsprachige Abfrage → Diagramm-Cards

> **Status:** 🟢 aktiv — Spec festgelegt 2026-06-26. Baut auf Iteration 1
> ([`2026-06-26_spec-01_walking-skeleton.md`](./2026-06-26_spec-01_walking-skeleton.md));
> erbt Stack, Docker/Compose, das verschiebbare Grid, die serverseitige InfluxDB-Anbindung.
>
> Diese Iteration beschreibt **genau einen** Loop-Durchgang: aus Freitext via LLM eine
> strukturierte Abfrage ableiten, daraus Flux bauen, echte Daten holen und als
> passende Diagramm-Card(s) im Grid darstellen.

---

## 1. Ziel (Scope dieser Iteration)

Die App startet (ohne gespeicherte Cards) **leer mit einem großen, zentrierten Suchfeld**
(Google-Stil). Der Nutzer gibt **Freitext** ein („Wie war die Außentemperatur der letzten
4 Wochen?"). Ein **LLM (Claude)** analysiert den Text, mappt ihn gegen einen **kuratierten
Katalog** der verfügbaren Wettermetriken und liefert eine **strukturierte `QuerySpec`**
(welche Metrik(en), Zeitraum, Aggregation, Diagrammtyp). Das Backend baut daraus
**deterministisch Flux**, fragt die InfluxDB **serverseitig** ab und rendert pro Diagramm
**eine Card** im **verschieb-/größenänderbaren Grid** aus Iteration 1.

Eine Anfrage kann **1..N unabhängige Diagramme** zurückgeben (→ 1..N Cards). Cards werden
**pro Browser in `localStorage`** persistiert (nur die `ChartSpec`, nicht die Daten) und
beim erneuten Öffnen durch **erneute Flux-Ausführung** mit frischen Daten wiederhergestellt.

**Kleinster sinnvoller Schnitt:** Suchfeld → Claude (Tool Use) → `QuerySpec` → Flux-Template
→ echte Daten → Cards. Drei Diagrammtypen: **`line`**, **`bars`**, **`windrose`**.

---

## 2. Erfolgskriterien (Verification Gate)

### Gate A — harte, automatisierte Bedingung (ohne Secrets, ohne DB/LLM)
Beide laufen **in Docker** grün (Exit 0):
```bash
docker compose run --rm web npm run typecheck
docker compose run --rm web npm run build
```
Build/Typecheck dürfen **weder** InfluxDB **noch** die Anthropic-API brauchen — alle Aufrufe
passieren zur **Laufzeit** in Route Handlers (`dynamic = 'force-dynamic'`).

### Gate B — funktionale Abnahme (braucht `INFLUXDB_TOKEN` + `ANTHROPIC_API_KEY`)
Per Playwright + Live-Keys zu verifizieren:

1. **Leerer Zustand:** Frischer Browser (kein `localStorage`) → nur das zentrierte Suchfeld,
   keine Cards.
2. **Einzel-Chart (DE):** „Außentemperatur der letzten 4 Wochen" → **eine** `line`-Card mit
   echten °C-Werten; Suchfeld dockt oben an.
3. **Balken (DE):** „Wie viel hat es diese Woche geregnet?" → **eine** `bars`-Card
   (`rainfall`, Tages-Summe).
4. **Windrose (DE):** „Windrichtung und -stärke gestern" → **eine** `windrose`-Card
   (`wind_direction` + `wind_speed`).
5. **Englisch:** „indoor humidity last 3 days" → **eine** `line`-Card (`indoor_humidity`).
6. **Mehr-Card (DE):** „Zeig mir Temperatur und Regen der letzten Woche" → **zwei** Cards
   (line + bars) aus **einer** Anfrage.
7. **Card-Header:** je Card ein prägnanter Titel + kleine Herkunftszeile (Original-Query) +
   **Mülltonnen-Icon**; Klick löscht die Card.
8. **Drag/Resize:** wie Iteration 1 — Cards verschieb-/größenänderbar, Diagramm reflowed.
9. **Persistenz/Reload:** Seite neu laden → dieselben Cards erscheinen wieder, mit **frisch
   ausgeführten** Queries (Beleg: Netzwerk zeigt `/api/chart`-Aufrufe, **kein** `/api/ask`,
   d. h. **kein** erneuter Claude-Call). Gelöschte Cards bleiben gelöscht.
10. **Fehlerpfad:** unverständliche/nicht-mappbare Eingabe → lesbare Meldung, **kein** Crash.

**Empfohlene `/goal`-Bedingung (Execution):** Gate A (typecheck + build exit 0). Gate B wird
manuell + per Playwright abgenommen (Keys vorausgesetzt).

---

## 3. Architektur & Datenfluss

```
[Suchfeld]  zentriert (0 Cards)  →  angedockt oben (≥1 Card)
   │  POST /api/ask { q: "<freitext>" }
   ▼
Route /api/ask  (server-only, force-dynamic)
   1) Claude (Anthropic SDK, TOOL USE)   Input: q + KATALOG + Diagrammwahl-Regeln
                                          Output: validierte QuerySpec { charts: ChartSpec[] }
   2) für jede ChartSpec:  Flux-Template  →  @influxdata/influxdb-client  →  Datenreihen
   3) Response: { query, charts: [ { spec, data } ... ] }
   ▼
Frontend:  pro ChartSpec eine Card ins Grid;  ChartSpec + Layout → localStorage

Reload:
[localStorage: ChartSpec[] + Layout]
   │  POST /api/chart { spec: ChartSpec }   (je Card, OHNE Claude)
   ▼
Route /api/chart  (server-only)  →  Flux-Template  →  frische Datenreihen  →  Card-Refresh
```

**Zwei Endpunkte, bewusst getrennt:**
- **`/api/ask`** — NL → Claude → `QuerySpec` → Daten. Nur bei **neuen** Anfragen (kostet LLM).
- **`/api/chart`** — `ChartSpec` → Daten (**ohne** Claude). Für Reload-Refresh persistierter
  Cards. Deterministisch, günstig, schnell.

**Kernregeln (von Iteration 1 geerbt):** InfluxDB-Token **und** Anthropic-Key bleiben
**serverseitig** (nie `NEXT_PUBLIC_*`). Diagramme rendern client-seitig (ECharts braucht DOM).
Grid + Charts client-only. Daten zur **Laufzeit**, nicht zur Buildzeit.

---

## 4. Datenmodell — `QuerySpec` (Superset; v2 implementiert nur den markierten Subset)

Die Typen werden **vollständig (zukunftsfähig)** in TypeScript definiert; v2 **implementiert**
nur den Subset. Spätere Iterationen fügen additiv **neue Union-Zweige / Enum-Werte / Transforms**
hinzu — das Wire-Format ändert sich nicht.

```ts
// src/lib/query-spec.ts  (Superset)
export interface QuerySpec {
  version: 1;
  query: string;                    // Original-Nutzertext
  charts: ChartSpec[];              // 1..N unabhängige Diagramme (→ je eine Card)
}

export interface ChartSpec {
  id: string;
  title: string;                    // Claude-Titel → Card-Header
  chart: ChartType;                 // v2: 'line' | 'bars' | 'windrose'
  timeRange: TimeRange;             // gemeinsamer Default für die Serien
  series: Series[];                 // 1..N Serien in EINEM Diagramm
}

export type ChartType =
  | 'line' | 'bars' | 'windrose'    // v2
  | 'rangeBand' | 'heatmap' | 'table' | 'scatter';   // später (Nicht-Ziel v2)

export interface TimeRange { start: string; stop?: string; }  // z. B. {start:'-28d', stop:'now'}

export interface Series {
  id: string;
  label: string;
  role?: SeriesRole;                // v2: 'value' | 'magnitude' | 'direction'
  source: Source;
  timeRange?: TimeRange;            // (später) Pro-Serie-Override → Zeitvergleich
}

export type SeriesRole =
  | 'value' | 'magnitude' | 'direction'      // v2
  | 'min' | 'mean' | 'max' | 'comparison';   // später

// Diskriminierte Union über "kind" — der zentrale Erweiterungspunkt
export type Source =
  | MetricSource                    // v2
  | DerivedSource;                  // später (Nicht-Ziel v2)

export interface MetricSource {
  kind: 'metric';
  metric: string;                   // Katalog-Key (siehe §5)
  aggregation: Aggregation;         // 'mean'|'sum'|'min'|'max'|'none'
  window?: string;                  // z. B. '1h', '1d'
}

export interface DerivedSource {    // RESERVIERT für Iteration 3+ (nicht v2)
  kind: 'derived';
  transform: string;                // Name einer registrierten, serverseitigen Transformation
  inputs: { metric: string; as: string }[];
  unit?: string;
}

export type Aggregation = 'mean' | 'sum' | 'min' | 'max' | 'none';
```

**Zwei Achsen von „mehreren":**
- **Mehrere `series` in einem `ChartSpec`** → Vergleich/Überlagerung (gleiche Einheit).
- **Mehrere `ChartSpec` in einer `QuerySpec`** → unabhängige Cards (unterschiedliche
  Einheiten/Typen).

**Beispiel — Mehr-Card-Antwort** („Temperatur und Regen der letzten Woche"):
```jsonc
{ "version":1, "query":"Temperatur und Regen der letzten Woche", "charts":[
  { "id":"c1","title":"Außentemperatur — letzte Woche","chart":"line",
    "timeRange":{"start":"-7d","stop":"now"},
    "series":[{"id":"s1","label":"Außentemperatur","role":"value",
      "source":{"kind":"metric","metric":"outdoor_temperature","aggregation":"mean","window":"1h"}}]},
  { "id":"c2","title":"Niederschlag — letzte Woche","chart":"bars",
    "timeRange":{"start":"-7d","stop":"now"},
    "series":[{"id":"s2","label":"Regenmenge","role":"value",
      "source":{"kind":"metric","metric":"rainfall","aggregation":"sum","window":"1d"}}]}
]}
```

**Windrose** = ein `ChartSpec`, zwei Serien mit Rollen:
```jsonc
{ "id":"c1","title":"Wind — gestern","chart":"windrose","timeRange":{"start":"-1d","stop":"now"},
  "series":[
    {"id":"dir","role":"direction","label":"Windrichtung",
      "source":{"kind":"metric","metric":"wind_direction","aggregation":"mean","window":"1h"}},
    {"id":"mag","role":"magnitude","label":"Windgeschwindigkeit",
      "source":{"kind":"metric","metric":"wind_speed","aggregation":"mean","window":"1h"}}
  ]}
```

---

## 5. Der Index / Katalog (handkuratiert, committet)

Der Bucket `your-bucket` ist die **gesamte HA-Instanz** (~29.847 Entities) — daher
**kein** Roh-Dump an Claude, sondern ein **kuratierter Katalog** der Wetterstation Ventus W830.
Quelle: Schema-Scan vom 2026-06-26 (Feld immer `_field == "value"`; Einheit = `_measurement`).

```ts
// src/lib/catalog.ts
export interface CatalogEntry {
  key: string;                 // stabiler Katalog-Key (= QuerySpec metric)
  entityId: string;            // garten_ventus_w830_*
  field: 'value';
  unit: string;
  labelDe: string;
  synonyms: string[];          // DE+EN, lowercase
  defaultAggregation: Aggregation;
  defaultWindow: string;
  defaultChart: ChartType;
  category: 'temperatur'|'feuchte'|'wind'|'niederschlag'|'druck'|'strahlung';
  // type:'raw' implizit; Iteration 3+ ergänzt type:'derived' (transform-gestützt)
}
```

| key | entityId-Suffix | Einheit | labelDe | def. Agg | def. Window | def. Chart | Synonyme (Auszug) |
|-----|-----------------|---------|---------|----------|-------------|------------|-------------------|
| `outdoor_temperature` | `outdoor_temperature` | °C | Außentemperatur | mean | 1h | line | außentemperatur, temperatur, draußen, temp |
| `apparent_temperature` | `apparent_temperature` | °C | Gefühlte Temperatur | mean | 1h | line | gefühlt, gefühlte temperatur, apparent |
| `dew_point_temperature` | `dew_point_temperature` | °C | Taupunkt | mean | 1h | line | taupunkt, dew point |
| `heat_index` | `heat_index` | °C | Hitzeindex | mean | 1h | line | hitzeindex, heat index |
| `humidex` | `humidex` | °C | Humidex | mean | 1h | line | humidex, schwüle |
| `wind_chill_temperature` | `wind_chill_temperature` | °C | Windchill | mean | 1h | line | windchill, gefühlte kälte |
| `indoor_temperature` | `indoor_temperature` | °C | Innentemperatur | mean | 1h | line | innen, drinnen, indoor temperature |
| `indoor_dew_point` | `indoor_dew_point` | °C | Taupunkt innen | mean | 1h | line | taupunkt innen |
| `outdoor_humidity` | `outdoor_humidity` | % | Luftfeuchte (außen) | mean | 1h | line | luftfeuchte, feuchte, feuchtigkeit, humidity |
| `indoor_humidity` | `indoor_humidity` | % | Luftfeuchte (innen) | mean | 1h | line | innenfeuchte, indoor humidity |
| `wind_speed` | `wind_speed` | km/h | Windgeschwindigkeit | mean | 1h | windrose | wind, windgeschwindigkeit, wind speed |
| `wind_gust_speed` | `wind_gust_speed` | km/h | Windböen | max | 1h | line | böen, windböen, gust |
| `wind_direction` | `wind_direction` | ° | Windrichtung | mean | 1h | windrose | windrichtung, richtung, wind direction |
| `rainfall` | `rainfall` | mm | Niederschlag (Regenmenge) | sum | 1d | bars | regen, niederschlag, regenmenge, rain |
| `rain_rate` | `rain_rate` | mm/h | Regenrate | max | 1h | line | regenrate, regenintensität, rain rate |
| `barometric_pressure` | `barometric_pressure` | hPa | Luftdruck | mean | 1h | line | luftdruck, druck, pressure, barometer |
| `atmospheric_pressure` | `atmospheric_pressure` | hPa | Luftdruck (atm.) | mean | 1h | line | atmosphärischer druck |
| `pressure_altimeter` | `pressure_altimeter` | hPa | Luftdruck (Höhenmesser) | mean | 1h | line | höhenmesser, altimeter |
| `solar_radiation` | `solar_radiation` | W/m² | Solarstrahlung | mean | 1h | line | solar, sonne, einstrahlung, solar radiation |
| `maximum_solar_radiation` | `maximum_solar_radiation` | W/m² | Max. Solarstrahlung | max | 1h | line | max solar, maximale einstrahlung |
| `uv_index` | `uv_index` | – | UV-Index | max | 1h | line | uv, uv-index, uv index |
| `cloud_base_height` | `cloud_base_height` | m | Wolkenbasis-Höhe | mean | 1h | line | wolken, wolkenbasis, cloud base |

> `wind_speed`/`wind_direction` haben `defaultChart: windrose`, weil sie zusammen die Windrose
> bilden (Magnitude + Richtung). Bei reinem „Windgeschwindigkeit"-Wunsch ohne Richtung darf
> Claude `line` wählen. Die drei Druck-Varianten sind quasi-redundant; **`barometric_pressure`**
> ist die kanonische „Luftdruck"-Antwort.

**Diagrammwahl-Regeln (für Claude im Prompt):**
- Standardmäßig `defaultChart` der Metrik nehmen.
- Wörter wie „Verlauf/über die Zeit" → `line`; „Summe/pro Tag/wie viel" → `bars`;
  „Windrichtung/Windrose" → `windrose`.
- **Gleiche Einheit & Vergleich gewünscht** (z. B. Innen- vs. Außentemperatur, Min/Mittel/Max)
  → **eine** Card, mehrere `series`.
- **Unterschiedliche Einheiten / klar getrennte Themen** → **mehrere** `ChartSpec` (Cards).

---

## 6. Claude-Anbindung

- **SDK:** `@anthropic-ai/sdk` (serverseitig). Secret **`ANTHROPIC_API_KEY` in `.env`**
  (nie Client). `.env.example` bekommt einen Platzhalter.
- **Modell:** Default **`claude-sonnet-4-6`** (schnell, günstig, starkes Tool-Use);
  optionale Eskalation auf **`claude-opus-4-8`** bei mehrdeutigen Anfragen (v2: einfache
  Heuristik oder fix Sonnet — Eskalation ist optional).
- **Strukturierte Ausgabe via Tool Use:** ein Tool `emit_query_spec` mit dem **`QuerySpec`-Schema
  als JSON-Schema** (nur der v2-Subset: `chart ∈ {line,bars,windrose}`, `source.kind = 'metric'`).
  `tool_choice` erzwingt den Tool-Aufruf → garantiert valides JSON. Danach **serverseitig
  validieren** (Metrik existiert im Katalog, Enum-Werte zulässig).
- **System-Prompt:** enthält den **Katalog** (key, labelDe, unit, synonyms, defaults) + die
  Diagrammwahl-Regeln + Hinweise zu Zeiträumen (relative Flux-Dauern wie `-7d`, `-28d`).
- **Tool-Schema = nur Implementiertes:** Claude kann nichts anfragen, was v2 nicht rendert
  (`derived`, `rangeBand`, `heatmap`, … sind **nicht** im v2-Tool-Schema).
- **Fehlerfall:** kein valides/mappbares Spec → HTTP 422 mit JSON-Fehler; UI zeigt eine
  lesbare Meldung („Konnte die Anfrage nicht zuordnen — bitte präzisieren").

---

## 7. Flux-Templating (`ChartSpec` → Flux → Datenreihen)

Pro `Series` mit `MetricSource`:
```flux
from(bucket: "your-bucket")
  |> range(start: <timeRange.start>, stop: <timeRange.stop ?? now()>)
  |> filter(fn: (r) => r["entity_id"] == "<catalog[metric].entityId>")
  |> filter(fn: (r) => r["_field"] == "value")
  |> aggregateWindow(every: <window>, fn: <aggregation>, createEmpty: false)
  |> yield(name: "<series.id>")
```
- `aggregation: 'none'` → kein `aggregateWindow` (Rohpunkte; nur für kurze Zeiträume).
- Mehrere Serien → mehrere `yield`s (oder mehrere Queries) und im Response je Serie ein Array.
- **Whitelist:** `metric` muss im Katalog sein; `entityId` kommt **nur** aus dem Katalog
  (kein vom LLM gelieferter freier Entity-String) → keine Injection, kein Streuen über die 30k.

**Response-Form (`/api/ask` und `/api/chart`):** je Chart
```jsonc
{ "spec": ChartSpec, "series": [ { "id":"s1","label":"…","unit":"°C","points":[{"t":ISO,"v":number}, …] } ] }
```
Fehler/keine Daten → lesbarer Zustand pro Card (kein Crash, „keine Daten"-Hinweis).

---

## 8. Persistenz (localStorage, pro Browser)

- Gespeichert wird **pro Card**: `{ id, spec: ChartSpec, originQuery: string, layout: {x,y,w,h} }`
  unter Schlüssel `wetter-chat:cards:v1`. **Nur Specs + Layout, keine Daten.**
- **Beim Laden:** Cards + Layout aus `localStorage` herstellen → für jede Card
  **`POST /api/chart` (ohne Claude)** → frische Daten. So sieht man nach einer Woche dieselben
  Cards mit aktuellen Werten (relative Zeiträume „rollen" mit).
- **Kein gespeicherter Eintrag** → leerer Zustand (zentriertes Suchfeld).
- Löschen (Mülltonne) entfernt die Card aus State **und** `localStorage`.
- `localStorage` nur client-seitig lesen (in `useEffect` / nach Mount) → kein SSR/Hydration-Mismatch.

---

## 9. UI / UX

- **Leerer Zustand:** großes zentriertes Suchfeld (Google-Stil).
- **≥1 Card:** Suchfeld **dockt als schlanke Leiste oben an**; darunter das Grid.
- **Neue Anfrage** → eine neue Card je zurückgegebenem `ChartSpec`, **angehängt** ans Grid.
- **Card-Header:** prägnanter **Titel** (`ChartSpec.title`) + kleine **Herkunftszeile**
  (Original-Query) + **Mülltonnen-Icon** (löschen). Drag-Handle wie Iteration 1.
- **Drei Chart-Renderer** (ECharts, je `"use client"`, mit `ResizeObserver → chart.resize()`):
  `line`, `bars`, `windrose` (Polar: `angleAxis` Himmelsrichtungen + `radiusAxis` + gestapelte
  `bar`-Serie nach Geschwindigkeits-Bins).
- Ladezustand (Spinner/Skeleton) je Card während `fetch`.

---

## 10. Neue / geänderte Dateien (Soll)

```
src/lib/query-spec.ts          # NEU: QuerySpec/ChartSpec/Series/Source (Superset-Typen)
src/lib/catalog.ts             # NEU: handkuratierter Katalog (22 Metriken) + Lookup
src/lib/claude.ts              # NEU: Anthropic-Client + Tool-Use-Mapping (server-only)
src/lib/flux.ts                # NEU: ChartSpec → Flux, Ausführung, Response-Mapping (server-only)
src/lib/influx.ts              # ggf. refactor: gemeinsamer Influx-Client/Query-Runner
src/lib/card-store.ts          # NEU: localStorage-Persistenz (Specs+Layout) + Reload-Refresh
src/app/api/ask/route.ts       # NEU: POST {q} → Claude → QuerySpec → Daten (force-dynamic)
src/app/api/chart/route.ts     # NEU: POST {spec} → Daten ohne Claude (force-dynamic)
src/app/page.tsx               # ÄNDERN: leerer Zustand + Suchfeld + dynamisches Grid
src/components/search-box.tsx  # NEU: zentriert ↔ oben angedockt ("use client")
src/components/dashboard-grid.tsx  # ÄNDERN: dynamische Cards add/remove/persist
src/components/cards/chart-card.tsx # NEU: generische Card (Header, Titel, Herkunft, Trash, Renderer-Switch)
src/components/charts/line-chart.tsx    # NEU (ersetzt temperature-card.tsx)
src/components/charts/bars-chart.tsx    # NEU
src/components/charts/wind-rose.tsx     # NEU
.env / .env.example            # ÄNDERN: ANTHROPIC_API_KEY ergänzen
package.json                   # ÄNDERN: @anthropic-ai/sdk
```
> `src/components/charts/temperature-card.tsx` aus Iteration 1 wird in `chart-card` +
> `line-chart` aufgelöst (kein Funktionsverlust).

---

## 11. Konfiguration / Secrets

`.env` (gitignored) ergänzen, `.env.example` mit Platzhalter:
```env
# … bestehende INFLUXDB_* …
ANTHROPIC_API_KEY=__HIER_ANTHROPIC_KEY_EINSETZEN__
```
- Beide Secrets **nur serverseitig**. Build/Typecheck brauchen sie nicht.

---

## 12. Bekannte Stolpersteine

1. **ECharts Windrose:** Polar-Setup (`polar`, `angleAxis` mit 8/16 Himmelsrichtungen,
   `radiusAxis`, gestapelte `bar`-Serie nach Speed-Bins). Etwas Config-Aufwand.
2. **localStorage & SSR:** nur nach Mount lesen (`useEffect`), sonst Hydration-Mismatch.
3. **Claude Tool Use:** `tool_choice` erzwingen; Antwort streng gegen Katalog/Enums validieren;
   nie ungeprüft Flux/Entity aus dem Modell übernehmen.
4. **Latenz/Kosten:** `/api/ask` ruft das LLM — `/api/chart` (Reload) bewusst **ohne**. Optional
   simples Debouncing/Loading-State im UI.
5. **Zeiträume:** Claude liefert relative Flux-Dauern (`-7d`, `-28d`) oder absolute ISO-Zeiten;
   Backend validiert das Format.
6. **Grid-Persistenz vs. Iteration-1-Layout:** Layout je Card mitspeichern (`{x,y,w,h}`),
   damit Anordnung erhalten bleibt.
7. **Build ohne Keys:** `force-dynamic` auf beiden Routes, damit `next build` keine API/DB zieht.

---

## 13. Offene Punkte (vom Nutzer benötigt, bevor Gate B abgenommen wird)

1. **`ANTHROPIC_API_KEY`** (Claude) → einziger neuer Blocker für die LLM-Funktion. In `.env`.
2. (Influx-Token + URL liegen bereits aus Iteration 1 vor.)

> Gate A ist **ohne** diese Punkte erfüllbar — die Execution kann sofort starten; der
> Anthropic-Key wird erst für die funktionale Abnahme (Gate B) gebraucht.

---

## 14. Nicht-Ziele (bewusst außerhalb dieser Iteration)

- `source.kind: 'derived'` / berechnete Größen (z. B. Erdfeuchte aus Regen+Temperatur) —
  **Struktur reserviert**, Implementierung Iteration 3+.
- Diagrammtypen `rangeBand` („Sonnendiagramm"), `heatmap`, `table`, `scatter`.
- Pro-Serie-Zeitvergleich (`Series.timeRange`-Override).
- Mehrere Geräte/Buckets, generische Entity-Auswahl jenseits des Ventus-W830-Katalogs.
- Roh-Flux durch das LLM; Auth/Multi-User; serverseitige Persistenz (v2 = localStorage).
- Streaming-Antworten, Chat-Verlauf/Follow-up-Fragen.
