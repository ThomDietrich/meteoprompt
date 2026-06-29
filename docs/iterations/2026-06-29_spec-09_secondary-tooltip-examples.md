# Iteration spec-09 — Sekundärwerte, Datum/Uhrzeit-Tooltip, anklickbare Beispiele

> **Status:** ✅ abgeschlossen `a6f3f00` — 2026-06-29.

Drei unabhängige Erweiterungen.

## A) Sekundär-Infos in der Kennwerte-Zeile
Mehrere Kennwerte-Zellen bekommen unter dem Hauptwert eine kleine, gedämpfte **zweite Zeile**
mit Heute-Kontext. Mapping (heute = lokaler Kalendertag, Europe/Berlin):

| Kennwert | Sekundär |
|---|---|
| Außentemperatur | `↓ {min} ↑ {max}` (heute Tief/Hoch) |
| Luftfeuchte | `↓ {min} ↑ {max}` |
| Luftdruck | `↓ {min} ↑ {max}` |
| Böen | `↑ {max}` (heute Spitzenböe) |
| Sonne | `↑ {max}` (heute Maximum) |
| UV | `↑ {max}` |

Die übrigen Zellen bleiben unverändert. Pfeile: `↓`/`↑` (Tief/Hoch), DE-Format (Komma), **ohne
Einheit** (die Einheit steht schon im Hauptwert).

### Umsetzung
- **`KennwertDef`** (lib/kennwerte.ts): neues optionales Feld `secondary?: "todayMinMax" | "todayMax"`.
  Setzen für die 6 Zeilen oben.
- **`KennwertValue`**: neues optionales Feld `secondary?: string` (server-seitig vorformatiert).
- **`resolveKennwerte`** (lib/flux.ts): zwei zusätzliche, parallele Queries über die
  Sekundär-Entitäten — `range(start: today())` … `group(["entity_id"])` … **min()** bzw.
  **max()** (group VOR der Aggregation, wegen Shard-Grenze — siehe rainToday). Daraus je Def
  `secondary` bauen (`todayMinMax` → „↓x ↑y", `todayMax` → „↑y"); DE-Format via vorhandener Logik.
  Werte fehlen → `secondary` weglassen (Hauptwert rendert trotzdem). **Darf /api/now nicht
  blockieren**: in denselben `Promise.all`-Batch wie die latest-Query.
- **`Cell`** (kennwerte-row.tsx): wenn `kv.secondary`, eine kleine Zeile (`text-[11px]`,
  `text-slate-400`, `tabular-nums`) unter dem Hauptwert rendern.

## B) Datum + Uhrzeit als Tooltip am Cursor (Zeitreihen-Charts)
Beim Bewegen/Ziehen der Maus über einen Zeitreihen-Chart zeigt der Tooltip **oben den
vollständigen Zeitpunkt** „DD.MM.YYYY, HH:MM" (DE), darunter die Serienwerte.

### Umsetzung
- **`chart-base.ts`**: zwei Helfer
  - `deDateTime(v: number|string): string` → `new Date(v).toLocaleString("de-DE",
    {day,month,year:"numeric",hour,minute:"2-digit"})` (Fallback: `String(v)` bei NaN).
  - `timeAxisTooltip(unit: string)` → Tooltip-Objekt: `{ trigger:"axis",
    axisPointer:{ type:"line" }, formatter }`, wobei `formatter(params)` aus `params[0].axisValue`
    (bzw. `params[0].data[0]`) den **DE-Zeitpunkt als fette Kopfzeile** macht + je Serie eine Zeile
    `{marker} {seriesName}: {deNum(value)} {unit}`.
- Anwenden in den **Zeitachsen-Charts** (`xAxis:{type:"time"}`): `line-chart`, `bars-chart`,
  `range-band-chart`, `candlestick-chart` (Kopfzeile = Zeitpunkt; bei OHLC die vier Werte listen).
  Nicht-Zeit-Charts (scatter mit Wert-x, radar, gauge, calendar, hourday, windrose, boxplot,
  violin, themeRiver-falls-kategorisch) unverändert.
- Bestehende `markPoint`/`markLine`/`valueFormatter`-Logik erhalten.

## C) Anklickbare Beispiel-Prompts über der Suchzeile
Statt der statischen Beispielzeile: **3 anklickbare Beispiele** (Chips/Buttons). Klick **füllt
den Prompt ins Suchfeld** (kein Auto-Submit) und fokussiert es. Demo-Charakter; bei jedem Laden
**3 zufällige** aus einem Pool von ~15. In **beiden** Varianten (`hero` + `bar`) über der Eingabe.

### Pool (~15, in lib/examples.ts)
1. Außentemperatur der letzten 4 Wochen
2. Wie viel hat es diese Woche geregnet?
3. Wärmster Tag im letzten Monat
4. Regen pro Schauer der letzten Wochen
5. Wind und Böen von gestern
6. Luftfeuchte der letzten 7 Tage
7. Monatsregen in diesem Jahr
8. Tagesverlauf der Temperatur von gestern
9. Wie schwül war es letzte Woche?
10. Höchste Windböe im letzten Monat
11. Luftdruck der letzten 3 Tage
12. Durchschnittstemperatur der letzten 3 Tage als Tabelle
13. UV-Index dieser Woche
14. Verdunstung der letzten 2 Wochen
15. Vergleich: Temperatur diese vs. letzte Woche
16. Kältester Zeitpunkt in diesem Jahr

### Umsetzung
- **`lib/examples.ts`**: `EXAMPLE_PROMPTS: string[]` (obige) + `pickExamples(n=3)` (zufällig, ohne
  Dauerhaft-State; in `search-box` einmal beim Mount via `useState(() => pickExamples(3))` wählen,
  damit pro Laden stabil aber variabel).
- **`search-box.tsx`**: über dem Formular (beide Varianten) eine Reihe kleiner Buttons; Klick →
  `setValue(example)` + Textarea fokussieren. Dezent gestylt (Pills, brand-blue/10).

## Verifikations-Gate
**Gate A:** typecheck + build → Exit 0.
**Gate B (Playwright + Live):**
- **A:** Kennwerte zeigen unter Temp/Feuchte/Druck `↓min ↑max` und unter Böen/Sonne/UV `↑max`;
  die Werte stimmen mit der DB (heute min/max) überein; Werte erscheinen weiterhin sofort.
- **B:** Hover/Drag über einem Linien- und einem Balken-Chart → Tooltip-Kopf zeigt „DD.MM.YYYY,
  HH:MM" + Serienwert(e) mit Einheit.
- **C:** über der Suchzeile 3 anklickbare Beispiele; Klick füllt exakt diesen Text ins Feld
  (kein Submit); bei Reload variiert die Auswahl; funktioniert im Hero **und** im Bar-Modus.
- **Keine Regression:** /api/now schnell, Charts (markPoint/markLine), Pinning/Spacing, Iteration 1–8.

## Entscheidungen
- Sekundär-Set: 6 Zellen (Temp/Feuchte/Druck Min/Max; Böen/Sonne/UV Max) — server-vorformatiert.
- Tooltip-Kopf = DE-Zeitpunkt; gilt für Zeitachsen-Charts.
- Beispiele: 3 zufällige aus ~15, Klick = Einfügen (kein Auto-Submit).
