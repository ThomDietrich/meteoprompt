# Iteration spec-13 — Perioden-Balken: Intervall-Semantik & eindeutige Beschriftung

> **Status:** ✅ abgeschlossen — 2026-07-12 · Commit `8d59317`
>
> Balken für Tages-/Wochen-/Monatswerte werden aktuell wie **Momentwerte** behandelt: mittig auf
> dem Datums-Tick, Tooltip „DD.MM.YYYY, 00:00", und wegen `_stop`-Beschriftung des Aggregat-Buckets
> **einen Tag zu weit rechts** (der Balken bei „7" ist die Summe des 6.). Diese Iteration stellt
> Perioden-Aggregate auf die **übliche Intervall-Darstellung** um: der Balken **füllt sein Intervall
> `[Start, Ende)`** auf einer echten Zeitachse, wird **eindeutig als Periode beschriftet** (ohne
> „00:00") und wird **dem korrekten Zeitraum zugeordnet**. Ausgelöst durch eine Nutzer-Rückmeldung
> zum Evapotranspiration-Chart.

---

## Problem (zwei getrennte Defekte, eine Ursache)

Ein Perioden-Balken ist ein **Aggregat *über* ein Intervall** (Tages-/Wochen-/Monatssumme bzw.
-mittel), wird im Code aber wie ein **Zeitpunkt** platziert und beschriftet.

**① Intervall als Zeitpunkt.** `bars-chart.tsx` nutzt `xAxis: { type: "time" }` und plottet
`[p.t, p.v]`; ECharts zentriert den Balken *auf* dem Zeitstempel → er straddled die Tagesgrenze.
Der geteilte Tooltip (`chart-base.ts` `deDateTime`) hängt immer `HH:MM` an → „00:00", was einen
Messpunkt suggeriert.

**② Off-by-one-Zuordnung (Korrektheit).** `aggregateWindow` beschriftet Buckets per Default mit
`_stop` (Ende-Rand). Der Bucket `[06.07 00:00, 07.07 00:00)` bekommt Zeitstempel `07.07 00:00` →
die **Tagessumme des 6.7. erscheint auf dem 7.-Tick** und im Tooltip als „07.07.2026, 00:00".
Für Monats-/Jahres-Buckets wurde das bereits per `timeSrc: "_start"` behoben (`timeSrcClause`,
„May's total … looks like June"); Tag/Woche/Stunde blieben offen. `overview.ts` nutzt für Tages-
Aggregate bereits durchgängig `_start` — der Bar-Pfad in `flux.ts` weicht als Einziger ab.

## Lösung — Standard für gebinnte Balken (Histogramm-Konvention)

1. **Backend: eine einzige Bucket-Konvention — Perioden-START (`_start`).** Vereinheitlicht alle
   Aggregat-Zeitstempel; behebt ① die Rechtsdrift und harmonisiert mit `overview.ts`.
2. **Client: Balken füllt sein Intervall `[Start, Ende)` auf der Zeitachse** (custom `renderItem`),
   Breite pro Bucket aus dem Abstand zum Folgepunkt (exakt für variable Monatslängen/DST).
3. **Perioden-Beschriftung statt Zeitpunkt** — Achse & Tooltip nennen die Periode, kein „00:00":

   | Granularität | Achsen-Tick | Tooltip-Kopf | Zusatz |
   |---|---|---|---|
   | Stunde | `HH:00` | `Mo, 07.07.2026, 14–15 Uhr` | Stundenwert |
   | Tag | `07.07.` | `Mo, 07.07.2026` | Tageswert |
   | Woche | `KW 28` | `KW 28 · 06.–12.07.2026` | Wochenwert |
   | Monat | `Jul 26` | `Juli 2026` | Monatswert |

   Neutraler Zusatz „Tageswert/Wochenwert/…" (nicht „-summe"), weil der Client die Aggregation
   (sum vs. mean) nicht kennt — das bleibt korrekt für beide. (Optionaler Folgeschritt: Aggregation
   in `ResolvedSeries` plumben, dann „Tagessumme".)
   **Hinweis:** „KW N" / „Juli 2026" erscheinen nur bei ECHT kalender-ausgerichteten Buckets
   (Montag-Woche `1w` / 1.-des-Monats `1mo`). Die aus `adaptiveWindow` stammenden `7d`/`30d`-Fenster
   sind epoch-verankert (nicht Montag/1.) → dort greift bewusst das immer korrekte Zeitraum-Label
   „DD.MM.YYYY – DD.MM.YYYY". Tages- und Stundenlabels sind immer kalendergenau.
4. **Momentwerte bleiben unangetastet.** Linien-/Scatter-/rangeBand-Charts zeigen echte Zeitpunkte —
   dort ist `HH:MM` korrekt und bleibt (`deDateTime` weiter genutzt).

## Betroffene Dateien

**Backend (`_start`-Vereinheitlichung + ein abhängiger Fix)**
- `src/lib/flux-helpers.ts` — `timeSrcClause` gibt **immer** `, timeSrc: "_start"` zurück (Doc-Kommentar anpassen).
- `src/lib/flux.ts` — `windowedPoints`: `timeSrc: "_start"` ergänzen (candlestick/barRange/heatmaps/boxplot/Extremwert-Envelope).
- `src/lib/flux.ts` — `rawExtremeInBucket`: Bucket ist jetzt `_start`, Fenster `[start, start+windowMs)` statt `[end-windowMs, end]`; Param/Kommentar umbenennen. **Antwort-Wert bleibt immer identisch.** Die **Zeit** bleibt identisch im groben Pfad (≥1d-Envelope: der Pinpoint-Scan trifft exakt dieselbe reale Zeitspanne). Im **sub-täglichen** Envelope-Zweig (Bereiche ≤ ~90d, Fenster 15m/1h/6h, kein Pinpoint) wandert die gemeldete Zeit vom Bucket-Ende auf den Bucket-Start — also ≤ Fensterbreite (max. 6h) früher; der Wert ist unverändert. Das Envelope-Label wandert generell auf den korrekten Tag.

**Client-Renderer**
- `src/components/charts/chart-base.ts` — neu: `deDate` (datumsnur, DE), `isoWeek`, `periodTooltipHead(grain, startMs)`, `periodAxisLabel(grain, ms)`, `inferGrain(points)` (Median-Δ → hour/day/week/month/year).
- `src/components/charts/bars-chart.tsx` — Zeitachse behalten; `type:"custom"` renderItem füllt `[t_i, t_{i+1})` (letzter Balken: Median-Δ); Mehrserien innerhalb des Bandes versetzt; Achsen-/Tooltip-Formatter per `grain`.
- `src/components/charts/candlestick-chart.tsx` — Kategorie = lokaler Tag (`deDate`/`dayKey`) statt UTC-`slice(0,10)`; Tooltip ohne „00:00".
- `src/components/charts/bar-range-chart.tsx` — Kategorie-Label lokal; Tooltip mit Perioden-Kopf + low/high statt Roh-Kategorie.
- `heatmapCalendar` / `heatmapHourDay` — **automatisch korrigiert** durch `_start` (dayKey/getHours landen auf dem richtigen Tag/der richtigen Stunde); nur verifizieren.

**Tests**
- `test/chart-base.test.ts` — `deDate`, `isoWeek`, `inferGrain`, `periodTooltipHead`/`periodAxisLabel`.
- `test/flux-helpers.test.ts` — ggf. Anpassung falls `timeSrcClause` getestet wird (aktuell nicht).

**Scope-Entscheidung (Review-Punkt):** Die „Zeitachse, intervallbreit"-Mechanik greift beim echten
Balken-Chart (`bars`). `candlestick`/`barRange` liegen bereits auf **Kategorie-Achsen** (band-korrekt,
kein Straddling) und nutzen das Custom-`barRange`-Paket — sie werden **nicht** auf Zeitachsen
umgebaut (Aufwand ohne Mehrwert), sondern erhalten nur die **Beschriftungs-/Attributions-Fixes**.
Kern-Nutzen (kein „00:00", richtiger Tag, Balken im richtigen Zeitraum) wird für alle vier geliefert.

## Verifikations-Gate

Alle drei mit Exit 0 (DB-frei):

```bash
docker compose run --rm web npm run typecheck
docker compose run --rm web npm run build
docker compose run --rm web npm run test
```

Zusätzlich (separater Durchgang, nicht Selbstabnahme):
- **Visuell:** Evapotranspiration-Chart — Balken füllt seine Tagesspalte, Tooltip „Mo, 07.07.2026 · Tageswert: 1,7 mm" (kein „00:00"), Wert sitzt auf dem korrekten Tag.
- **Regression:** Extremwert-Antwort — **Wert** unverändert; **Zeit** unverändert im groben (≥1d) Pfad, im sub-täglichen Pfad ≤ Fensterbreite früher (s. o.). Kalender-Heatmap-Zellen um einen Tag „nach links" korrigiert; Stunden×Wochentag-Heatmap-Muster um eine Stunde korrigiert; Linien-/Scatter-Charts unverändert.
