# Iteration spec-07 — Gruppiertes Stations-Dashboard mit statischen Erklärungen

> **Status:** ✅ abgeschlossen `2c613e5` — 2026-06-28.

## Ziel
Die bisher **13 losen** Charts des permanenten „Stations-Dashboards" werden in **5
thematische Gruppen-Karten** zusammengefasst. Jede Karte zeigt ihre Graphen in einem
**responsiven Sub-Grid** (Desktop 2 pro Reihe, mobil 1) und **unter jedem Graphen einen
kurzen, statischen Erklärsatz** (kein LLM): worauf achten, wie der Verlauf zu lesen ist,
knapp + actionable. Zusätzlich wird die **Chart-Auswahl** an typische „historisches
Wetter"-Fragen angepasst (eine Lücke geschlossen, ein schwaches Chart ersetzt).

Betrifft **nur** das feste Dashboard (`PERMANENT_CHARTS` / `PermanentDashboard`). Such-Cards,
Pinning, Kennwerte-Zeile, Overview bleiben unberührt.

## Chart-Set (Coverage-Entscheidungen)
- **Entfernen:** Regenrate (24h) — meist flach/leer, wenig Dauer-Mehrwert.
- **Neu:** **Monatsregen (12 Monate)** — schließt die größte Lücke (saisonaler/jährlicher
  Regen; bisher nur 30-Tage-Regen).
- **Neu:** **Behaglichkeit (7 T)** — gefühlte vs. echte Temperatur + Taupunkt; beantwortet
  „wie schwül/drückend war es?".
- **Neu:** **UV-Index (7 T)** — tägliche UV-Spitzen.
- **Neu:** **Regen pro Schauer (90 T)** — Regenmenge je zusammenhängendem Regen-Event
  (Shower), nicht pro Stunde/Tag; Trennung über eine Trockenpause ≥ **4 h** (MIT).

Netto: 13 − 1 + 4 = **16 Charts**.

## Gruppierung (5 Karten)
1. **Temperatur** — Band & Mittel (24h) · Tages-Spanne (30 T) · Tagesgang Std×Wochentag (30 T) · Jahres-Heatmap (365 T)
2. **Feuchte & Behaglichkeit** — Luftfeuchte (24h) · Temperatur×Luftfeuchte (7 T) · Behaglichkeit (7 T, neu)
3. **Niederschlag & Verdunstung** — Tagesregen (30 T) · Monatsregen (12 Mon, neu) · Regen pro Schauer (90 T, neu) · Evapotranspiration (30 T)
4. **Wind** — Windrose (7 T) · Wind & Böen (24h)
5. **Sonne, UV & Luftdruck** — Sonnenstrahlung (24h) · UV-Index (7 T, neu) · Luftdruck (24h)

## Neue ChartSpecs (Daten)
- **Monatsregen:** `rainfall` (Akkumulator, `rainCounter`), Summe je **Kalendermonat**
  (`window: "1mo"`, TZ Europe/Berlin), `chart: "bars"`, `timeRange -365d…now`. ⚠️ Gegen die
  echte DB verifizieren, dass die `rainCounter`-Pipeline (difference(nonNegative)+sum) über
  ein **1mo**-Fenster korrekte Monatssummen liefert (plausibel vs. Tagesregen-Summen).
- **Behaglichkeit:** `chart: "line"`, `-7d…now`, 3 Serien `mean 1h`:
  `apparent_temperature` (gefühlt), `outdoor_temperature` (echt), `dew_point` (Taupunkt).
- **UV-Index:** `uv_index`, `chart: "line"`, `-7d…now`, `max 1h` (tägliche Spitzen).
- TERMINAL_SORT gilt für jede neue/angepasste Flux-Query.

### Regen pro Schauer (Shower-Sessionization) — neue Logik
**Definition:** ein „Schauer"/Regen-Event ist eine zusammenhängende Regenphase, getrennt durch
eine **Trockenpause ≥ MIT = 4 h** (*Minimum Inter-event Time*; benannte, konfigurierbare
Konstante, z. B. `SHOWER_MIT_HOURS = 4`). MIT ist der Hydrologie-Standard zur Event-Trennung.

**Hybrid — Flux holt, App gruppiert** (passt zur bestehenden „Flux holt, App shaped"-Architektur):
- *Flux:* die **Regen-Inkremente** der `dayrain`-Akkumulator-Reihe in Archiv-Auflösung —
  `difference(nonNegative: true)` (behandelt Mitternachts-Reset + HA-Oversampling: gleiche
  Werte → Diff 0), `filter(_value > 0)` (nur nasse Messungen), **TERMINAL_SORT**. Liefert
  zeitsortierte `{ t, mm }` (kein `aggregateWindow`/`sum`). Range `-90d…now`.
- *App:* neue, unit-getestete Funktion (z. B. `src/lib/shower.ts` →
  `groupShowers(points, mitHours = 4)`): über die zeitsortierten Inkremente laufen; ist die
  Lücke zur letzten nassen Messung `> MIT`, ein neues Event öffnen. Je Event: `start`, `end`,
  `durationH`, `totalMm` (Σ Inkremente), `peakRateMmH` (max Inkrement → mm/h skaliert).
- *Darstellung:* **Balken je Event** — ein Balken pro Schauer, Höhe = `totalMm`, x = Start
  (Datum/Uhrzeit auf **Kategorie**-Achse, da diskrete Events), **Tooltip:** Start–Ende, Dauer,
  Summe, Spitzenrate. Umsetzung bevorzugt die bestehende Bars-Komponente mit Kategorie-x +
  Custom-Tooltip (oder eine schlanke neue Variante). Neue Datenform `showers` (Event-Liste)
  analog zu den `shaped`-Typen.
- ⚠️ **Verifizieren:** an einem bekannten Regen-Event prüfen, dass `totalMm` plausibel ist und
  mit der Tagesregen-Summe über denselben Zeitraum zusammenpasst; MIT-Grenze testen (zwei
  Phasen mit 3 h Pause = ein Event, mit 5 h Pause = zwei).

### Auch über den freien Prompt zugänglich (Sonderlogik)
Der Shower-Modus ist **nicht nur** ein festes Chart, sondern ein **eigener Chart-Typ/Intent**,
den Claude aus der natürlichen Anfrage erkennt:
- **Trigger-Wörter:** „pro Schauer / je Schauer / pro Regenfall / pro Regen-Event /
  Regenschauer / shower / rain event" → QuerySpec mit neuem `chart: "showerBars"` (in
  `ChartType` + `IMPLEMENTED_CHART_TYPES`) auf der `rainfall`-Metrik. Optionales MIT aus der
  Anfrage („… mit 6 h Pause") übernehmen, sonst Default **4 h**.
- **Claude-Regel** (`src/lib/claude.ts` + System-Prompt): diese Wörter → `showerBars`;
  normale Regen-Anfragen bleiben `bars`/Tagesregen. Synonyme dokumentieren.
- **Resolution** (`/api/ask` **und** `/api/chart`): bei `showerBars` dieselbe
  `groupShowers`-Sessionization wie das feste Chart anwenden → Event-Balken. Identische Logik
  für feste Karte UND NL-Card (das feste Chart nutzt intern denselben Typ).
- **Begleittext (A):** `computeSummaryStats` / `shapedValues` um die `showers`-Form erweitern
  (Werte = `totalMm` je Event + Start-Zeitpunkte), damit die NL-Card einen korrekten Summary
  bekommt (z. B. „stärkster Schauer 22 mm am 13.10.2020 über rund 9 h").

## Statische Captions (Source of Truth — 1 Satz je Graph, immer sichtbar)
**Temperatur**
1. Band & Mittel: „Stundenmittel (Linie) mit Schwankungsband; breites Band = wechselhafte/klare Luft, schmales = ausgeglichen/bedeckt."
2. Tages-Spanne: „Jede Kerze = ein Tag, die Länge zeigt den Abstand Tageshöchst ↔ Nachttief — lange Kerzen = klare, trockene Luft, kurze = bedeckt/feucht."
3. Tagesgang: „Durchschnittstemperatur nach Uhrzeit (Zeile) und Wochentag (Spalte) — so siehst du den typischen Tagesgang: warm am Nachmittag, kühl vor Sonnenaufgang."
4. Jahres-Heatmap: „Jeder Tag des Jahres ein Feld, wärmer = röter — zeigt den Jahresverlauf und ungewöhnlich warme/kalte Tage auf einen Blick."

**Feuchte & Behaglichkeit**
5. Luftfeuchte: „Relative Luftfeuchte im Tagesverlauf — nachts meist hoch, nachmittags niedriger; dauerhaft über 90 % = feucht/Nebelgefahr, unter 30 % = sehr trocken."
6. Temp×Feuchte: „Jeder Punkt = eine Stunde; typisch ist heiß ↔ trocken (rechts unten). Punkte rechts oben (heiß UND feucht) bedeuten schwül/drückend."
7. Behaglichkeit: „Klaffen gefühlte und echte Temperatur auseinander, ist es schwül (Sommer) oder windkalt (Winter); ein Taupunkt über ~16 °C wirkt auf die meisten drückend."

**Niederschlag & Verdunstung**
8. Tagesregen: „Regenmenge pro Tag — hohe Balken = Starkregen-Tage, viele leere Tage = Trockenphase."
9. Monatsregen: „Regensumme pro Monat im Jahresverlauf — zeigt nasse vs. trockene Monate und ob ein Monat über/unter dem üblichen Niveau liegt."
10. Regen pro Schauer: „Jeder Balken = ein zusammenhängender Regenschauer (durch ≥ 4 h Trockenheit getrennt), Höhe = Gesamtmenge — so siehst du, wie ergiebig einzelne Regenfälle waren, unabhängig vom Kalendertag."
11. Evapotranspiration: „Verdunstung pro Tag (Boden + Pflanzen) — hohe Werte bei wenig Regen bedeuten Trockenstress; nützlich fürs Gießen."

**Wind**
12. Windrose: „Aus welcher Richtung der Wind kam — längere Arme = häufiger, wärmere Farbe = stärker; dominante SW-Arme = typische Westwetterlage, plötzliches Drehen kündigt oft einen Wetterwechsel an."
13. Wind & Böen: „Mittlerer Wind (Linie) und Spitzenböen — eine große Lücke zwischen beiden = böig/wechselhaft, gleichmäßig = stabile Lage."

**Sonne, UV & Luftdruck**
14. Sonnenstrahlung: „Sonnenenergie im Tagesverlauf (Glocke mittags) — glatte Kurve = wolkenlos, zackige = durchziehende Wolken."
15. UV-Index: „Tägliche UV-Spitze (mittags) — ab 3 Sonnenschutz, ab 6 hoch, ab 8 sehr hoch; zeigt, wann die UV-Belastung kritisch war."
16. Luftdruck: „Fallender Druck = Tief/Schlechtwetter im Anmarsch, steigender = Beruhigung/Hochdruck; schnelle Änderungen bedeuten windiges Wetter."

## Datenmodell & Rendering
- **Config:** `PERMANENT_GROUPS` (in `src/lib/permanent-dashboard.ts`): geordnetes Array von
  `{ id, title, charts: { spec: ChartSpec; caption: string }[] }`. Ersetzt das flache
  `PERMANENT_CHARTS` (oder leitet sich daraus ab). Captions als statische Strings hier.
- **`PermanentDashboard`:** rendert die Gruppen als **vertikal gestapelte, volle-Breite
  Gruppen-Karten** (eine `Card` je Gruppe mit `CardTitle` = Gruppentitel). Innen ein
  **Sub-Grid** `grid-cols-1 md:grid-cols-2 gap-…` aus Graph-Blöcken; jeder Block = der Chart
  (bestehende Lade-/Resize-/Empty-/Error-Logik je Graph beibehalten, nur ohne eigene äußere
  Card) + darunter die Caption (`text-sm text-slate-…`, immer sichtbar).
- **Mobil:** Sub-Grid kollabiert auf 1 Spalte; Graphen + Captions stapeln sauber; keine feste
  Höhe, die mobil overflowt; ECharts reflowt per ResizeObserver (wie bisher).
- Jeder Graph lädt weiterhin einzeln über `/api/chart` (kein Claude). Kuratierte
  Wappen-Farben bleiben.

## Verifikations-Gate
**Gate A** (secret-frei): `typecheck` + `build` → beide Exit 0 (`.next` vorher leeren).

**Gate B** (Playwright + Live):
- **5 Gruppen-Karten** mit korrekten Titeln; **16 Graphen** insgesamt, korrekt verteilt;
  Regenrate ist **weg**, Monatsregen/Behaglichkeit/UV/Regen-pro-Schauer **vorhanden** und laden
  Daten (kein Error/Empty bei vorhandenen Daten).
- **Monatsregen** plausibel (Monatssummen ≈ Summe der Tagesregen des Monats; nicht 0/None).
- **Regen pro Schauer:** ein Balken je Event; `totalMm` plausibel + konsistent mit dem
  Tagesregen über denselben Zeitraum; Tooltip zeigt Start–Ende/Dauer/Spitzenrate; MIT-Grenze
  greift (3 h Pause = ein Event, 5 h Pause = zwei).
- **Freier Prompt:** „Regen pro Schauer der letzten Wochen" → `showerBars`-Card mit
  Event-Balken **und** korrektem Begleittext; eine normale Regen-Anfrage bleibt Tagesregen.
- **Caption** unter **jedem** der 16 Graphen sichtbar.
- **Responsive:** Desktop 2 Graphen/Reihe je Karte; bei schmaler Breite (~390 px) 1 Spalte,
  kein horizontaler Scroll, keine überlappenden/abgeschnittenen Graphen.
- **Keine Regression:** Kennwerte-Zeile + Overview, Such-Cards, Pinning, Iteration 1–6.

## Entscheidungen (festgelegt, aus dem Interview)
1. Gruppierung: **5 Karten** (Sonne+UV+Druck zusammen).
2. Layout je Karte: **responsives Sub-Grid** (Desktop 2/Reihe, mobil 1), Caption je Graph.
3. Coverage: **alle vier** Änderungen (Monatsregen, Behaglichkeit, UV ergänzen; Regenrate entfernen).
4. Erklärtexte: **immer sichtbar, kurz** (1 Satz), statisch.
5. Regen pro Schauer: **MIT = 4 h** (konfigurierbar), **Balken je Event**, in spec-07 integriert
   (16. Chart) **und** über den freien Prompt als `showerBars`-Intent zugänglich.
