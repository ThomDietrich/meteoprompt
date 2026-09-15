# Iteration spec-16 — Tages-Extrema: Backfill + Historientiefe im Katalog

> **Status:** ✅ abgeschlossen — 2026-09-16
>
> Auslöser: „Verlauf der Maximaltemperatur pro Tag über die letzten fünf Monate" zeigte nur
> ~6 Wochen. Ursache war keine Zeitraum-Logik, sondern eine **vorwärts-only Serie**.

---

## Befund

`outdoor_temp_daily_max` (`…_aussentemperatur_tagesmaximum`) ist ein HA-Helfer, der erst ab
**2026-07-05** schreibt. Der Zeitraum `-150d` wurde korrekt durchgereicht — es gab schlicht keine
älteren Daten. Dieselbe Falle betraf 12 weitere Katalog-Serien.

**Der Recompute aus der Rohserie ist genauer als der Live-Sensor:** Über 38 Überlapp-Tage liegt das
zurückgerechnete Tagesmaximum im Median **~0,16 °C höher** (−0,11 … +0,32). Der HA-Sensor
aktualisiert nur im 5-Minuten-Archivtakt und verpasst Spitzen dazwischen (2026-07-15: roh 27,89 °C
um 12:49, Sensor 27,71 °C um 12:50). Die Rohkurve ist glatt, keine Spikes.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Ziel-Slug | **Bestehende HA-Slugs** (Option (a) des Handover-Docs). Preis: ~0,2 °C Versatz an der Naht — unter der Sensorgenauigkeit. |
| Umfang | **Nur `_tagesmaximum` + `_tagesminimum`.** Böen bleiben außen vor (Rohserie mit ungefilterten Ausreißern, z. B. 60,5 m/s 2022). |

## 1. Backfill in InfluxDB (2026-09-15)

Ausgeführt als **zwei Flux-Befehle auf dem InfluxDB-Host** (`docker compose exec influxdb influx
query` mit `to()`); dadurch lief der Write in der Datenbank, und der App-Token blieb read-only. Ein
Skript war dafür nicht nötig.

```flux
import "timezone"
option location = timezone.location(name: "Europe/Berlin")
from(bucket: "<bucket>")
  |> range(start: 2021-10-18T22:00:00Z, stop: 2026-07-04T22:00:00Z)
  |> filter(fn: (r) => r.entity_id == "garten_ventus_w830_aussentemperatur" and r._field == "value")
  |> window(every: 1d)
  |> max()                                  // min() für das Tagesminimum
  |> keep(columns: ["_time", "_value", "_measurement", "_field", "entity_id", "domain"])
  |> group(columns: ["_measurement", "_field", "entity_id", "domain"])
  |> set(key: "entity_id", value: "garten_ventus_w830_aussentemperatur_tagesmaximum")
  |> to(bucket: "<bucket>", tagColumns: ["entity_id", "domain"])
```

- **Selektor statt `aggregateWindow`:** `max()`/`min()` behalten den **echten Zeitpunkt** des
  Extremums, damit stimmt auch „wann war der Höchstwert".
- **Grenzen auf Berliner Lokal-Mitternacht** (22:00Z im Sommer, 23:00Z im Winter). Auf
  UTC-Mitternacht würde `range()` das erste `window(every: 1d)` anschneiden — beim Tagesminimum
  kritisch, das oft nachts liegt.
- **Ende 2026-07-04T22:00:00Z** = Lokal-Mitternacht des ersten Live-Tages → keine Überlappung mit
  HA-Punkten, und der Rückbau trifft ausschließlich Backfill-Punkte.
- **Idempotent:** Punkt-Identität = (Measurement, Tags, Field, Timestamp).

**Ergebnis:** je Serie **1640 Tage**, 2021-10-19 … 2026-07-04. 80 Tage ohne Rohdaten bleiben leer
(v. a. Stationsausfall 2025-04-01 … 2025-05-31).

## 2. App: Historientiefe im Katalog

`historyFrom` (erster Tag mit Daten, Berliner Kalendertag) und optional `historyFallback` in
`src/lib/catalog.ts`, geprüft am 2026-09-15 mit `first()` je Entity. Betroffen sind 13 Serien;
die Tabelle steht in [data-quality-influxdb.md](../data-quality-influxdb.md) §5.

Wirkung an drei Stellen:

1. **Systemprompt** (`claude.ts`): markiert diese Serien mit „⚠ Daten erst ab <Datum>" samt
   Alternative und erlaubter Lesart.
2. **Backend** (`src/lib/history.ts`, rein & unit-getestet): schaltet **vor** der Abfrage auf die
   Alternative um oder erzeugt einen Hinweis. Umgeschaltet wird nur, wenn **alle** Bedingungen
   gelten — sonst nur der Hinweis:
   - eine Alternative existiert (nur 18h-Max/Min → Tagesmax/Min; für Regen und Böen bewusst keine),
   - der Diagrammtyp liest jede Serie mit ihrer Aggregation (Linie, Balken, Tabelle, Radar, Gauge),
   - eine Antwort darauf behält ihre Lesart (max auf dem Tagesmaximum, min auf dem Tagesminimum,
     Zählungen nur je Tag),
   - **jede** Metrik des Diagramms wechselt auf Tageswerte, damit das Raster einheitlich bleibt.
3. **Karte** (`chart-card.tsx`): zeigt den Hinweis unter dem Diagramm, auch wenn es leer bleibt.

Außerdem: Extremwert-Kontextlinien auf Tageswert-Serien zeichnen nie feiner als 1 Tag
(`extremeWindow` in `flux-helpers.ts`), bis 90 Tage in Berliner Tagesgrenzen. Die Dashboard-Karte
„Tageshoch & -tief" zeigt jetzt **12 Monate** statt 30 Tage.

## Verifikation

| Prüfung | Ergebnis |
|---|---|
| Backfill vs. unabhängige Neuberechnung | **alle 1640 Tage** beider Serien identisch in Wert **und** Zeitstempel |
| Schema | `°C`, Tags `domain=sensor` + `entity_id`, `_field=value`, keine Zusatz-Tags |
| Überlappung / Naht | 0 Punkte ab 05.07.; bis 04.07. genau 1 Punkt je Tag, ab 05.07. HA-Werte, keine Lücke. Der Sprung beim Minimum am 05.07. ist echtes Wetter (Rohserie zeigt dasselbe) |
| Plausibilität | 2022-07-20 = 40,0 °C (Rekord-Hitzetag), 2024-01-19…21 = −18,6/−18,4/−19,5 °C (Kältewelle) |
| Ursprünglicher Prompt | **147 Punkte ab 18.04.** statt 41 |
| Umschaltung + Hinweise | je Fall gegen die laufende App geprüft (Umschalten, nur-Hinweis, Antwort-Pfade, Diagrammtypen, Tagesgrenzen, Tageshoch+Tagestief gemeinsam) |
| Hinweis in der Oberfläche | im Browser gerendert und per Screenshot geprüft |
| Verifikations-Gate | typecheck ✅ · 93 Tests ✅ · build ✅ |
| Review | fünf Durchgänge durch einen separaten Reviewer; letzter Stand: nichts offen, was einen falschen Wert oder ein irreführendes Diagramm erzeugt |

## Bekannte Grenzen

- **Sommerzeit-Randfall:** Das Nachschlagen des genauen Extremum-Zeitpunkts scannt ein festes
  24-Stunden-Fenster ab lokaler Mitternacht. An den zwei Umstellungstagen (23 bzw. 25 h) kann das
  eine Stunde daneben greifen. Der gemeldete Wert bleibt ein echter Messwert.
- **Vorbestehend, nicht Teil dieser Iteration:** `heatmapCalendar` und `boxplot`/`violin` lesen
  Akkumulator-Serien (Regen, ET) ohne `difference()` — dort sind Tageswerte zu hoch. Über die
  Umschaltung ist das nicht mehr erreichbar, direkt angefragt weiterhin schon.
- **Nicht rückrechenbar:** `sunshine_duration` ist eine Modellgröße; `evapotranspiration` hat nur
  die Intervallserie (~ab 2024). Für sie bleibt der Hinweis die einzige ehrliche Lösung.

## Rollback

Je Slug, trifft ausschließlich Backfill-Punkte:

```bash
influx delete --bucket "<bucket>" --start 1970-01-01T00:00:00Z --stop 2026-07-04T22:00:00Z \
  --predicate 'entity_id="garten_ventus_w830_aussentemperatur_tagesmaximum"'
```

## Offene Folgearbeit (eigene Iteration)

- Böen-Tagesmaximum rückrechnen — erst mit einem geprüften Ausreißerfilter (60,5 m/s in 2022).
  Bis dahin bleibt die Karte „Stärkste Böen je Tag" bei 30 Tagen.
- Akkumulator-Lesart in `heatmapCalendar`/`boxplot` korrigieren.
- Weitere Serien mit kurzer Historie (`rain_1h`, `rain_24h`, `dry_spell`) aus den Rohdaten ableiten.
