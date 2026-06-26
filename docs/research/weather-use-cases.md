# Wetter-Use-Cases & Fähigkeits-Gaps (Recherche)

> Referenz-Doku (Quelle für spec-05 „Intelligenz"). Stand 2026-06-26. Recherche zu
> Wetterseiten/-Visualisierung (Quellen unten). Grundlage: NL-Query → Claude → Chart aus
> **historischen** Stationsdaten (seit 2021-10-18). **Keine Vorhersage-/Fremddaten.**

## Teil 1 — Repräsentative Queries (Auszug, je: Antwortform)

**Aktuell/Snapshot:** „Wie warm ist es gerade?" (latest-KPI) · „today's temperature so far" (Zeitreihe) ·
„Hat es heute schon geregnet?" (Skalar + ja/nein).

**Historische Trends:** „Temperatur letzte 30 Tage" (Zeitreihe) · „Luftfeuchte letztes Jahr" (Zeitreihe, Tages-Ø) ·
„Solar über die Saisons" (Langzeit).

**Rekorde/Extreme:** „Heißester Tag aller Zeiten?" · „**Wann war der kälteste Moment 2025?**" ·
„Höchste Windböe je?" · „Meiste Regen an einem Tag?" · „Top-10 windigste Tage" (Rangliste).

**Aggregate:** „Ø-Temperatur Juli 2024?" (Skalar) · „Gesamtregen 2024?" (Skalar/Summe) ·
„Ø-Windgeschwindigkeit pro Monat" (Monats-Balken) · „Ø-Tageshöchsttemperatur je Kalendermonat" (Klima-Normal).

**Vergleiche:** „War Winter 22/23 kälter als 23/24?" · „Juli dieses vs. letztes Jahr" ·
„Diese Woche nasser als letzte?" · „heute vs. gleicher Tag letztes Jahr".

**Count/Schwellwert:** „Wie viele Tage >30 °C diesen Sommer?" · „Frosttage 2024?" ·
„Tage mit >10 mm Regen 2023?" · „Tage mit UV >7?".

**Agronomie/Komfort/Energie:** „Growing Degree Days 2024 (Basis 10 °C)?" ·
„Heizgradtage Winter 24/25?" · „Hitzeindex-Verlauf + unangenehme Tage" · „Evapotranspiration Juli vs. Monat".

## Teil 2 — Fähigkeits-Gaps (priorisiert)

**Bereits machbar (aktuelle App):** Einzel-/Mehrmetrik-Zeitreihe über beliebigen Zeitraum;
Monats-Balken (wenn LLM richtig aggregiert); Langzeit-Charts.

**Neue Fähigkeiten (nach Nutzerwert):**
1. **Rekord/Extrem-Erkennung** — Min/Max über Fenster → Wert + Zeitpunkt + **annotierte Kontext-Zeitreihe** (markPoint). Deckt „kältester 2025", „heißester Tag", Rekord-Böe, max Tagesregen, „letzter Frost". → **„Point-Answer"-Karte** (große Zahl + Datum) + Mini-Chart. *Höchster Wert — emotional ansprechend für Stationsbesitzer.*
2. **Skalar-Aggregat** — sum/mean/max/min als **prominente Zahl** + Kontext-Chart. Deckt Ø Juli, Gesamtregen, ET-Monat.
3. **Count/Schwellwert** — Tage/Stunden über/unter Schwelle zählen (+ optional Kalender-Heatmap der Treffer). Deckt Frosttage, Hitzetage, Regentage, UV-Tage.
4. **Jahr-/Bereichs-Vergleich-Overlay** — zwei Zeiträume derselben Metrik überlagert (Juli'23 vs '24, Woche vs Woche).
5. **Klima-Normal/Baseline-Overlay** — Kalendermonats-Mittel über alle Jahre als Baseline (≈4,5 J. Historie reicht).
6. **Abgeleitete Größen** — GDD/HDD/CDD aus Temperaturfeldern serverseitig (Formel im Flux/API-Layer). [= Iteration-A `source.kind:'derived'`]
7. **Event-Suche** — jüngstes/erstes Datum mit Bedingung („letzter Frost", „erster Tag >30 °C").
8. **Rangliste/Top-N** — sortierbare Tabelle (TanStack) der Top-N Tage je Metrik.

## Teil 3 — Out-of-Scope (keine Daten)

Vorhersagen jeder Art · Radar/Satellit · Unwetterwarnungen · Vergleich zu offiziellen 30-J-WMO-Normalen ·
Luftqualität/Pollen · Schneehöhe/-fall (nicht gemessen) · UV-Vorhersage · Fremdstationen/Nachbarort.
→ Bei solchen Queries: **klare, ehrliche Fehlermeldung** „Dazu habe ich keine Daten (nur eigene Stationshistorie)".

## Quellen
Visual Crossing (Dashboards, NLP-Weather) · Weather Underground PWS · Davis Instruments · NeoWX/WeeWX ·
Grafana Weather · Meteoblue Year-Comparison · WeatherSpark History · Tempest/KestrelMet (GDD/ET) ·
Ambient Weather (GDD/HDD/CDD-Kacheln) · DegreesDays.net · NOAA Extreme Records · earthobservations/weather-nlp.
