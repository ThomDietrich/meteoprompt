# Handover an die WeeWX/HA-Extension — Serien-Wunschliste (MeteoPrompt)

> **Richtung:** von MeteoPrompt (App/Agent) → an die Quelle (WeeWX + weewx-home-assistant-Extension).
> **Zweck:** zusätzliche, an der Quelle vorberechnete Serien, die App-seitig entweder teuer,
> unmöglich oder nur mit Umwegen zu bekommen sind. Stand **2026-07-06**.

## 0. Rahmen & Konventionen (damit es 1:1 in den Katalog passt)
- **Präfix/entity_id:** `garten_ventus_w830_<slug>`, deutsche Slugs (wie der bestehende Feed).
- **Feld:** numerisch in **`_field == "value"`**; Zeit-/Enum-/Status-Werte in **`_field == "state"`**
  (ISO-8601 bzw. Enum-String bzw. `on`/`off`).
- **Bucket:** unverändert (`home_assistant_awf1877`). Einheitensymbol als `_measurement`.
- **Akkumulatoren:** monoton, Reset zu lokaler Mitternacht (Europe/Berlin) — wie `regen_tag` /
  `evapotranspiration_tag`. Das ist die von der App bevorzugte Form für Mengen.
- **Verifikation:** Ich prüfe jede neue Serie mit **engen** Einzel-Queries
  (`range(-3d) |> filter(entity_id == "…" and _field == "value") |> last()`) — der Bucket ist zu
  groß für breite Scans. Bitte also nur *saubere* Slugs anlegen (keine `*_2`-Artefakte).

## 1. ⭐ Priorität 1 — WeeWX-Tages-Statistik mit **voller Historie**
**Problem, das das löst (zwei auf einmal):**
1. **5-Jahres-Query-Timeout** (dokumentiert in spec-11): Aggregation über ~4,6 Jahre 5-min-Rohdaten
   ist zu langsam. Vor-aggregierte **Tageswerte** sind winzig → schnell.
2. **Echte mehrjährige Klimatologie** (Jahresvergleich, Monatsnormalen, Rekorde, Jahres-Heatmaps).
   Die aktuellen HA-berechneten `*_tages*`-Serien sind **vorwärts-only** (erst ~ab Juli 2026) und
   können Historie nicht liefern. WeeWX führt die Tages-Statistik (`archive_day_*`) aber **für das
   gesamte Archiv** → bitte diese mit Historie exponieren.

**Wunsch:** je Kern-Metrik drei Tages-Serien (min/max/mittel), **mit Backfill über das ganze Archiv
(seit 2021)**:

| Metrik | Slugs (`garten_ventus_w830_…`) | Einheit |
|---|---|---|
| Außentemperatur | `aussentemperatur_tagesmittel` · `_tagesmaximum_hist` · `_tagesminimum_hist` | °C |
| Luftfeuchte | `luftfeuchte_tagesmittel` · `_tagesmaximum` · `_tagesminimum` | % |
| Luftdruck (QFF) | `luftdruck_meereshohe_qff_tagesmittel` · `_tagesmaximum` · `_tagesminimum` | hPa |
| Windgeschwindigkeit | `windgeschwindigkeit_tagesmittel` · `_tagesmaximum` | m/s |
| Böen | `boengeschwindigkeit_tagesmaximum` (s. §2) | m/s |
| Sonnenstrahlung | `sonnenstrahlung_tagesmittel` · `_tagesmaximum` | W/m² |

> **Hinweis zur Namenskollision:** Es gibt bereits `aussentemperatur_tagesmaximum/-minimum`
> (vorwärts-only, „heute bisher"). Wenn die **historische** Variante denselben Slug bekäme, kollidiert
> das semantisch. Zwei saubere Optionen: **(a)** die bestehenden `_tagesmaximum/-minimum` rückwirkend
> backfillen (dann ein Slug, volle Historie), **oder (b)** separate `_hist`-Slugs wie oben. **Option
> (a) bevorzugt** — ein Slug, klar. Bitte gib an, welche du wählst.

**Alternative Umsetzung (falls HA-Sensoren mit Historie schwierig):** die Tages-Statistik direkt aus
WeeWX **in InfluxDB** schreiben (eigene Measurement/entity_ids), einmalig backfillen + laufend
fortschreiben. Für die App zählt nur: `garten_ventus_w830_<slug>`, `_field=="value"`, mit Historie.

## 2. ⭐ Priorität 1 — Tages-Böenmaximum + Zeitpunkt (Sturm-Log)
Symmetrisch zu den Temp-Extrema, fehlt aktuell komplett:

| entity_id | Feld | Einheit | Semantik |
|---|---|---|---|
| `garten_ventus_w830_boengeschwindigkeit_tagesmaximum` | value | m/s | stärkste Böe des Kalendertags |
| `garten_ventus_w830_boengeschwindigkeit_tagesmaximum_zeitpunkt` | state | ISO-Zeit | Uhrzeit der stärksten Böe |

Idealerweise **mit Historie** (aus `archive_day_windGust`), damit ein „Sturm-Log / stärkste Böen
je Tag" über Jahre geht.

## 3. Priorität 2 — Sonnenschein-Kontext (relativ statt absolut)
Damit „Sonnenstunden" als **% des astronomisch Möglichen** darstellbar werden (aussagekräftiger als
Rohstunden). WeeWX-Almanach kennt das:

| entity_id | Feld | Einheit | Semantik |
|---|---|---|---|
| `garten_ventus_w830_sonnenscheindauer_moeglich_tag` | value | h | astronomisch mögliche Sonnenscheindauer des Tages |
| *oder* `garten_ventus_w830_sonnenaufgang` / `…_sonnenuntergang` | state | ISO-Zeit | Auf-/Untergang (App leitet Tageslänge ab) |

Eines von beiden genügt. `sonnenscheindauer_moeglich_tag` ist am direktesten.

## 4. Priorität 3 (optional — App-seitig ableitbar, nur falls bequem)
| entity_id | Feld | Einheit | Semantik | Warum niedrig |
|---|---|---|---|---|
| `garten_ventus_w830_wasserbilanz_tag` | value | mm | Tages-Wasserbilanz (Regen − ET) | App rechnet `regen_tag` − `evapotranspiration_tag` selbst |
| *Backfill* der neuen abgeleiteten Serien | — | — | `sonnenscheindauer_tag`, `trockenperiode`, `evapotranspiration_tag`, `aussentemperatur_tagesmaximum/-minimum` rückwirkend | gibt deren Charts sofort Tiefe statt „mitwachsen" |

## 5. Was die App parallel schon baut (kein Quell-Bedarf)
P1 (läuft): Trockenperiode-KPI, Sonnenscheindauer-Karte + KPI, **Wasserbilanz-Chart** (aus
vorhandenem `regen_tag` − `evapotranspiration_tag`), Regenschauer-Hybrid (Stations-Schauer-Serien für
KPIs + `regen_intervall` für den historischen Verlauf). Diese Wünsche hier **erweitern/ersetzen**
diese Arbeit nicht — sie schalten v. a. **mehrjährige** Auswertungen frei.

## 6. Rückmeldung an die App (was ich brauche, sobald etwas live ist)
1. Exakte `entity_id`-Slugs + `_field` (value/state) je neuer Serie.
2. Bei Akkumulatoren: Reset-Verhalten (täglich/wöchentlich/monatlich) bestätigen.
3. Ob Historie vorhanden ist und **ab wann** (Backfill-Startdatum).
Dann verdrahte ich sie im Katalog / in den bespoke Resolvern und verifiziere mit engen Queries.
