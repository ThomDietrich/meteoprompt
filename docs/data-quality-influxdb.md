# Datenqualität InfluxDB — bekannte Probleme & verbindliche Lesarten

> Referenz-/Hintergrund-Doku. Stand **2026-06-26**. Betrifft Bucket `your-bucket`
> (Wetterstation). Diese Probleme sind **mittelfristig zu beheben**; bis dahin gelten die hier
> dokumentierten Lesarten verbindlich (sie sind im Katalog `src/lib/catalog.ts` kodiert).

## 1. Zwei Stationen — eine physische Quelle, doppelt eingespeist

| Serie | Rolle | Historie |
|---|---|---|
| **`weather_station_*`** (WeeWX/Ecowitt) | **kanonisch** | durchgehend **seit 2021-10-18** (erster Punkt `outtemp_c`: 2021-10-18 22:20 Z, 6,1 °C) |
| `garten_ventus_w830_*` | jüngeres Duplikat | erst ~Mitte 2025; identische Momentanwerte, aber kürzer & teils fehlerhaft (s. Regen) |

Beide liefern z. B. Temperatur **wertgleich zur selben Sekunde** (26.06.2026 15:47:23 → beide 36,1 °C)
→ dieselbe physische Station über zwei HA-Integrationen. **Die App nutzt ausschließlich
`weather_station_*`.** (Iteration-1-Temperatur-Card am 2026-06-26 darauf umgestellt.)

## 2. Regen: nur der Tagesakkumulator ist korrekt

Belegt an Kalendertagen mit echtem Regen (Wahrheit = stationseigener Tagesakkumulator):

| Serie | Aggregation | 2026-05-07 | 2026-06-20 | Bewertung |
|---|---|--:|--:|---|
| `weather_station_dayrain_mm` | `max`/Tag | **22,4 mm** | **6,4 mm** | ✅ korrekt |
| `weather_station_rain_mm` | `sum`(roh) | 69,4 mm | 25,6 mm | ❌ ~3–4× **Überzählung** |
| `garten_ventus_w830_rainfall` | `sum`(roh) | 10,2 mm | *keine Daten* | ❌ ~55 % **Unterzählung** / Lücken |

**Ursache der Überzählung (`rain_mm`):** Werte werden mehrfach geschrieben (Duplikate, teils nur
**Millisekunden** auseinander — am 21.06. eine einzige 0,2-mm-Wippenkippung als 4 Einträge).
Summieren der Rohpunkte zählt jede Kippung mehrfach.
**Ursache der Unterzählung (ventus `rainfall`):** verlustbehaftete Inkremente (max 0,51 mm über
50 Tage) mit Lücken; am Hauptregentag 2026-06-20 fehlen die Daten ganz.

### Verbindliche Lesart
- **Tagesmenge:** `dayrain_mm` mit `max`/Tag.
- **Sub-täglich** (Stunde, Abend, beliebiges Fenster):
  ```flux
  ... |> filter(entity_id == "weather_station_dayrain_mm", _field == "value")
      |> difference(nonNegative: true)          // kappt den Mitternachts-Reset
      |> aggregateWindow(every: <fenster>, fn: sum, createEmpty: false)
  ```
  Validiert 2026-06-20: 3h-Summen ergeben exakt die Tagesmenge **6,4 mm**.
- **Längere Zeiträume:** Summe der Tagesmengen.
- `rain_mm` **und** ventus-`rainfall` **nicht** verwenden (nicht im Katalog).

## 3. Verallgemeinerung: rohe Zähler nie summieren

Das Mehrfach-Write-Problem betrifft potenziell **alle intervall-/zählerartigen Serien**
(`rain_mm`, `evapotranspiration_mm`, evtl. `windrun_km`). Momentanwerte (Temperatur, Feuchte,
Druck, Wind, Strahlung) sind über `mean/min/max` **unkritisch** — Duplikate verfälschen den Wert
nicht; nur `sum` ist gefährlich.

**Regel:** Mengen immer aus dem stationseigenen **Tagesakkumulator** ableiten
(`max`/Tag bzw. `difference(nonNegative)+sum`), nie aus rohen Intervallzählern.
Verdunstung analog: `evapotranspiration_dailysensor_mm` (Akkumulator) statt `evapotranspiration_mm`.

## 4. Mittelfristige To-dos (zu beheben)

- [ ] **Mehrfach-Writes an der Quelle** (HA→InfluxDB) untersuchen/deduplizieren — z. B. Schreib-Dedup
      oder eine bereinigte Downsampling-Task; danach könnten Intervallserien wieder vertrauenswürdig summierbar sein.
- [ ] **Evapotranspiration** wie Regen behandeln (Akkumulator-Variante; Intervallserie meiden).
- [ ] **ventus-Integration** abschalten (redundant) oder klar als Live-Backup kennzeichnen.
- [ ] Prüfen, ob weitere **Akkumulatoren** (`windrun_km`, Regen-Varianten) Reset-/Dup-Effekte zeigen.
- [ ] Optional: Down-sampled „clean"-Bucket für Mengen (vorberechnete Tages-/Stundensummen).
