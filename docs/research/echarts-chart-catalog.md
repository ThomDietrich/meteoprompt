# ECharts-6 Diagrammtyp-Katalog für Wetterdaten (Recherche)

> Referenz-Doku (Quelle für spec-04 „Vielfalt"). Stand 2026-06-26. Recherche gegen
> Apache-ECharts-Quellen (`apache/echarts/src/chart/`), Examples-Repo und
> `apache/echarts-custom-series`. Katalog-Keys hier semantisch; Mapping auf reale
> Entities siehe `src/lib/catalog.ts` (z. B. `outdoor_temperature` → `weather_station_outtemp_c`).

Unsere Daten: historische Station seit 2021-10-18, Feld `value`, stündlich aggregierbar.
Metriken: Temperatur (außen/innen/gefühlt/Taupunkt/Hitzeindex/Humidex/Windchill, 18h-Min/Max),
Feuchte, Wind (Geschw./Böe km/h, Richtung °, Böenrichtung, Windweg km), Regen (Tagesakkumulator
+ Rate), Druck (hPa), Solar (W/m²), Max-Solar, UV-Index, Wolkenbasis (m), Evapotranspiration.
**Keine Vorhersagedaten.**

## A — Built-in Series (wetter-relevant)

| chartType | zeigt | Datenform | Wetter-Use-Case | echarts-for-react v3 |
|---|---|---|---|---|
| **line** | Wert über Zeit (optional Area) | `[t, v]` ×N Serien | Temperatur/Feuchte/Druck/Solar — Standard | ✅ (bereits da) |
| **bar** (kartesisch) | Mengen je Bucket | `[kat, v]` | Tages-/Stundenregen, Windweg/Tag, ET/Monat | ✅ (bereits da) |
| **bar** (polar/Windrose) | Radialbalken, `coordinateSystem:'polar'` | Richtung×Häufigkeit | Windrichtungs-Häufigkeit | ✅ (bereits da) |
| **candlestick** | OHLC je Periode | `[open,close,low,high]` | **Tages-Temp-Range** aus 18h-min/max + abs Min/Max — Spread auf einen Blick | ✅ Datenform passt direkt |
| **scatter/effectScatter** | 2-Variablen-Korrelation | `[x,y]` (+Größe) | Temp×Feuchte (Komfort), Solar×Temp; effectScatter = Anomalie hervorheben | ✅ |
| **heatmap** (kartesisch) | 2-D-Gitter via `visualMap` | `[xi,yi,v]` | **Stunde×Wochentag** Temp/Solar; Tagesnacht-Zyklus | ✅ |
| **heatmap** (calendar) | Tag-im-Jahr × Wert | `coordinateSystem:'calendar'` | **Jahres-Heatmap** Temp/Regen — dramatischer Überblick | ✅ |
| **boxplot** | Verteilung (Q1/Median/Q3/Whisker) | `[min,Q1,med,Q3,max]` o. roh + `dataset transform:boxplot` | Monatliche Temp-Verteilung; Wind-Varianz | ✅ (transform vorhanden) |
| **radar** | Polygon über N Achsen | `indicator[]` + `value[]` | Tages-/Wochen-Summary über 6 Dim. vs. Normal | ✅ |
| **gauge** | Bogen-Tacho | `[{value}]` | „Live jetzt": akt. Temp/UV/Feuchte | ✅ (offizielles `gauge-temperature`-Beispiel) |
| **themeRiver** | gestapelte Ströme über `singleAxis` | `[date,v,serie]` | Mehrere Sensoren als proportionale Flüsse (Saison) | ✅ |
| **parallel** | Polylinien über N Achsen | N-Tupel je Beobachtung | Multivar.-Korrelation: jeder Tag als Linie über [Temp,Feuchte,Wind,Regen,UV,Druck] | ✅ (explorativ) |
| **pie/rose** (`roseType`) | Sektorfläche/-radius | `[{name,value}]` | Regen-Anteil je Monat; Windrichtung als Nightingale-Rose | ✅ |
| **sunburst/treemap** | Hierarchie (Ringe/Rechtecke) | verschachtelter Baum | Jahr→Monat→Woche Temp-Mittel; Monats-Regen als Fläche | ✅ (vor-aggregieren) |
| **pictorialBar** | Balken als Symbole | `[kat,v]`+`symbol` | Deko: Regentropfen-Stapel, Thermometer-Temp | ✅ (kosmetisch) |
| **custom** (`renderItem`) | beliebige Form | beliebig | **Wind-Barbs** (Pfeile Richtung+Stärke, `wind-barb.ts`-Beispiel), Fehlerbalken | ✅ |
| lines/graph/sankey/funnel/tree/map/chord | geo/netz/hierarchie | — | **N/A** (kein Geo/Netz bei Einzelstation) | – |

## B — Custom Series (`@echarts-x/*`, Apache-2.0)

Laden: `import inst from '@echarts-x/custom-…'; echarts.use(inst)` → `type:'custom', renderItem:'<name>'`.

| series | Paket | zeigt | Use-Case | Machbarkeit |
|---|---|---|---|---|
| **lineRange** | `@echarts-x/custom-line-range` | gefüllte Fläche zwischen Low/High-Linie | **Temp-Band „Sonnendiagramm"** (Min/Max-Hüllkurve über Zeit) | ✅ `[t,low,high]` |
| **barRange** | `@echarts-x/custom-bar-range` | Range-Balken min→max je Kategorie | Tages-/Wochen-Temp-Range-Balken | ✅ `[x,low,high]` |
| **violin** | `@echarts-x/custom-violin` | KDE-Verteilung je Kategorie | Monatliche Temp-Verteilung (Schiefe, Bimodalität) | ✅ Rohdaten |
| **contour** | `@echarts-x/custom-contour` | Iso-Linien auf 2-D-Gitter | Heat-Index-Fläche (Temp×Feuchte→Komfortzone); UV×Solar | ⚠️ Binning nötig |
| **liquidFill** | `@echarts-x/custom-liquid-fill` | animierte Füllung | akt. Feuchte als Wasserfüllung | ⚠️ deko, low info |
| wordCloud/segmentedDoughnut/stage | … | — | **N/A** | – |

## C — markPoint / markLine / markArea (Extrem-Hervorhebung)

Sub-Optionen auf `line/bar/scatter/candlestick`. Für **Rekord-Queries** (z. B. „kältester 2025"):
```js
markPoint: { symbolSize: 60, data: [ { type:'min', name:'Kältester Punkt' }, { type:'max' } ],
  label: { formatter: '{b}: {c} °C', fontSize: 12 }, itemStyle: { color: '#1F5BA8' } }
markLine:  { data: [ { type:'average', name:'Ø' }, { yAxis: 0, name:'Gefrierpunkt' } ],
  lineStyle: { type:'dashed' }, label: { formatter:'{b}: {c}°C' } }
markArea:  { data: [ [ { yAxis:30, name:'Hitzezone' }, { yAxis:45 } ] ],
  itemStyle: { color:'rgba(242,168,28,0.18)' } }
```
`type:'max'/'min'/'average'` lokalisieren Extrema/Mittel automatisch über die Serie.

## D — Shortlist neuer Typen (nach Wert/Aufwand; line/bar/windrose existieren)

1. **candlestick** (built-in) — Tages-Temp-Range aus 18h-min/max; Datenform passt direkt. *low*
2. **barRange** (custom) — saubere Min/Max-Range-Balken. *low*
3. **heatmap/Kalender** (built-in) — Jahres-Überblick Temp/Regen. *low-med*
4. **lineRange** (custom) — Temp-Band „Sonnendiagramm". *low*
5. **boxplot** (built-in) — Monats-/Wochen-Verteilung. *med*
6. **scatter** (built-in) — Temp×Feuchte/Solar-Korrelation. *low*
7. **gauge** (built-in) — „Live jetzt"-Karte. *low*
8. **heatmap/Stunde×Tag** (built-in) — Diurnal-Muster. *low-med*
9. **radar** (built-in) — Tages-Summary vs. Normal. *med*
10. **violin** (custom) — Monats-Verteilung. *med*
11. **themeRiver** (built-in) — Mehrsensor-Ströme. *med*
12. **pictorialBar** (built-in) — Thermometer-Deko. *med*
13. **markPoint+markLine auf line** — Extrema/Mittel/Gefrierlinie annotieren. *very low*
14. **contour** (custom) — Heat-Index-Komfortfläche. *high*
15. **parallel** (built-in) — Multiachsen-Korrelation. *med*

**Implementierungsnotiz:** built-in = keine Extra-Pakete; `@echarts-x/*` = je `npm install` + einmalig `echarts.use(inst)` im client-only Modul. Quellen: github.com/apache/echarts, echarts-examples, apache/echarts-custom-series.
