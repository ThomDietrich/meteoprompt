# Iteration spec-12 — Feed-Migration (rückwirkend) + neue Serien & Diagramm-Audit

> **Status:** 🚧 aktiv — 2026-07-05
>
> Dreiteilig: **(A)** die bereits durchgeführte Feed-Umstellung rückwirkend dokumentieren,
> **(B)** die vollständige neue Serien-Landschaft aufnehmen & kontextualisieren, **(C)** jedes
> bestehende Diagramm / jeden Use-Case gegen die neuen Serien auditieren und Verbesserungen
> priorisieren. Teil A ist umgesetzt & verifiziert; B/C sind hier als Scope + Erfolgskriterien
> festgelegt (Umsetzung folgt nach Review).

---

## A) Rückblick: Migration `weather_station_*` → `garten_ventus_w830_*` (✅ umgesetzt)

Der alte Feed (weewx-mqtt-Skin, `weather_station_*`, Publish pro LOOP ~16 s → Übersampling)
wurde **2026-07-05 ~12:10 UTC** abgeschaltet und gelöscht. Neuer kanonischer Feed:
**weewx-home-assistant-Extension** → `garten_ventus_w830_*` (deutsche Slugs), **1 Schreibvorgang
pro 5-min-Archiv-Record** → kein LOOP-Übersampling. ~4,6 Jahre Historie auf die neuen entity_ids
migriert.

**Was geändert wurde**
- `src/lib/catalog.ts`: `PREFIX = "garten_ventus_w830_"`; alle **29 Slugs** auf die deutschen
  Namen umgestellt (Handover Tabelle 3).
- **Evapotranspiration → Tages-Akkumulator** (Design-Entscheidung, bestätigt): `entityId =
  evapotranspiration_tag`, gelesen über `rainCounter` (`difference(nonNegative)+sum`) — exakt wie
  Regen. Grund: der neue `evapotranspiration_tag` ist ein **sauberer monotoner Tages-Akkumulator**
  (ersetzt den defekten alten `dayET`), und der Akkumulator-Weg ist immun gegen etwaige
  Oversampling-Bursts. Der frühere `dedupSum`-Sonderweg wurde damit **komplett entfernt**
  (catalog.ts + zwei Zweige in flux.ts: `buildSeriesFlux` + Scalar-Antwortpfad).
- `docs/data-quality-influxdb.md`: auf den einen neuen Feed umgeschrieben (Regen via `regen_tag`,
  ET via `evapotranspiration_tag`, Warnung vor eingefrorenen englischen Legacy-Slugs).

**Verifiziert**
- Gate: `typecheck` + `build` Exit 0 (keine DB nötig).
- Live (App-eigene Flux-Pfade gegen den neuen Feed): ET-`rainCounter`-Pfad über
  `evapotranspiration_tag` → 03.07. **3,51 mm**, 04.07. **2,84 mm**, heute **2,32 mm** — deckt
  sich exakt mit dem Akkumulator- Groundtruth und ignoriert korrekt einen einmaligen
  Oversampling-Burst am Umstelltag (18:00 UTC ≈ 50 Writes/h; Rohsumme hätte auf 2,371 überzählt).
  Temperatur-Mittel plausibel (Abendkurve 22,8 → 16,6 °C).
- Alle 29 Slugs + `evapotranspiration_tag` als existent bestätigt.

**Nebenbefund (dokumentieren, keine Aktion nötig):** Der neue Feed schreibt **on-change /
deadbanded** (HA zeichnet nur bei Zustandsänderung auf) — kurze Fenster können daher lückig sein
(z. B. Feuchte, Böenrichtung nachts). `mean/min/max` sind davon unberührt; nur naive Rohsummen
wären es (dafür lesen wir Mengen ohnehin aus Akkumulatoren).

---

## B) Neue Serien-Landschaft aufnehmen & kontextualisieren

Der neue Feed bietet mehr als nur umbenannte Serien: **neue** Serien, **korrigierte** (ET, Regen)
und zwei Feld-Typen — numerisch (`_field == "value"`) und **Zustand** (`_field == "state"`:
ISO-Zeiten, Enums, on/off).

### B0. Bereits korrigiert durch die Migration (Kontext)
- **ET:** alter `dayET` defekt (nicht-monoton) → neu `evapotranspiration_tag` sauber monoton.
- **Regen roh:** früher 3–4× überzählt (LOOP-Dups) → jetzt 1×/Intervall; Mengen weiter aus
  `regen_tag`-Akkumulator.
- **rain_1h / rain_24h** (`regen_stunde` / `regen_24h`): jetzt **serverseitig in WeeWX** aus der
  Archiv-DB berechnete rollierende Summen (robust).

### B1. Neue numerische Serien (`_field == "value"`) — Kandidaten für Katalog / Karten
| entity_id (`garten_ventus_w830_…`) | Einheit | Semantik | Zielverwendung |
|---|---|---|---|
| `regen_intervall` | mm | Regen pro 5-min-Intervall (summierbar, 1×/Intervall) | direkter Ersatz der Schauer-Rekonstruktion; sub-tägliche Regensummen |
| `regen_letzter_schauer` | mm | Menge des letzten Schauers (Ereignistrennung ≥ 6 h Trockenheit, stationsseitig) | KPI „letzter Schauer" |
| `regen_schauerdauer` | min | Dauer des (letzten) Schauers | Schauer-Tooltip / KPI |
| `trockenperiode` | d | Tage seit letztem Regen | **neuer KPI** „Trockenpause" (fehlt heute komplett) |
| `regen_woche` | mm | Wochenregen (Akkumulator) | direkter Wochenwert |
| `regen_monat` | mm | Monatsregen (Akkumulator) | ersetzt das Zusammensummieren in `perm-monatsregen` |
| `regendauer` | s | Regendauer im Intervall | optional, Detail |
| `sonnenscheindauer_tag` | h | Sonnenscheindauer heute (kumulativ) | **neue Karte + KPI** „Sonne heute" |
| `sonnenscheindauer` | s | Sonnenscheindauer pro Intervall | optional (Verlauf) |
| `aussentemperatur_tagesmaximum` | °C | Kalendertag-Höchsttemperatur | saubere Tages-Extremwerte (statt 18 h-Rolling) |
| `aussentemperatur_tagesminimum` | °C | Kalendertag-Tiefsttemperatur | ” |
| `evapotranspiration_tag` | mm | Tages-ET (monoton) | **bereits im Katalog** (Migration Teil A) |
| `evapotranspiration_intervall` | mm | ET pro Intervall | optional (sub-tägliche ET) |

### B2. Neue Zustands-Serien (`_field == "state"`) — bespoke, nicht generisch numerisch
Am Feed **live bestätigt** (Enumeration `_field == "state"`, -30 h): `regen_schauerbeginn`,
`regen_schauerende`, `aussentemperatur_tagesmaximum_zeitpunkt`,
`aussentemperatur_tagesminimum_zeitpunkt`, `windrichtung_himmelsrichtung`, `verbindung`,
`einheitensystem`.

| entity_id | Typ | Semantik | Zielverwendung |
|---|---|---|---|
| `regen_schauerbeginn` / `regen_schauerende` | ISO-Zeit | Beginn/Ende des letzten Schauers | Schauer-KPI/Tooltip (statt berechneter Start/Ende) |
| `aussentemperatur_tagesmaximum_zeitpunkt` / `_tagesminimum_zeitpunkt` | ISO-Zeit | Uhrzeit von Tageshoch/-tief | „Hoch um 14:20" direkt von der Station |
| `windrichtung_himmelsrichtung` | Enum | Windrichtung als Himmelsrichtung | optionaler Ersatz für `degreesToCompass()` |
| `verbindung` | on/off | Stations-Konnektivität (binary_sensor) | Daten-Frische-/„Station online"-Indikator |
| `einheitensystem` | Enum | metrisch/imperial (Konfig, kein Wetter) | **ignorieren** |

> **Katalog-Modell-Implikation (Entscheidung E2):** Der Katalog nimmt heute nur numerische
> `_field == "value"`-Serien an. Zustands-Serien (ISO-Zeit / Enum / on-off) brauchen entweder eine
> **Modell-Erweiterung** (neuer Feld-/Reihentyp) **oder** werden nur in **bespoke Resolvern**
> (Kennwerte, Schauer-KPI) konsumiert, nicht im generischen Chart-Katalog. Empfehlung: bespoke
> (kleinerer Eingriff), generisches Modell nur falls mehrere Charts sie brauchen.

### B3. Verifikationsstatus der neuen Serien — ✅ alle live bestätigt (2026-07-05)
- ✅ **Zustands-Serien** (B2): per `_field == "state"`-Enumeration als existent bestätigt.
- ✅ `regen_intervall`, `evapotranspiration_tag`, `evapotranspiration_intervall`: live bestätigt
  (Counts + Tagessummen; ET-Tagessummen 03.–05.07. = 3,51 / 2,84 / 2,32 mm).
- ✅ **Übrige numerische B1-Serien** per Einzel-`last()` bestätigt (Stichprobenwerte, Stand
  ~11:40–13:15 UTC 2026-07-05 — diese Akkumulatoren/Event-Serien schreiben tages-/ereignisweise):

  | Serie | letzter Wert | Serie | letzter Wert |
  |---|--:|---|--:|
  | `trockenperiode` | 4,3 d | `regen_letzter_schauer` | 29,21 mm |
  | `regen_monat` | 29,21 mm | `regen_schauerdauer` | 310 min |
  | `regen_woche` | 0 mm | `sonnenscheindauer_tag` | 0,65 h |
  | `aussentemperatur_tagesmaximum` | 23,85 °C | `sonnenscheindauer` | 0 s |
  | `aussentemperatur_tagesminimum` | 16,04 °C | `regendauer` | 0 s |

  **Plausibilität (in sich konsistent):** `regen_letzter_schauer` 29,21 mm = `regen_monat` 29,21 mm
  bei `regen_woche` 0 mm und `trockenperiode` 4,3 d → ein großes Regenereignis (Dauer 310 min)
  früher im Monat, seither trocken. Bestätigt zugleich, dass die neuen Regen-/Schauer-Serien
  physikalisch kohärent sind.

> **Query-Hinweis:** Direkt nach dem InfluxDB-Neustart am 2026-07-05 waren **breite** Prefix-Scans
> (-8 h/-24 h/-2 d) instabil (Timeouts); **enge Einzel-Serien-`last()`** liefen zuverlässig. Für
> künftige Verifikation daher pro Serie einzeln prüfen:
> `range(-3d) |> filter(entity_id == "…" and _field == "value") |> last()`.

---

## C) Diagramm- & Use-Case-Audit gegen die neuen Serien

Bestand (aus Code-Inventur): **16 Chart-Typen**, **16 Dashboard-Karten** (5 Gruppen),
**12 Kennwerte**, **8 NL-Use-Cases**, **13 Spezial-Flux-Pfade**. Für jeden Bereich geprüft, ob eine
neue Serie ihn **direkter, korrekter oder reicher** macht.

| # | Bereich (heute) | Heutige Umsetzung | Neue Serie(n) | Verbesserung | Prio |
|---|---|---|---|---|---|
| 1 | **Regen pro Schauer** (`perm-shower`, `showerBars`, NL-Intent) | `regen_tag` → `difference(nonNegative)`+`filter>0` → In-App-Sessionisierung (`shower.ts`, MIT 4 h) + Peak-Rate-Clamp | `regen_intervall`, `regen_schauerbeginn/-ende`, `regen_schauerdauer`, `regen_letzter_schauer`, `trockenperiode` | Umweg auflösen (siehe **D**) | **P1** |
| 2 | **Trockenperiode** (existiert nicht) | — | `trockenperiode` | **neuer KPI** „seit N Tagen kein Regen" | **P1** |
| 3 | **Sonnenscheindauer** (existiert nicht; nur `solar_radiation` W/m²) | — | `sonnenscheindauer_tag` (+ `sonnenscheindauer`) | **neue Karte** (Tages-Bars) + KPI „Sonne heute: X h" | **P1** |
| 4 | **Tages-Extremwerte** Temp (Kennwert-Sekundär `todayMinMax`; Cards `candlestick`/`rangeBand`) | today-scoped `min()`/`max()` + separate Zeit-Queries; `outdoor_temp_18h_max/min` sind 18 h-Rolling | `aussentemperatur_tagesmaximum/-minimum` + `_zeitpunkt` | Kalendertag-Extrema **direkt** inkl. Uhrzeit (statt Rolling/berechnet); spart Queries | **P2** |
| 5 | **Monatsregen** (`perm-monatsregen`, bars `rainfall` 1mo) | Tagesmengen zu Monaten summiert | `regen_monat` (+ `regen_woche`) | nativer Monats-/Wochen-Akkumulator → direkter & robuster | **P2** |
| 6 | **Windrichtung-Kompass** (Kennwert 7) | `degreesToCompass()` aus Grad berechnet | `windrichtung_himmelsrichtung` (Enum) | optional Stations-Enum statt Rechnung (evtl. 16-Punkt) | P3 |
| 7 | **Stations-Health** (existiert nicht) | — | `verbindung` (on/off) | Daten-Frische-/„Station online"-Badge | P3 |
| 8 | **NL „wärmster/kältester Moment heute"** | `extremeEnvelope` (mehrstufiger Scan) | `aussentemperatur_tagesmaximum` + `_zeitpunkt` | Für den **Heute**-Fall Shortcut → billiger als Envelope-Scan | P3 |
| 9 | **Sub-tägliche ET** (nur Tages-ET via `evapotranspiration_tag`) | — | `evapotranspiration_intervall` | optional, falls je feiner gebraucht | P3 |

**Unverändert korrekt (kein Handlungsbedarf):** die restlichen Chart-Typen (line/bars/scatter/
heatmaps/boxplot/violin/radar/themeRiver/gauge/candlestick), Windrose (Client-Binning), Gradtage,
Vergleichs-Overlay, adaptives Downsampling, Wetterlage-Narrativ.

---

## D) Schwerpunkt: Regenschauer-Neubau

**Heutiger Umweg** (`buildRainIncrementsFlux` flux.ts + `shower.ts`): der Tages-Akkumulator
`regen_tag` wird per `difference(nonNegative)` in Increments zurückgerechnet, in-App über eine
4 h-Trockenlücke (MIT) zu Events gruppiert; dazu Kompensations-Hacks — `group(entity_id)` gegen
Shard-Grenzen, `MIN_INTERVAL_H`-Clamp gegen Oversampling, First-Reading-Peak = 0. Kein
Trockenperioden-Output. Bespoke `showers`-Shape über 5 Dateien. Recompute über -90 d bei **jedem**
Laden.

**Direkte Ersetzung durch neue Serien**
- `regen_intervall` (mm/Intervall, summierbar) → ersetzt die **gesamte** Flux-Rekonstruktion:
  kein `difference/nonNegative`, kein `filter>0`, kein Shard-`group`, kein Peak-Clamp (es ist
  bereits eine mm-pro-fixem-Intervall-Rate).
- `regen_schauerbeginn` / `regen_schauerende` (ISO) → Start/Ende **von der Station** statt
  berechnet.
- `regen_schauerdauer` (min) → Dauer direkt.
- `regen_letzter_schauer` (mm) → Menge des letzten Schauers direkt (KPI/letzter Balken).
- `trockenperiode` (d) → **neuer** Trockenpausen-Output, den es heute nicht gibt.

**Entscheidung E1 (Design):** Die Stations-Schauer-Serien liefern nur den **letzten/aktuellen**
Schauer mit **fixer** Ereignistrennung (≥ 6 h). Der heutige `showerBars` kann eine **konfigurierbare
MIT** über ein **beliebiges historisches Fenster** (-90 d, „mit 6 h Pause"). Optionen:
- **(a) Hybrid (empfohlen):** KPI „letzter Schauer" + „Trockenperiode" aus den Stations-Serien
  (direkt, billig); den historischen `showerBars` behalten, aber auf `regen_intervall` umstellen
  (Summe pro Intervall statt Akkumulator-Diff) → Hacks fallen weg, Konfigurierbarkeit bleibt.
- **(b) Voll-Station:** `showerBars` ganz durch die Stations-Ereignisse ersetzen → maximal
  einfach, aber verliert freie MIT + lange Historie.

---

## E) Entscheidungen — ✅ bestätigt 2026-07-06
1. **E1 — Schauer: umgesetzt, evidenzbasiert angepasst.** Stations-Serien für KPI **„Letzter
   Schauer"** (Menge `regen_letzter_schauer` + Beginn/Ende `regen_schauerbeginn/-ende` via
   `_field=="state"` + Dauer `regen_schauerdauer`) und **„Trockenperiode"** gebaut (neuer
   `_field=="state"`-Lesepfad `runFluxEntityStateRows` + Kennwert-Aggregation `lastShower`).
   **Chart-Umbau verworfen:** Live-Verifikation zeigte `regen_intervall` historisch **~29×
   überabgetastet** (8706 Pkt/Tag Mai 2026, wie ET-Intervall) → naive Summe überzählt; die
   bestehende `showerBars`-Variante auf `regen_tag` (Akkumulator-Differenz) ist bereits
   robust/korrekt und **bleibt unverändert** (die „Hacks" sind inhärent für sub-tägliche Events
   aus einem Tagesakkumulator, kein Bug).
2. **E2 — Zustands-Serien: bespoke Resolver.** ISO-Zeit/Enum/on-off werden in Kennwerte-/Schauer-
   Resolvern konsumiert, **nicht** ins generische numerische Chart-Katalog-Modell gezwungen.
3. **E3 — Scope: spec-12 = neue numerische Serien im Katalog + P1** (Trockenperiode-KPI,
   Sonnenscheindauer-Karte/KPI, Schauer-Hybrid). P2/P3 als Folge-Iteration (spec-13).
4. **E4 — Tages-Extrema: neue Keys aufnehmen, 18 h-Serien parallel behalten** (nicht ersetzen):
   `aussentemperatur_tagesmaximum/-minimum` (+ `_zeitpunkt`) liefern **exakte Kalendertag-Extrema
   mit Uhrzeit**, haben aber erst tageweise Historie; `…_maximum_18h/_minimum_18h` bleiben für
   Rückblick/andere Semantik erhalten.

---

## G) Chart-Ideen aus den neuen Serien + Quell-Wunschliste

### G0. Historie-Realität (live geprüft 2026-07-05/06)
- **Kern-Messserien** (temp, `regen_tag`, feuchte, wind, druck, strahlung): volle **~4,6 J.**
  (z. B. `regen_tag` & `aussentemperatur` liefern Jan 2022). → mehrjährige Charts sofort möglich.
- `evapotranspiration_intervall`: Historie ~ab 2024, aber **historisch überabgetastet**
  (5744 Pkt/Tag @ 2024-07 = altes LOOP-Oversampling → für Alt-Daten weiter 5m-dedup nötig; vorwärts
  sauber 1×/5 min).
- **Neue abgeleitete Serien** (`sonnenscheindauer_tag`, `trockenperiode`, `evapotranspiration_tag`,
  `aussentemperatur_tagesmaximum/-minimum`, Schauer-Serien): **erst ~ab Anfang Juli 2026**, kein
  Backfill → Charts darauf **starten jetzt und reifen** über Wochen/Saison.

### G1. Chart-Ideen (Vorschlag)
| Idee | Serien | Chart | Historie | Prio |
|---|---|---|---|---|
| **Klimatische Wasserbilanz** (Niederschlag − Verdunstung, kumulativ/Monat) | `regen_tag` − `evapotranspiration_tag` (vorwärts) / `…_intervall`+dedup (Alt) | `bars` divergierend / `line` kumulativ | Regen voll; ET jung → „laufende Saison" jetzt, mehrjährig via intervall+dedup | ⭐ P1 |
| **Sonnenstunden/Tag** (+ später Jahres-Kalender-Heatmap) | `sonnenscheindauer_tag` | `bars`, später `heatmapCalendar` | reift ab Juli 2026 | P1 |
| **Trockenperioden-Verlauf** (Sägezahn: Aufbau + Reset bei Regen) | `trockenperiode` | `line` + KPI | reift | P1 |
| **Schauer-Log** (Beginn/Ende/Dauer/Menge direkt) | `regen_schauer*`, `regen_letzter_schauer` | `table` / `showerBars` (Hybrid) | Ereignis-basiert | P1 (= E1) |
| **Tageskorridor mit echten Extrema + Uhrzeit** | `aussentemperatur_tagesmaximum/-minimum` (+ `_zeitpunkt`) | `rangeBand`/`barRange` | jung; für Rückblick raw-`candlestick` bleibt | P2 |
| **Verdunstung vs. Sonne** (physik. Kopplung) | `evapotranspiration_tag` × `sonnenscheindauer_tag`/`solar_radiation` | `scatter` | jung | P3 |

### G2. Quell-Wunschliste (WeeWX/HA — Vorverarbeitung, die an der Quelle günstiger ist)
1. **⭐ WeeWX Tages-Statistik mit voller Historie** (`archive_day_*`: min/max/avg pro Tag für
   outTemp, wind, gust, pressure, humidity …). Löst **zwei** Probleme auf einmal: (a) das
   5-Jahres-Query-Timeout (spec-11) — vor-aggregierte Tageswerte sind winzig & schnell; (b)
   **echte mehrjährige Klimatologie** (Jahresvergleich, Monatsnormalen, Rekorde), die die
   vorwärts-only HA-`tages*`-Serien nicht können. WeeWX führt diese Tabellen bereits.
2. **Tages-Böenmaximum + Zeitpunkt** (`boengeschwindigkeit_tagesmaximum` + `_zeitpunkt`) — Sturm-Log,
   symmetrisch zu den Temp-Extrema; fehlt aktuell.
3. **Sonnenschein-Kontext**: astronomisch mögliche Sonnenstunden / Tageslänge (WeeWX-Almanach) →
   Sonnenschein als **% des Möglichen** statt nur Rohstunden (aussagekräftiger).
4. *(optional, ableitbar)* vorberechnete `wasserbilanz_tag` (Regen−ET) bzw. dayET-Backfill — niedrige
   Prio, da client-/serverseitig herleitbar.


- **Gate A (immer):** `docker compose run --rm web npm run typecheck` **und** `… npm run build`
  enden mit **Exit 0**; kein DB-Zugriff im Build.
- **Gate B (Daten, enge Queries):** jede neu aufgenommene Serie vor dem Verdrahten mit
  `range(-3h…-7d) |> filter(entity_id == "…" and _field == "value"/"state") |> last()` als
  **existent + plausibel** bestätigt (Bucket ~29,8 k Entities → nie breit scannen).
- **Gate B je Verbesserung (Beispiele):**
  - Trockenperiode-KPI zeigt `trockenperiode`-Wert, gegen `regen_tag`-Historie plausibel.
  - Sonnenscheindauer-Karte: Tagessumme `sonnenscheindauer_tag` plausibel vs. `solar_radiation`.
  - Schauer-Neubau: Event-Summen/-Zeiten stimmen mit den Stations-Schauer-Serien überein; keine
    Regression an `perm-shower` / NL-Intent.
- **Keine Regression:** bestehende 16 Karten, 12 Kennwerte, NL-Pfade unverändert grün.

> Konvention: nur committen, wenn ausdrücklich verlangt. Diese Spec ist **aktiv**; Teil A ist
> abgeschlossen und wird beim Commit der Migration referenziert.
