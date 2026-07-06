# Datenqualität InfluxDB — bekannte Probleme & verbindliche Lesarten

> Referenz-/Hintergrund-Doku. Stand **2026-07-05** (Umstellung auf den neuen Feed).
> Betrifft Bucket `your-bucket` (Wetterstation). Die hier dokumentierten Lesarten gelten
> verbindlich und sind im Katalog `src/lib/catalog.ts` kodiert.

## 1. Ein Feed — `garten_ventus_w830_*` (WeeWX → home-assistant-Extension)

Die App liest **ausschließlich** die kanonische Serie `garten_ventus_w830_*`. Sie stammt aus
derselben physischen Station (WeeWX/Ecowitt WS90 „Ventus W830"), wird aber seit 2026-07-05 über
die **weewx-home-assistant-Extension** (MQTT-Discovery) eingespeist: **ein Schreibvorgang pro
Archiv-Record (alle 5 min)** — kein LOOP-Übersampling mehr. Die ~4,6 Jahre Historie wurden auf
diese entity_ids migriert.

| Serie | Rolle | Status |
|---|---|---|
| **`garten_ventus_w830_*`** (deutsche Slugs, Tabelle im Handover / `catalog.ts`) | **kanonisch** | aktiv, ~4,6 J. Historie |
| `weather_station_*` (alter weewx-mqtt-Skin) | früherer Feed | **abgeschaltet 2026-07-05 ~12:10 UTC**, wird gelöscht |

**Schema (unverändert):** `_measurement` = Einheitensymbol; der numerische Wert liegt in
**`_field == "value"`** (jede Entity hat zusätzlich ein nicht-numerisches `_field == "state"`,
das die App nie liest); Tag `entity_id`.

**⚠️ Eingefrorene Altserien ignorieren.** Unter demselben Präfix `garten_ventus_w830_*` liegen
**eingefrorene** Alt-Serien mit **englischen** Slugs (`outdoor_temperature`, `wind_speed`,
`solar_radiation`, …) sowie Artefakte (`*_2`, `regen_24_h`, `regen_kumuliert`). Nur die
**deutschen** Slugs aus `catalog.ts` sind kanonisch.

## 2. Regen: aus dem Tagesakkumulator ableiten (`regen_tag`)

Der Tagesakkumulator **`regen_tag`** (mm, Reset Mitternacht) ist die verbindliche Quelle für
Mengen — der direkte Nachfolger des früher validierten `dayrain_mm`. Rohe Intervallzähler
(`regen_intervall`) werden **nicht summiert** (siehe §3): auch wenn der neue Feed pro Intervall nur
1× schreibt, bleibt das Ableiten aus dem Akkumulator die robuste Lesart (immun gegen etwaige
Duplikate).

### Verbindliche Lesart
- **Tagesmenge:** `regen_tag` mit `max`/Tag (bzw. `difference(nonNegative)+sum`, s. u.).
- **Sub-täglich** (Stunde, Abend, beliebiges Fenster):
  ```flux
  ... |> filter(entity_id == "garten_ventus_w830_regen_tag", _field == "value")
      |> group(columns: ["entity_id"])          // überbrückt Storage-Shard-Grenzen
      |> difference(nonNegative: true)           // kappt den Mitternachts-Reset
      |> aggregateWindow(every: <fenster>, fn: sum, createEmpty: false)
  ```
- **Längere Zeiträume:** Summe der Tagesmengen (dieselbe difference+sum-Kette über das Fenster).
- Im Code als Katalog-Flag `rainCounter` (`buildSeriesFlux` + Scalar-Antwortpfad) umgesetzt.

## 3. Verallgemeinerung: rohe Zähler nie summieren

Momentanwerte (Temperatur, Feuchte, Druck, Wind, Strahlung) sind über `mean/min/max`
**unkritisch** — nur `sum` auf intervall-/zählerartigen Serien ist gefährlich.

**Regel:** Mengen (Regen, Verdunstung, Windweg) immer aus dem stationseigenen **Tagesakkumulator**
ableiten (`max`/Tag bzw. `difference(nonNegative)+sum`), nie aus rohen Intervallzählern. Der neue
Feed schreibt zwar nur noch 1×/Intervall (kein Übersampling), doch der Akkumulator-Weg bleibt die
robuste Standard-Lesart.

## 4. Evapotranspiration (ET): aus `evapotranspiration_tag` (wie Regen)

**Physik:** WeeWX `ET` ist — wie Regen — ein **Intervall-Delta** (pro Archiv-Intervall, summierbar;
FAO-56 Penman-Monteith). Der neue Feed liefert dafür einen **sauberen, monotonen Tagesakkumulator
`evapotranspiration_tag`** (Reset Mitternacht) — er ersetzt den früher defekten `dayET`
(`_dailysensor_mm`, nicht-monoton). ET wird daher **exakt wie Regen** gelesen: `rainCounter` →
`difference(nonNegative)+sum` über den Tagesakkumulator.

**Verifikation (2026-07-05, Bucket-Live-Abfragen):**
- Intervallserie `evapotranspiration_intervall` schreibt im Normalbetrieb **1×/5 min** (12 Punkte/h)
  — das frühere ~19×-Übersampling (LOOP-bedingt) ist **weg**.
- Auf sauberen Tagen stimmen alle drei Lesarten überein, z. B. **2026-07-04**:
  `raw_sum` = 2,8445 mm ≈ `dedup(5m last)+sum` = 2,8437 mm ≈ `tag_max` = 2,8445 mm.
- Am Umstelltag selbst (2026-07-05) trat ein einmaliger Oversampling-Burst auf (18:00 UTC ≈ 50
  Schreibvorgänge/h statt 12) → `raw_sum` überzählte. Der Akkumulator-Weg (`tag_max` /
  `difference+sum`) ist **immun** dagegen — genau deshalb wird ET über `evapotranspiration_tag`
  gelesen und **nicht** über die Rohsumme der Intervallserie.

| Lesart | Bewertung |
|---|---|
| `evapotranspiration_tag`, **difference(nonNegative)+sum** | ✅ kanonisch (monoton, immun gegen Duplikate) |
| `evapotranspiration_intervall`, `sum`(roh) | ⚠️ im Normalbetrieb korrekt, aber anfällig für Oversampling-Bursts |
| `evapotranspiration_dailysensor_mm` (alter dayET) | ❌ historisch defekt — nicht verwenden |

```flux
import "timezone"
option location = timezone.location(name: "Europe/Berlin")
from(bucket: "your-bucket")
  |> range(start: -30d)
  |> filter(fn: (r) => r.entity_id == "garten_ventus_w830_evapotranspiration_tag" and r._field == "value")
  |> group(columns: ["entity_id"])                              // Shard-Grenzen überbrücken
  |> difference(nonNegative: true)                              // Mitternachts-Reset kappen
  |> aggregateWindow(every: 1d, fn: sum, createEmpty: false)    // Tagessumme
  |> sort(columns: ["_time"])                                   // TERMINAL_SORT-Konvention
```

Im Code über dasselbe `rainCounter`-Flag wie Regen umgesetzt. Der frühere `dedupSum`-Sonderweg
(dedup(5m last)+sum) ist damit **entfernt** — er existierte nur, weil der alte `dayET` defekt war.

## 5. Offene To-dos / Beobachtung

- [x] **Feed-Umstellung** auf `garten_ventus_w830_*` (1×/Archiv-Record) — Katalog + Doku migriert.
- [x] **Evapotranspiration** sauber über `evapotranspiration_tag` (Akkumulator) gelesen; `dedupSum` entfernt.
- [ ] **Oversampling-Bursts** beobachten: der Umstelltag zeigte einen einmaligen Burst. Falls im
      Regelbetrieb erneut Bursts in Intervallserien auftreten, ist der Akkumulator-Weg (Regen/ET)
      bereits abgesichert; für reine Intervall-Metriken (falls je gebraucht) ggf. Dedup wieder erwägen.
- [ ] Optional neue Serien aus dem Feed aufnehmen (z. B. `regen_intervall`, `trockenperiode`,
      `sonnenscheindauer_tag`, `aussentemperatur_tagesmaximum/-minimum`) — siehe Handover Tabelle 5.
