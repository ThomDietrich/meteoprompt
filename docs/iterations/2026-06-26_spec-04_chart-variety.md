# Iteration 3 — Diagramm-Vielfalt + Farben + Smart Variety („Vielfalt")

> **Status:** ✅ abgeschlossen — Commit `5018eab` (2026-06-27). Gate A grün + Gate B
> per Playwright verifiziert: 14 Diagrammtypen, Smart-Variety, Zufallsfarben (Wappen),
> „Neu erstellen", **+ Zeitzonen-Fix** (Europe/Berlin) **+ gebrandetes UI** (Fraunces-Header,
> rundere Pills, größere Auto-Grow-Suchleiste). Phase 2 von 3:
> 03 „Rahmen" (✅ `b14cf22`) → **04 „Vielfalt"** (dieses Doc) → 05 „Intelligenz".
> Erbt alles aus Iteration 2/03. Quelle: [`docs/research/echarts-chart-catalog.md`](../research/echarts-chart-catalog.md).

---

## 1. Ziel (Scope dieser Phase)

Mehr **visuelle Vielfalt** auf dem Dashboard — neue ECharts-Diagrammtypen (built-in + Apache-2.0
Custom-Series), **zufällige Farbe pro Serie** aus der Wappen-Palette, und eine **„Smart-Variety"-
Auswahl**: Claude bekommt zu jedem Diagrammtyp eine **Eignungs-Einschätzung** und wählt aus den
**gut passenden** Typen **gewichtet-zufällig** (perfekt passend = höher, „passt auch" = geringer).
Zusätzlich: die neuen Typen **auch in die 10 festen Charts** bringen (heute fast überall Linie).
Und pro Card ein **„Neu erstellen"-Button**, der Diagrammtyp/Farben neu würfeln lässt, bis die
Kombination gefällt (§5b).

Bewusst **nicht** hier: inhaltliche Antwort auf Rekord-/Aggregat-/Vergleichs-Queries + `derived`
(→ spec-05). Hier wählt Claude weiterhin Metrik+Zeitraum wie gehabt — nur die **Typ-Vielfalt** wächst.

---

## 2. Erfolgskriterien (Verification Gate)

### Gate A
```bash
docker compose run --rm web npm run typecheck
docker compose run --rm web npm run build
```
Beide exit 0. Custom-Series-Pakete sauber installiert; Build ohne DB/Anthropic.

### Gate B (Playwright + Keys)
1. **Neue Renderer** funktionieren mit echten Daten: je ein Beispiel pro neuem Typ rendert korrekt
   (Canvas gefüllt, kein Crash) — über NL-Query und/oder permanenten Chart.
2. **Smart Variety:** Mehrere unterschiedliche Queries erzeugen **unterschiedliche** Diagrammtypen
   (nicht immer line); der gewählte Typ **passt** zur Frage (z. B. „Temperaturspanne pro Tag" → candlestick/Band, „Temperatur vs. Luftfeuchte" → scatter, „wie warm ist es gerade" → gauge). Über mehrere identische Re-Queries variiert der Typ gelegentlich (gewichtet-zufällig).
3. **Zufallsfarben:** Serienfarben stammen aus der **Wappen-Palette**, variieren pro Serie/Card, sind **innerhalb einer Card unterscheidbar** und **stabil über Reload** (persistiert, nicht bei jedem Render neu).
4. **Feste Charts mit Varianz:** die 10 permanenten Charts nutzen jetzt **mehrere** Typen (mind. candlestick/Band + 1 Heatmap zusätzlich zu line/bars/windrose).
5. **Bestehendes** (Iteration 2/03) bleibt intakt: NL→Card, Persistenz, Löschen, Kennwerte, Skeleton, Fehler, Rahmen.
6. **Fehlerpfad:** ein Diagrammtyp, der nicht zur Datenform passt (z. B. scatter mit nur 1 Metrik), führt zu einer sauberen Meldung statt Crash.
7. **„Neu erstellen":** Button neben dem Löschen; Klick ersetzt die User-Card am **selben Slot** durch eine neue Typ/Farb-Kombination (Skeleton während des Ladens), Position/Größe bleibt; mehrfach wiederholbar liefert (gelegentlich) andere Typen.

---

## 3. Neuer Diagramm-Katalog (mit Eignungs-Zuordnung)

Jeder Typ trägt eine **Eignung** (`fitsFor`) — diese Liste geht in den Claude-System-Prompt und steuert
die Smart-Variety-Wahl. Datenform-Details in §6/§7.

### Core-Set (in dieser Phase implementiert)

| chart | Quelle | Datenform | **Eignung (`fitsFor`)** | Aufwand |
|---|---|---|---|---|
| `line` | built-in (vorhanden) | `[t,v]` ×N | Verlauf beliebiger Momentan-Metrik über Zeit (Temp/Feuchte/Druck/Solar) | – |
| `bars` | built-in (vorhanden) | `[t,v]` Buckets | Mengen/Summen je Periode (Tagesregen, Windweg) | – |
| `windrose` | built-in (vorhanden) | Richtung+Stärke | Windrichtungs-Verteilung | – |
| **`candlestick`** | built-in | Tag `[open,close,low,high]` aus min/max | **Tages-Temperaturspanne** über Wochen/Monate (Min↔Max + Schwankung) | low |
| **`rangeBand`** | `@echarts-x/custom-line-range` | `[t,low,high]` | **Min/Max-Hüllkurve „Sonnendiagramm"** (Temp-Band über Zeit) | low |
| **`scatter`** | built-in | `[x,y]` aus 2 Metriken | **Korrelation zweier Metriken** (Temp×Feuchte, Solar×Temp) | low |
| **`heatmapCalendar`** | built-in (`calendar`) | `[date,value]` (täglich) | **Jahres-/Langzeit-Überblick** eines Tageswerts (Temp, Regen) | low-med |
| **`heatmapHourDay`** | built-in | `[stunde, wochentag, wert]` | **Tagesgang-Muster** (Ø je Stunde×Wochentag) — Diurnal | med |
| **`gauge`** | built-in | Einzelwert (latest) | **„Live jetzt"** / einzelner aktueller Wert (akt. Temp/UV/Feuchte) | low |

### Erweitert (ebenfalls in v4 — „alle sinnvollen", Nutzer-Entscheid 2026-06-27)

| chart | Quelle | **Eignung (`fitsFor`)** | Aufwand |
|---|---|---|---|
| **`boxplot`** | built-in (`dataset transform`) | Verteilung/Streuung je Monat/Woche (Temp, Wind) | med |
| **`radar`** | built-in | Mehrdim. Tages-/Wochen-Summary über 5–6 Achsen (vs. Normal) | med |
| **`violin`** | `@echarts-x/custom-violin` | Verteilungsform je Periode (Schiefe/Bimodalität) | med |
| **`barRange`** | `@echarts-x/custom-bar-range` | Range-Balken Min↔Max je Kategorie (Tag/Woche) | low |
| **`themeRiver`** | built-in (`singleAxis`) | mehrere Sensor-Ströme proportional über Zeit | med |
| **`markPoint`/`markLine`** | built-in (Annotation auf line/bars) | Min/Max/Ø/Schwellen-Markierung (**dekorativ**; echte Rekord-**Antwort** = spec-05) | low |

> **Umfang v4 (Nutzer: „direkt alle sinnvollen"):** Core **+** Erweitert werden **alle implementiert**
> (candlestick, rangeBand, scatter, heatmapCalendar, heatmapHourDay, gauge, boxplot, radar, violin,
> barRange, themeRiver + markPoint/markLine). Nur sehr nischige Typen (`parallel`, `contour`,
> `sunburst`, `treemap`, `pictorialBar`) bleiben vorerst außen vor (geringer Wetter-Nutzen vs.
> Aufwand) — später nachrüstbar. **Großer Build** — ggf. intern in Teilpässen, aber **ein** Iterations-Gate.

---

## 4. Smart-Variety-Mechanik

- **Claude-Tool-Schema:** `chart`-Enum wächst um die implementierten Typen (Core-Set).
- **System-Prompt:** enthält den **Eignungs-Katalog** (`chart` → `fitsFor` + Datenform-Anforderung)
  und die Regel:
  > „Wähle aus den **gut passenden** Diagrammtypen für diese Frage **gewichtet-zufällig** einen aus —
  > mit **höherer** Wahrscheinlichkeit den am besten passenden, mit **geringerer** einen, der auch
  > passt, aber nicht perfekt. Wähle **nie** einen Typ, dessen Datenform nicht erfüllbar ist
  > (z. B. scatter braucht 2 Metriken, candlestick/rangeBand brauchen min+max, gauge einen Einzelwert).
  > Vermeide es, **immer** `line` zu nehmen, wenn ein anderer Typ ebenso gut passt."
- Die **gewichtet-zufällige** Auswahl macht **Claude** (es kann samplen). Backend **validiert** nur,
  dass der gewählte Typ zur gelieferten Datenform passt (sonst sauberer Fehler, §2.6).
- Optionaler Backend-Nudge (falls Claude zu oft `line` wählt): minimaler Re-Roll unter den als
  passend markierten Alternativen — **Nicht-Ziel** v4, nur Fallback-Idee.

---

## 5. Zufallsfarben (Wappen-Palette)

- **Palette** (Wappen-abgeleitet) — die **drei Hauptfarben je in 3 Tönen** (heller · original · dunkler) + 2 Akzente:
  - **Blau:** `#3E86D8` hell · `#1F5BA8` original · `#143C6E` dunkel
  - **Gold:** `#F6C04E` hell · `#F2A81C` original · `#B87A0E` dunkel
  - **Grün:** `#4FB86A` hell · `#2E9D46` original · `#1E6E30` dunkel
  - **Akzente:** `#5B7FB4` Graublau · `#C2492E` Ziegelrot
  - (= **11 Töne**; alle aus den Gemeindefarben. Bei Bedarf erweiterbar.)
- **Pro Serie** eine **zufällig** gewählte Farbe aus der Palette; **innerhalb einer Card distinct**
  (keine Doppelung). Zuweisung **bei Erstellung** → in `ChartSpec.series[].color` gespeichert
  (card-store / localStorage) → **stabil über Reload** (nicht bei jedem Render neu würfeln).
- **Permanente Charts:** kuratierte, feste Farben (kein Zufall) — die Zufallsfarben sind nur für die
  **nutzererzeugten** Cards.
- Helle/dunkle Lesbarkeit beachten (Kontrast auf weißem Card-Bg).

---

## 5b. „Neu erstellen"-Button (Regenerate)

Weil Diagrammtyp **und** Farben zufällig sind, kann eine Kombination mal nicht passen oder unschön
sein. Jede **nutzererzeugte Card** bekommt daher **neben dem Mülltonnen-Icon** einen
**„Neu erstellen"-Button** (Icon, z. B. `RefreshCw` / `Shuffle`):

- Klick → die **Original-Query** der Card (`originQuery`) wird erneut an **`/api/ask`** geschickt →
  Claude liefert eine **neue** Diagrammwahl (Smart-Variety) + neue Zufallsfarben → die Card wird
  **an Ort und Stelle** (gleicher Grid-Slot, gleiche Größe/Position) ersetzt.
- Während der Regenerierung zeigt **diese** Card den **Skeleton-Shimmer** (Reuse aus spec-03).
- **Varianz-Nudge:** der **aktuelle** `chart`-Typ wird mitgegeben, damit Claude bevorzugt einen
  **anderen** passenden Typ wählt (spürbarere Änderung je Klick). Beliebig oft wiederholbar, bis zufrieden.
- Liefert die Query mehrere Charts, wird die Card durch den **ersten** neuen Chart ersetzt.
- Nur für **User-Cards** — die permanenten Charts haben feste Specs (kein Regenerate).

---

## 6. ChartSpec/QuerySpec-Erweiterung (additiv, forward-compatible)

```ts
// query-spec.ts — Ergänzungen (Superset bleibt rückwärtskompatibel)
export type ChartType =
  | 'line' | 'bars' | 'windrose'                                   // v2/03
  | 'candlestick' | 'rangeBand' | 'scatter'                        // v4 core
  | 'heatmapCalendar' | 'heatmapHourDay' | 'gauge'                 // v4 core
  | 'boxplot' | 'radar' | 'violin' | 'barRange' | 'themeRiver';    // stretch/später

export interface Series {
  id: string; label: string;
  role?: 'value'|'magnitude'|'direction'|'min'|'mean'|'max'|'comparison'|'x'|'y'; // +'x'/'y' für scatter
  color?: string;            // NEU: zufällig aus Wappen-Palette (persistiert)
  source: Source;
}
// chart-spezifische Optionen optional am ChartSpec:
export interface ChartSpec {
  /* …bestehend… */
  binning?: 'calendar' | 'hourOfDay×weekday';   // für heatmap-Typen
}
```
- **scatter:** genau 2 Serien mit `role:'x'` und `role:'y'` (zwei Metriken), per Zeitstempel gepaart.
- **candlestick / rangeBand:** eine Metrik; Backend liefert je Fenster **min & max** (+ open/close =
  Tages-min/max bzw. 18h-min/18h-max). `role:'min'/'max'` aus dem Superset.
- **gauge:** eine Serie, **letzter** Wert (kein Verlauf).
- **heatmapCalendar:** eine Metrik, **Tageswert**; `binning:'calendar'`.
- **heatmapHourDay:** eine Metrik, gruppiert **Stunde×Wochentag**; `binning:'hourOfDay×weekday'`.

---

## 7. Flux-Data-Shaping pro neuem Typ (Server)

- **candlestick:** je Tag `min(value)`,`max(value)`,`first`,`last` → `[open,close,low,high]`
  (oder 18h-min/18h-max + abs min/max). Fenster 1d, Range nach Query.
- **rangeBand:** je Fenster `min`+`max` → `[t,low,high]`.
- **scatter:** beide Metriken auf gemeinsames Zeitraster (z. B. 1h mean) → Paare `[x,y]` per Timestamp-Join.
- **heatmapCalendar:** Tagesaggregat (mean/sum/max je nach Metrik) → `[date, value]`.
- **heatmapHourDay:** `aggregateWindow(1h, mean)` → gruppieren nach `hour(_time)`×`weekday(_time)`,
  Mittel → Matrix `[stunde, wochentag, wert]`.
- **gauge:** `last()` der Metrik (analog `/api/now`).
- Whitelist/Entity weiterhin **nur** aus dem Katalog. Rain-Akkumulator-Regeln (§ data-quality) gelten.

---

## 8. Varianz in den festen Charts („Ja, alle")

Die feste Dashboard-Sektion (`permanent-dashboard.ts`) nutzt jetzt ein **breites Typen-Spektrum**
(Nutzer-Entscheid). Vorschlag (≈12 Kacheln, je passendster Typ — beim Gate-B-Review feinjustierbar):

| # | Titel | Typ |
|---|---|---|
| 1 | Temperatur — Band & Mittel (24h) | **rangeBand** + Mittel-Linie („Sonnendiagramm") |
| 2 | Tagesregen (30 T) | **bars** |
| 3 | Regenrate (24h) | **line/area** |
| 4 | Windrose (7 T) | **windrose** |
| 5 | Wind & Böen (24h) | **line** (2 Serien) |
| 6 | Luftdruck (24h) | **line** + `markLine` Ø |
| 7 | Luftfeuchte (24h) | **line/area** |
| 8 | Sonnenstrahlung (24h) | **line/area** (Ist + Max) |
| 9 | Temperatur × Luftfeuchte (7 T) | **scatter** (Komfort-Korrelation) |
| 10 | Tages-Temperaturspanne (30 T) | **candlestick** |
| 11 | Temperatur — Jahres-Heatmap | **heatmapCalendar** |
| 12 | Tagesgang Temperatur (Stunde × Wochentag) | **heatmapHourDay** |

Optional zusätzlich (rotierend, falls sinnvoll): **boxplot** (Monats-Temp-Verteilung), **gauge**
(aktueller UV/Temp), **themeRiver** (Mehrsensor). Endauswahl beim Gate-B-Review.
**Feste Charts: kuratierte Farben** (kein Zufall) — Zufallsfarben nur für User-Cards.

---

## 9. Neue / geänderte Dateien (Soll)

```
package.json                         # + @echarts-x/custom-line-range, custom-bar-range, custom-violin
src/lib/chart-catalog.ts             # NEU: Typen + fitsFor + Datenform-Anforderungen (Quelle für Claude-Prompt + Validierung)
src/lib/colors.ts                    # NEU: Wappen-Palette + zufällige, distinct Serienfarben
src/lib/query-spec.ts                # ÄNDERN: ChartType-Enum, Series.color, role x/y, ChartSpec.binning
src/lib/claude.ts                    # ÄNDERN: chart-Enum im Tool-Schema + Eignungs-Katalog + Smart-Variety-Regel im System-Prompt
src/lib/flux.ts                      # ÄNDERN: Data-Shaping je neuem Typ (candlestick/rangeBand/scatter/heatmaps/gauge)
src/components/charts/candlestick-chart.tsx   # NEU
src/components/charts/range-band-chart.tsx    # NEU (echarts.use(lineRange))
src/components/charts/scatter-chart.tsx       # NEU
src/components/charts/calendar-heatmap.tsx    # NEU
src/components/charts/hourday-heatmap.tsx     # NEU
src/components/charts/gauge-chart.tsx         # NEU
src/components/charts/boxplot-chart.tsx       # NEU
src/components/charts/radar-chart.tsx         # NEU
src/components/charts/violin-chart.tsx        # NEU (echarts.use(violin))
src/components/charts/bar-range-chart.tsx     # NEU (echarts.use(barRange))
src/components/charts/theme-river-chart.tsx   # NEU
src/components/charts/line-chart.tsx          # ÄNDERN: optionale markPoint/markLine (min/max/Ø)
src/components/cards/chart-card.tsx           # ÄNDERN: Renderer-Switch um neue Typen; color anwenden; „Neu erstellen"-Button neben Löschen
src/components/dashboard-grid.tsx             # ÄNDERN: Regenerate-Handler (re-POST originQuery → Card am Slot ersetzen, Skeleton)
src/lib/card-store.ts                # ÄNDERN: color in persistierter ChartSpec
src/lib/permanent-dashboard.ts       # ÄNDERN: §8-Varianz
```

---

## 10. Bekannte Stolpersteine

1. **Custom-Series-Registrierung:** `echarts.use(lineRangeInstaller)` **einmalig** client-seitig vor
   dem ersten Render; SSR vermeiden (`"use client"` / dynamic).
2. **scatter-Paarung:** beide Metriken aufs **gleiche** Zeitraster bringen, sonst wenige Paare.
3. **heatmap visualMap:** sinnvolle Farbskala (Wappen-tauglich) + Legende; calendar braucht `calendar`-Coord.
4. **Farb-Stabilität:** color bei Erstellung würfeln + persistieren — **nicht** im Render.
5. **gauge min/max:** sinnvolle Skala je Metrik (Temp -20..45, UV 0..11, Feuchte 0..100).
6. **Datenform-Validierung:** Backend prüft, ob der gewählte `chart` zur Serien-/Daten-Konstellation passt.
7. **Bundle:** ECharts ggf. modular importieren, falls Bundle wächst.

---

## 11. Nicht-Ziele (→ spec-05 / später)

- Inhaltliche Antwort auf **Rekord/Extrem** (großes Label am Min/Max), **Skalar-Aggregat**, **Count/Schwellwert**, **Jahr-Vergleich** — und **`source.kind:'derived'`** (GDD/HDD). (Hier nur Typ-Vielfalt; markPoint/markLine höchstens dekorativ.)
- Stretch-Diagrammtypen über das Core-Set hinaus (boxplot/radar/violin/barRange/themeRiver) — additiv, evtl. 04b.
- Zeitbereich-Tabs der festen Charts.
