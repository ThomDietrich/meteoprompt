# Iteration 4 — spec-06: Begleittexte, Tabellen-Cards, Prompt-Kopieren

> **Status:** ✅ abgeschlossen `5b00008` — 2026-06-28.
> Erbt alles aus Iteration 1–3 (NL → Charts, 14 Chart-Typen, Intelligenz-Antworten,
> Pinnen, Stations-Dashboard, Branding). Single Source of Truth für diese Iteration.

## Ziel / Scope

Drei Features:

- **A) Begleittext pro Card** *(Hauptfeature)* — eine kurze, allgemeinverständliche
  Textzusammenfassung **unter** jedem per-Prompt erzeugten Diagramm, damit auch Nutzer,
  die Diagramme nicht gut lesen, eine Antwort erhalten und die Interpretation nicht selbst
  leisten müssen.
- **B) Tabellen-Cards** — den im Datenmodell bereits reservierten `chart:"table"`-Typ
  sauber umsetzen; genutzt **nur auf Nachfrage** oder bei sehr wenigen Vergleichswerten.
- **C) „Kopieren"-Button** — kopiert den Original-Prompt einer Card in die Zwischenablage
  (leichtes Re-Prompt statt In-Card-Editing).
- **D) CSV-Export** — kleine Schaltfläche auf allen Cards.
- **E) Wetterlage-Überblick** — ein Zusammenfassungstext in der obersten Kennwerte-Zeile
  (allgemeine Lage + Besonderheiten der letzten 2–5 Tage).

---

## A) Begleittext

### Verhalten
- Erscheint **unter** dem Diagramm, innerhalb der Card.
- Nur bei **abgefragten** Cards (mit Aufgabenstellung). Die festen Stations-Charts bekommen
  **keinen** Text (spart Kosten/Latenz; Geltungsbereich-Entscheidung).
- **1–3 Sätze**, Prosa, **max. 200 Wörter**, Deutsch.

### Inhalt (aus dem Interview festgelegt)
- **Fokus:** Wenn eine Nutzerfrage vorliegt → **zuerst die Frage direkt beantworten**.
  Generell → Verlauf/Muster knapp beschreiben **und** das Bemerkenswerteste hervorheben
  (Extrem, Ausreißer, auffälliger Tag/Trend) mit **konkreten Werten + Datum**.
- **Einordnung:** **datenbasiert** — Wertungen wie „ungewöhnlich hoch", „typisch für die
  Jahreszeit" sind erlaubt, **aber nur gestützt auf die gezeigten Daten/den Zeitraum**.
  Kein Raten, keine Erfindung, **keine Vorhersage, keine Ratschläge**.
- **Ton:** sachlich & **allgemeinverständlich**, kein Fachjargon.

### Korrektheit (kein Halluzinieren) — load-bearing
Der Text wird **serverseitig** erzeugt und mit den **tatsächlich aufgelösten Daten** +
**serverseitig berechneten Kennzahlen** gespeist (nicht mit einem Bild des Diagramms):
Min/Max/Mittel/Summe + zugehörige Zeitpunkte, Start-/Endwert, einfache Trendrichtung,
Punktanzahl, auffällige Ausreißer, Zeitraum, Einheit; bei Antwort-Cards zusätzlich der
`answer`-Wert. Optional ein grob downgesampelter Datenauszug. → Alle genannten Zahlen/Daten
sind belegt; Claude erfindet keine Werte.

### Claude-Prompt (Entwurf)
> **System:** „Du erläuterst ein Wetter-Diagramm in **1–3 kurzen Sätzen (max. 200 Wörter)**,
> auf Deutsch, **sachlich und allgemeinverständlich** (kein Fachjargon) — für Nutzer, die
> Diagramme nicht gut lesen.
> (a) Liegt eine Nutzerfrage vor, **beantworte sie zuerst direkt**.
> (b) Beschreibe knapp **Verlauf/Muster** und hebe das **Bemerkenswerteste** hervor
> (Extrem/Ausreißer/Trend) mit **konkreten Werten und Datum** (DE-Format: Komma, Einheit,
> z. B. „22 mm am 13.10.2020").
> (c) Du darfst **einordnen** (z. B. „ungewöhnlich hoch"), **aber NUR gestützt auf die
> bereitgestellten Daten/den Zeitraum** — erfinde nichts, **keine Vorhersage, keine
> Ratschläge**.
> (d) Wenn nichts Bemerkenswertes vorliegt, sage das schlicht.
> Gib **nur den Fließtext** aus — keine Aufzählung, keine Überschrift, keine Anrede."
>
> **User-Payload (JSON):** `{ frage, chartTitel, chartTyp, einheit, zeitraum,
> kennzahlen{ min,max,mean,sum, extremeMitDatum, start, ende, trend, n }, answer?,
> datenauszug? }`

Modell: **claude-sonnet-4-6** (Qualität, konsistent mit `/api/ask`). *Offen:* ggf.
`claude-haiku` für Kosten/Latenz (kurze Aufgabe) — abzuwägen.

### Erzeugung (immer aktuell) — entschieden
- Erzeugt **nach** der Datenauflösung als 2. Claude-Call — in **`/api/ask`** UND bei jedem
  **`/api/chart`** (Reload). Damit ist der Text **immer aktuell** zu den (ggf. relativen)
  Daten.
- Modell: **claude-sonnet-4-6** (Qualität).
- Gilt nur für **abgefragte** Cards (mit `originQuery`); feste Stations-Charts lösen keinen
  Call aus. → `/api/chart` ist für NL-Cards damit **nicht mehr** LLM-frei (bewusst
  akzeptiert für stets aktuellen Text). Reihenfolge: Daten zuerst rendern, Begleittext kann
  nachgeladen erscheinen (kleiner Lade-/Shimmer-Zustand unter dem Chart).

### Datenmodell
- `ChartSpec.summary?: string` (oder am Card-Wrapper) — additiv, forward-compatible.

---

## B) Tabellen-Cards

- `chart:"table"` ist im `QuerySpec` bereits reserviert → **Renderer bauen**.
- **Renderer:** TanStack Table (`@tanstack/react-table` + `@tanstack/react-virtual`),
  shadcn-Styling, **sortierbare** Spalten, virtualisiert bei vielen Zeilen.
- **Shaping:** aus der/den aufgelösten Reihe(n) → Spalten (Zeit + Wert je Serie; bei
  Aggregat/Vergleich passende Spalten). Zahlen **DE-formatiert + Einheit**.
- **Wann Tabelle (statt Diagramm):** **nur** wenn der Nutzer **explizit** danach fragt
  („als Tabelle", „tabellarisch", „liste", „exportieren") **oder** wenige diskrete Werte
  verglichen werden (z. B. „Ø-Temperatur der letzten 3 Tage", „Monatsmittel je Monat" →
  wenige Zeilen). Sonst weiterhin Diagramm. Regel im `claude.ts`-Prompt + `fitsFor` im
  `chart-catalog.ts`.
- **CSV-Export:** siehe **D)** — als kleine Schaltfläche für **alle** Cards.

---

## C) „Kopieren"-Button

- In der Card-Buttonzeile (`chart-card`) **neben** „Neu erstellen"/„Löschen": Icon-Button
  (lucide `Copy`), `aria-label="Prompt kopieren"`.
- Klick → `navigator.clipboard.writeText(originQuery)` → kurze Rückmeldung („Kopiert",
  Icon-Wechsel ~1,5 s).
- Nur auf Cards mit `originQuery` (abgefragte Cards). Feste Charts: kein Button. Bei
  angepinnten Cards: nur falls die `originQuery` vorhanden ist.

---

## D) CSV-Export (alle Cards)

- Kleine Schaltfläche (lucide `Download`, `aria-label="Als CSV herunterladen"`) in der
  Card-Buttonzeile — auf **allen** Cards: Diagramme **und** Tabellen, abgefragte **und**
  feste Stations-Charts.
- Lädt die **aufgelösten Datenpunkte** der Card als CSV herunter (clientseitig erzeugt;
  Spalten = Zeitstempel + Wert je Serie, ISO-Zeit, Punkt als Dezimaltrennzeichen für
  maschinelle Weiterverarbeitung; Dateiname aus Card-Titel + Zeitraum).
- Reine Client-Funktion (kein Endpoint nötig): nutzt die bereits geladenen
  `ResolvedSeries`.

---

## E) Wetterlage-Überblick (Kennwerte-Zeile)

Analog zu A), aber für die oberste **Kennwerte-Zeile**: ein **nachgelagertes Textelement
innerhalb des Instrumententafel-Kastens** (unter den 12 aktuellen Werten).

### Inhalt
- Eine **allgemeine Beschreibung der aktuellen Wetterlage** + **Hervorhebung von
  Besonderheiten der letzten 2–5 Tage** (z. B. ein extremer Regentag, eine Hitze-/Kälte-/
  milde Phase, ein Sturmtag). Beispiel: „Gestern hat es extrem stark geregnet, ansonsten
  milde Temperaturen. Wir befinden uns aktuell in einer sehr heißen Sommerphase."
- 1–3 Sätze, ≤200 Wörter, **sachlich, allgemeinverständlich, datenbasiert** — **gleiches
  Regelwerk wie A)** (kein Erfinden, keine Vorhersage, keine Ratschläge).

### Daten (kein Halluzinieren)
Serverseitig über die **letzten ~5 Tage** berechnet, je Tag: Temperatur (Min/Max/Mittel),
Regenmenge (korrekt: `dayrain`-Akkumulator/dedup), ggf. Windböe-Max & Sonne; plus die
aktuellen Werte. Daraus Merkmale ableiten (heißer/kalter/milder Tag, starker Regentag,
Trend/Phase) und Claude (**sonnet**) übergeben.

### Endpoint & UI
- Neuer **`GET /api/overview`** — berechnet die 5-Tage-Kennzahlen + ruft Claude.
- `KennwerteRow` lädt die **Werte** wie bisher (`/api/now`, sofort) und den **Überblick
  separat/asynchron** (Shimmer unter den Werten), damit die Werte instant erscheinen.
- **Bei jedem Laden neu** erzeugt (konsistent mit A). Bei fehlendem Key/Fehler: Werte bleiben,
  Überblick entfällt still.

---

## Verifikations-Gate

**Gate A** (secret-frei, Erfolgsbedingung):
```bash
docker compose run --rm web npm run typecheck
docker compose run --rm web npm run build
```
Beide Exit 0.

**Gate B** (Playwright + Live):
- **Begleittext:** NL-Query → Card mit 1–3-Satz-Text **unter** dem Diagramm; die genannten
  Zahlen/Daten stimmen mit den aufgelösten Daten überein (z. B. Regen-Beispiel); sachlich,
  ≤200 Wörter; **nicht** bei festen Charts; wird bei **Reload neu erzeugt** (aktuell zu den
  Daten — `/api/chart` löst für NL-Cards den Summary-Call aus).
- **CSV:** Download-Button auf einem Diagramm UND einer Tabelle → lädt die korrekten
  aufgelösten Datenpunkte als CSV.
- **Tabelle:** „… als Tabelle" → saubere, sortierbare Tabellen-Card; „Ø-Temperatur der
  letzten 3 Tage" → Tabelle; eine Standard-Query → weiterhin Diagramm; CSV-Export lädt
  korrekte Daten.
- **Kopieren:** Klick legt den Original-Prompt in die Zwischenablage (per Clipboard/Paste
  verifiziert).
- **Wetterlage-Überblick:** unter den Kennwerten erscheint ein 1–3-Satz-Text, der die
  aktuelle Lage + eine Besonderheit der letzten Tage datenkorrekt beschreibt; Werte
  erscheinen sofort, der Text asynchron; bei Reload neu.
- **Keine Regression** in Iteration 1–5.

---

## Dateien (Schätzung)
- `src/lib/summary.ts` *(neu)* — Kennzahlen-Berechnung + Claude-Call für den Begleittext.
- `src/lib/claude.ts` — Tabellen-Regel; ggf. Hilfen für die Summary-Eingabe.
- `src/lib/flux.ts` / `shapeChart` — Kennzahlen für die Summary; Table-Shaping.
- `src/lib/query-spec.ts` — `ChartSpec.summary?`; `table` ist vorhanden.
- `src/app/api/ask/route.ts` (+ `/api/chart`) — Summary erzeugen/anhängen bzw. durchreichen.
- `src/components/charts/table-card.tsx` *(neu)* + `render-chart.tsx` (`table`-Dispatch).
- `src/components/cards/chart-card.tsx` — Summary-Anzeige unter dem Chart, „Kopieren"-Button,
  CSV-Export auf Tabellen.
- `src/lib/chart-catalog.ts` — `table` `fitsFor`/`dataShape`.
- `src/lib/card-store.ts` — Summary mitpersistieren.

## Entscheidungen (festgelegt)
1. Begleittext-Modell: **claude-sonnet-4-6**.
2. Summary: **bei jedem Reload neu** erzeugen (immer aktuell; `/api/chart` nicht mehr
   LLM-frei für NL-Cards).
3. CSV-Export: **als kleine Schaltfläche für alle Cards** (Diagramme + Tabellen).
