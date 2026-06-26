# NeoWX-Analyse → permanentes Dashboard (Recherche)

> Referenz-Doku (Quelle für spec-03 „Rahmen"). Stand 2026-06-26. Quelle:
> WebFetch von https://wetter.nurzen.de/neowx/ (17 Kennwert-Kacheln + 16 Chart-Namen
> sichtbar; Seite teils JS-gerendert) + NeoWX-Material-Docs (neoground.com) / WeeWX-Skin.
> Reale Katalog-Keys siehe `src/lib/catalog.ts`. **Hinweis:** Wind bei uns **km/h** (nicht m/s).

NeoWX hat ~30–40 Karten in vier Zeitbereichen (Heute 10-min, Woche 4h, Monat 6h, Jahr 1-Tag).
Ziel: drastisch reduzieren — schlanke Kennwert-Zeile oben + 10 feste Charts unten.

## A — Schlanke Kennwert-Zeile (12 Werte, „latest")

Lesefluss Temp → Komfort → Wind → Niederschlag → Atmosphäre → Strahlung:

| # | Label | Einheit | Katalog-Key (entityId) | Aggregation |
|---|---|---|---|---|
| 1 | Außentemperatur | °C | `outdoor_temperature` (`…outtemp_c`) | latest |
| 2 | Gefühlt | °C | `apparent_temperature` (`…apptemp_c`) | latest |
| 3 | Taupunkt | °C | `dew_point` (`…dewpoint_c`) | latest |
| 4 | Luftfeuchte | % | `outdoor_humidity` (`…outhumidity`) | latest |
| 5 | Wind | km/h | `wind_speed` (`…windspeed_kph`) | latest |
| 6 | Böen | km/h | `wind_gust` (`…windgust_kph`) | latest |
| 7 | Windrichtung | ° / Kürzel | `wind_direction` (`…winddir`) | latest |
| 8 | Regen heute | mm | `rainfall` (`…dayrain_mm`) | Tages-Max (Akkumulator) |
| 9 | Regenrate | mm/h | `rain_rate` (`…rainrate_mm_per_hour`) | latest |
| 10 | Luftdruck | hPa | `pressure` (`…pressure_mbar`) | latest |
| 11 | Sonnenstrahlung | W/m² | `solar_radiation` (`…radiation_wpm2`) | latest |
| 12 | UV-Index | – | `uv_index` (`…uv`) | latest |

**Weggelassen:** Innentemp/-feuchte (sekundär), Wolkenbasis (niche/abgeleitet), Evapotranspiration
(niche), abs. Druck + QNH (redundant), Windchill/Hitzeindex (durch „Gefühlt" abgedeckt).

## B — 10 permanente Verlaufs-Charts (Default 24h, optional Woche/Monat/Jahr-Tabs)

| # | Titel | Metrik(en) | Chart | Zeit | Aggregation |
|---|---|---|---|---|---|
| 1 | Temperaturverlauf | outdoor_temperature, apparent_temperature, dew_point | line (3 Serien) | 24h | 10-min/1h Ø |
| 2 | Tagesregen | rainfall (`dayrain`, Tagessummen) | bars | 30 T | Tages-Wert (diff⁺) |
| 3 | Regenrate | rain_rate | area | 24h | 1h |
| 4 | Windrose | wind_speed + wind_direction | windrose | 24h/7T | nach Sektor |
| 5 | Wind & Böen | wind_speed, wind_gust | line (2 Serien) | 24h | 1h |
| 6 | Luftdruck | pressure | line | 24h | 1h |
| 7 | Luftfeuchte | outdoor_humidity | line | 24h | 1h |
| 8 | Sonnenstrahlung | solar_radiation, max_solar_radiation | area+line | 24h | 1h |
| 9 | UV-Index | uv_index | area | 24h | 1h |
| 10 | Min/Max Außentemp (30 T) | outdoor_temperature (Tages-min/max/Ø; 18h-min/max) | **candlestick / range-band** | 30 T | Tages-min/max |

**Weggelassen vs. NeoWX:** Innen-Sensoren; Windchill/Hitzeindex/Humidex (in #1 via „gefühlt");
Wolkenbasis; Evapotranspiration; QNH/abs. Druck (redundant); separater Wind-Vektor (Rose deckt ab).

→ 5 klassische Dimensionen (Temperatur, Niederschlag, Wind, Druck, Strahlung/UV) + 30-Tage-Kontext,
je passendster Diagrammtyp. Alle Felder mappen direkt auf vorhandene `weather_station_*`-Keys.

Quellen: wetter.nurzen.de/neowx, neoground.com/docs/neowx-material, github.com/neoground/neowx-material.
