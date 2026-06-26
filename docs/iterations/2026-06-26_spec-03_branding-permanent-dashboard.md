# Iteration 3 — Branding + permanentes Dashboard („Rahmen")

> **Status:** 🟢 aktiv — Spec festgelegt 2026-06-26. Erste von drei Phasen des
> Iteration-3-Programms:
> **03 „Rahmen"** (dieses Doc) → **04 „Vielfalt"** (Diagrammtypen+Farben) →
> **05 „Intelligenz"** (Rekord/Aggregat/Vergleich + `derived`).
> Erbt alles aus Iteration 2 (NL→Cards, QuerySpec/ChartSpec, `/api/ask`+`/api/chart`,
> Katalog, react-grid-layout). Quellen: [`docs/research/neowx-permanent-dashboard.md`](../research/neowx-permanent-dashboard.md),
> Wappenfarben siehe §4.

---

## 1. Ziel (Scope dieser Phase)

Der App ein **Identität** + einen **dauerhaften, kuratierten Dashboard-Rahmen** geben, in dem
der bestehende Freitext-Bereich aus Iteration 2 eingebettet ist:

- **Header** mit Gemeinde-**Wappen** + Titel „**wetter.nurzen.de – Dein Wetter-Chat**".
- **Gemeinde-Farbtheme** (Blau/Gold/Grün aus dem Wappen) für die ganze Seite, **Footer**.
- Ganz oben eine **schlanke Kennwert-Zeile** mit 12 aktuellen Werten (NeoWX-Stil).
- Ganz unten **10 feste Verlaufs-Charts** (NeoWX-orientiert, von ~30–40 reduziert), **außerhalb**
  des nutzererzeugten Bereichs.
- **UX-Politur**, die hier gut passt: **Skeleton-Block mit Shimmer** beim Absenden + **sichtbare,
  ehrliche Fehlermeldungen** in allen Zuständen (behebt den Bug „keine Antwort, kein Fehler").

Bewusst **nicht** hier: neue Diagrammtypen/Custom-Series + Zufallsfarben (→ 04), Rekord-/Aggregat-/
Vergleichs-Queries + `derived` (→ 05). Die 10 festen Charts nutzen **nur vorhandene Renderer**
(line inkl. Area, bars, windrose).

Seitenaufbau (oben → unten):
```
[Header: Wappen + „wetter.nurzen.de – Dein Wetter-Chat"]
[Kennwert-Zeile: 12 aktuelle Werte — schlank, elegant]
[Freitext-Bereich aus Iteration 2: Suchfeld + nutzererzeugte, verschiebbare Cards]
──────── horizontale Trennlinie: dynamischer Bereich ↑  /  fixer Bereich ↓ ────────
[Permanentes Dashboard: 10 feste Verlaufs-Charts (festes responsives Grid, nicht verschiebbar)]
[Footer: Gemeindefarben, Datenquelle/Impressum-Platzhalter]
```

---

## 2. Erfolgskriterien (Verification Gate)

### Gate A — automatisiert (ohne Secrets)
```bash
docker compose run --rm web npm run typecheck
docker compose run --rm web npm run build
```
Beide exit 0. Neue Route(s) `force-dynamic`; Build braucht weder DB noch Anthropic.

### Gate B — funktional (Playwright + Influx-Token; Anthropic nur für den bestehenden NL-Teil)
1. **Header** zeigt das **Wappen** (`public/wappen.png`) neben „wetter.nurzen.de – Dein Wetter-Chat"; Gemeindefarben sichtbar (Blau/Gold/Grün), **Footer** vorhanden.
2. **Kennwert-Zeile** rendert **12 Pills/Mini-Cards** (je **Icon + Label + Wert/Einheit**) aus `/api/now` (echte, frische Werte; korrekte Einheiten, z. B. Wind in **km/h**).
3. **Permanentes Dashboard**: **10** feste Charts mit echten Daten (Temp-Verlauf 3-linig, Tagesregen-Balken 30 T, Regenrate, Windrose, Wind+Böen, Druck, Feuchte, Solar, UV, Min/Max-Temp 30 T). Reflow bei Resize, keine Fehler. **Oberhalb eine sichtbare horizontale Trennlinie** zum dynamischen Bereich.
4. **Freitext-Bereich** funktioniert unverändert weiter (NL→Card, Persistenz, Löschen).
5. **Skeleton beim Absenden**: Klick auf „Anzeigen" zeigt **sofort** einen Platzhalter-Block mit **Shimmer-Animation** und der Query als Untertitel; wird beim Eintreffen der Antwort durch die echte Card ersetzt.
6. **Fehlermeldungen sichtbar in allen Zuständen**: Im leeren **und** im Card-Zustand führt eine fehlschlagende/unmappbare Anfrage zu einer **klar sichtbaren** Meldung. Insbesondere der reproduzierte Fall **„Wann war der kälteste Zeitpunkt im Jahr 2025"** ergibt **nicht** mehr „nichts", sondern eine repräsentative Meldung (z. B. „Solche Rekord-Fragen kann ich noch nicht beantworten — kommt in einer späteren Iteration" bzw. bei Out-of-Scope „Dazu habe ich keine Daten"). Kein stiller Leerzustand.
7. Layout responsiv (Kennwerte umbrechen sauber; feste Charts in ≥2 Spalten auf Desktop, 1 auf Mobile).

> Gate B-Punkt 6 verlangt **sichtbare Fehler**, nicht die inhaltliche Beantwortung von Rekord-Queries
> (das ist spec-05). Zuerst muss der Fall reproduziert + die Ursache behoben werden (s. §8).

---

## 3. Branding / Theme

**Wappen-Palette** (aus `public/wappen.png`; exakte Hex ggf. aus dem Original feintunen):

| Token | Farbe | Hex | Einsatz |
|---|---|---|---|
| `--brand-blue` (Azur) | Königsblau | `#1F5BA8` | Header-Bg, Links, Primär-Akzent |
| `--brand-gold` (Or) | Goldgelb | `#F2A81C` | Buttons/Highlights, Sonne/UV |
| `--brand-green` (Vert) | Grün | `#2E9D46` | Footer-Bg, Natur-Akzente |
| `--brand-ink` | Schwarz | `#1A1A1A` | Text, Outlines |
| `--brand-field` | Off-white | `#F7F9FC` | Seiten-Hintergrund |

- In Tailwind v4 als `@theme`-Tokens in `globals.css` (CSS-first) hinterlegen; Komponenten nutzen die Tokens.
- **Header** (`header.tsx`): links Wappen (`/wappen.png`, Höhe ~40–48 px), daneben Titel
  „**wetter.nurzen.de**" (stark) + „Dein Wetter-Chat" (leichter). Hintergrund dezent blau/weiß.
- **Footer** (`footer.tsx`): grün getönt, Zeile „Daten: eigene Wetterstation · Inspiriert von
  [wetter.nurzen.de/neowx](https://wetter.nurzen.de/neowx/)" + Jahr; Impressum-Platzhalter.
- Stil insgesamt zu einer Wetterseite passend (luftig, klare Typo, dezente Schatten).

> Hinweis: Iteration 04 nutzt dieselbe Palette für die **zufälligen Pro-Serie-Farben**; hier nur die Theme-Basis.

---

## 4. Kennwert-Zeile (12 aktuelle Werte)

Jeder Kennwert als eigene **Pill / Mini-Card** (lose inspiriert vom HA-Beispiel, nicht daran gebunden) —
Aufbau: **Icon** (`lucide-react`) · **Kurzbeschreibung/Label** · **Wert + Einheit**
(z. B. 🌡 „Außentemperatur" / „24,3 °C"). Die Pills bilden zusammen eine schlanke, umbruchfähige Zeile
unter dem Header. Quelle: neuer Endpoint **`/api/now`** — letzter Wert je Metrik.

| # | Label | Einheit | Icon (lucide) | Katalog-Key | Aggregation |
|---|---|---|---|---|---|
| 1 | Außentemperatur | °C | `Thermometer` | `outdoor_temperature` | latest |
| 2 | Gefühlt | °C | `ThermometerSun` | `apparent_temperature` | latest |
| 3 | Taupunkt | °C | `Droplets` | `dew_point` | latest |
| 4 | Luftfeuchte | % | `Droplet` | `outdoor_humidity` | latest |
| 5 | Wind | km/h | `Wind` | `wind_speed` | latest |
| 6 | Böen | km/h | `Gauge` | `wind_gust` | latest |
| 7 | Windrichtung | ° (+ Kürzel N/NO/…) | `Compass` | `wind_direction` | latest |
| 8 | Regen heute | mm | `CloudRain` | `rainfall` (`dayrain_mm`) | Tages-Max (Akkumulator) |
| 9 | Regenrate | mm/h | `CloudDrizzle` | `rain_rate` | latest |
| 10 | Luftdruck | hPa | `Gauge` | `pressure` | latest |
| 11 | Sonne | W/m² | `Sun` | `solar_radiation` | latest |
| 12 | UV | – | `SunMedium` | `uv_index` | latest |

**`/api/now`** (server-only, `force-dynamic`): eine Flux-Query mit `last()` je Entity (Whitelist aus
dem Katalog), Rückgabe `{ values: [{ key, label, unit, value, t }] }`. „Regen heute" = Tages-Max von
`dayrain_mm` (heutiger Akkumulator), Windrichtung zusätzlich als Kompass-Kürzel.

---

## 5. Permanentes Dashboard (10 feste Charts)

**Oberhalb dieses Bereichs eine deutliche horizontale Trennlinie** (mit kleinem Label, z. B.
„Stations-Dashboard"), die den **fixen** Bereich klar vom **dynamischen** Nutzerbereich darüber abgrenzt.

Festes, responsives Grid (CSS-Grid, **nicht** verschiebbar/löschbar) unter dem Freitext-Bereich.
Jede Karte = eine **vordefinierte `ChartSpec`** (`src/lib/permanent-dashboard.ts`), gerendert über den
bestehenden **`/api/chart`**-Pfad (kein Claude). Reuse der Iteration-2-Renderer.

| # | Titel | Metrik(en) | Renderer | Zeit | Aggregation |
|---|---|---|---|---|---|
| 1 | Temperaturverlauf | `outdoor_temperature`, `apparent_temperature`, `dew_point` | line (3 Serien) | -24h | mean/1h |
| 2 | Tagesregen (30 Tage) | `rainfall` | bars | -30d | diff⁺+sum /1d |
| 3 | Regenrate | `rain_rate` | line (Area) | -24h | mean/1h |
| 4 | Windrose | `wind_direction` + `wind_speed` | windrose | -7d | nach Sektor |
| 5 | Wind & Böen | `wind_speed`, `wind_gust` | line (2 Serien) | -24h | mean/max /1h |
| 6 | Luftdruck | `pressure` | line | -24h | mean/1h |
| 7 | Luftfeuchte | `outdoor_humidity` | line | -24h | mean/1h |
| 8 | Sonnenstrahlung | `solar_radiation`, `max_solar_radiation` | line (Area+Linie) | -24h | mean/max /1h |
| 9 | UV-Index | `uv_index` | line (Area) | -24h | max/1h |
| 10 | Min/Max Außentemp (30 T) | `outdoor_temperature` ×3 (min/mean/max) | line (3 Serien) | -30d | min/mean/max /1d |

> Chart #10 ist hier als 3-Linien-Min/Mittel/Max umgesetzt; in **spec-04** wird er auf **candlestick /
> lineRange** („Sonnendiagramm") aufgewertet. „Area" = vorhandener line-Renderer mit `areaStyle`.

Optional (klein): Zeitbereich-Tabs (24h/Woche/Monat/Jahr) — **Nicht-Ziel** dieser Phase, Default 24h/30d.

---

## 6. Skeleton-Shimmer beim Absenden

- Beim Absenden (Enter / „Anzeigen") **sofort** — vor der Server-Antwort — einen **Skeleton-Card-Block**
  ins Grid einfügen: Platzhalter-Flächen mit **Shimmer/Shadow-Animation** (Tailwind, z. B.
  `animate-pulse` + ein Shimmer-Gradient), Header bereits mit der **Query als Untertitel**.
- Bei Antwort: Skeleton durch die echte Card (bzw. Cards bei Mehr-Chart) ersetzen; bei Fehler durch
  die Fehlermeldung (§7) ersetzen und Skeleton entfernen.
- Vermittelt „arbeitende, intuitive Oberfläche".

---

## 7. Fehlerbehandlung (sichtbar in allen Zuständen)

**Bug (reproduzieren!):** „Wann war der kälteste Zeitpunkt im Jahr 2025" lieferte **kein Diagramm und
keine Fehlermeldung**. Ursache zuerst belegen (s. §8), dann:

- Fehler/Hinweise müssen **im leeren Zustand und im Card-Zustand** (angedockte Leiste) **sichtbar** sein
  (aktuell evtl. nur im Hero). Einheitliche Fehler-Anzeige (Toast/Inline unter der Leiste).
- **Repräsentative Meldungen** je Fall:
  - Unmappbar / noch nicht unterstützt (z. B. Rekord-/Aggregat-Frage): „Diese Art Frage kann ich noch
    nicht beantworten — kommt in einer späteren Ausbaustufe." (Rekord-Antworten = spec-05.)
  - **Out-of-Scope** (Vorhersage/Radar/Fremddaten, siehe [`weather-use-cases.md`](../research/weather-use-cases.md) Teil 3):
    „Dazu habe ich keine Daten — ich kenne nur die Historie der eigenen Wetterstation."
  - Leeres Ergebnis trotz valider Spec: „Für diesen Zeitraum/diese Metrik liegen keine Daten vor."
  - Server-/LLM-Fehler: „Es gab ein Problem bei der Verarbeitung — bitte erneut versuchen."
- **Nie** ein stiller Leerzustand: jede Anfrage endet sichtbar als Card **oder** als Meldung.

---

## 8. Diagnose des „kältester 2025"-Bugs (vor dem Fix)

Zu reproduzieren und zu belegen (Playwright/curl gegen `/api/ask`). Wahrscheinliche Ursachen (eine davon):
- (a) Claude liefert `unmappable:true` → 422, aber die UI zeigt den Hinweis **nur im Hero**, nicht wenn
  schon Cards existieren → Fix: Fehleranzeige in allen Zuständen (§7).
- (b) Claude mappt es auf eine valide Spec mit leerem Ergebnis (z. B. falscher Zeitraum) → Card bleibt
  still leer → Fix: „keine Daten"-Zustand sichtbar machen.
- (c) Eine Exception im Render/Resolve wird verschluckt → Fix: Fehlergrenze + Logging.
Der konkrete Pfad bestimmt den Fix; Gate B-6 prüft das Ergebnis (sichtbare Meldung).

---

## 9. Neue / geänderte Dateien (Soll)

```
public/wappen.png                  # bereits hinzugefügt (Gemeinde-Wappen)
src/app/globals.css                # ÄNDERN: @theme Wappen-Tokens
src/app/layout.tsx                 # ÄNDERN: Header + Footer einbinden, Theme
src/app/page.tsx                   # ÄNDERN: Kennwert-Zeile + Freitext-Bereich + permanentes Dashboard
src/components/header.tsx          # NEU: Wappen + Titel
src/components/footer.tsx          # NEU
src/components/kennwerte-row.tsx   # NEU: 12 Pills/Mini-Cards (Icon+Label+Wert/Einheit, lucide-react), fetch /api/now
src/components/permanent-dashboard.tsx  # NEU: festes Grid der 10 Charts ("use client")
src/components/cards/skeleton-card.tsx  # NEU: Shimmer-Skeleton mit Query-Untertitel
src/lib/permanent-dashboard.ts     # NEU: die 10 vordefinierten ChartSpecs
src/app/api/now/route.ts           # NEU: latest-Werte je Kennwert (force-dynamic, server-only)
src/lib/flux.ts / influx.ts        # ggf. Helper für last()-je-Entity
src/components/dashboard-grid.tsx  # ÄNDERN: Skeleton beim Absenden, Fehleranzeige in allen Zuständen
src/lib/catalog.ts                 # ggf. Kompass-Kürzel-Helper für Windrichtung
package.json                       # ÄNDERN: + lucide-react (Icons für Kennwerte-Pills)
```

---

## 10. Bekannte Stolpersteine

1. **Wappen-Asset im Docker-Build:** `public/wappen.png` muss world-readable sein (chmod 644) und im
   Build-Context liegen (`.dockerignore` ignoriert `docs`, nicht `public`).
2. **Kennwerte-Performance:** `/api/now` als **eine** Flux-Query (`last()` gruppiert über die 12 Entities
   per Regex/Whitelist), nicht 12 Einzel-Queries.
3. **Permanente Charts vs. User-Grid:** getrenntes festes Grid (kein react-grid-layout) — nicht
   verschiebbar/persistiert; nur die User-Cards bleiben in `localStorage`.
4. **Theme/Tailwind v4:** `@theme`-Block in `globals.css`; keine `tailwind.config.js` nötig.
5. **Client-only:** Kennwerte/Charts client-seitig (`"use client"`), `localStorage`/Fetch erst nach Mount.
6. **Fehler-Sichtbarkeit:** zentrale Fehlerkomponente, in Hero **und** angedockter Leiste eingehängt.

---

## 11. Nicht-Ziele (in spätere Phasen)

- Neue Diagrammtypen / Custom-Series / **Zufallsfarben** / Smart-Variety-Auswahl → **spec-04**.
- Rekord-/Extrem-Antworten, Skalar-Aggregat, Count/Schwellwert, Jahr-Vergleich, `source.kind:'derived'`
  (GDD/HDD) → **spec-05**. (Hier nur sichtbare Fehlermeldung statt Antwort.)
- Zeitbereich-Tabs (24h/Woche/Monat/Jahr) für die festen Charts.
- Serverseitige Persistenz, Auth, Deployment.
