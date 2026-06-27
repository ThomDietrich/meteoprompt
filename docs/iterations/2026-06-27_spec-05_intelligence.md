# Iteration 3 — Intelligenz: Rekorde, Aggregate, Vergleiche, derived (+ Logging & Pinnen)

> **Status:** ✅ abgeschlossen `602dd63` — 2026-06-27. Phase 3 von 3:
> 03 „Rahmen" (✅ `b14cf22`) → 04 „Vielfalt" (✅ `5018eab`) → **05 „Intelligenz"** (✅ `602dd63`).
> Erbt alles aus Iteration 2/03/04. Quellen:
> [`docs/research/weather-use-cases.md`](../research/weather-use-cases.md) (die 8 Gaps),
> [`docs/research/echarts-chart-catalog.md`](../research/echarts-chart-catalog.md) (markPoint/markLine).

---

## 1. Ziel (Scope dieser Phase)

Die App beantwortet jetzt **anspruchsvolle Fragen**, die nicht „Metrik über Zeit" sind, sondern
**berechnete Ergebnisse** liefern — als prominente Zahl/Markierung **plus** Kontext-Diagramm. Plus
zwei vom Nutzer gewünschte Ergänzungen: **Protokollierung** nicht beantwortbarer Queries und
**Anpinnen** von Cards (server-seitig geteilt).

**A — Intelligenz-Fähigkeiten** (aus den priorisierten Gaps):
1. **Rekord/Extrem** — „Wann war der kälteste Zeitpunkt 2025?" → Min/Max über den Zeitraum, **großes Label + `markPoint`** auf dem Kontext-Chart.
2. **Skalar-Aggregat** — „Ø-Temperatur Juli 2024", „Gesamtregen 2024" → prominente **Zahl + Einheit** + Kontext-Chart.
3. **Count/Schwellwert** — „Wie viele Frosttage 2024?", „Tage über 30 °C" → **Anzahl** + optional Kalender-Heatmap der Treffer.
4. **Jahr-/Zeitraum-Vergleich** — „Juli dieses vs. letztes Jahr" → **Overlay** zweier Zeiträume (pro-Serie-`timeRange`).
5. **`source.kind:'derived'`** — berechnete Größen serverseitig (**GDD/HDD/CDD**) über eine benannte Transform-Registry.

**B — Logging** nicht erfolgreicher/nicht unterstützter Queries (server-seitig, für spätere Analyse/Verbesserung).

**C — Anpinnen** von Cards → server-seitig gespeichert, neue Besucher sehen sie beim Erstaufruf.

Bewusst **nicht** hier: Vorhersage/Radar/Fremddaten (dauerhaft Out-of-Scope, [use-cases §3]); Auth/Multi-User.

---

## 2. Erfolgskriterien (Verification Gate)

### Gate A
```bash
docker compose run --rm web npm run typecheck
docker compose run --rm web npm run build
```
Beide exit 0. Neue Routes `force-dynamic`; Build ohne DB/Anthropic; das `data/`-Verzeichnis (§8) darf zur Buildzeit fehlen.

### Gate B (Playwright + Keys)
1. **Rekord:** „Wann war der kälteste Zeitpunkt im Jahr 2025?" → Card mit Kontext-Linie übers Jahr, **markierter Tiefpunkt + großes Label** (Wert + Datum) — **kein** 422 mehr.
2. **Aggregat:** „Durchschnittstemperatur im Juni" → prominente Zahl (°C) + Kontext-Chart.
3. **Count:** „Wie viele Tage über 30 °C diesen Sommer?" → Anzahl + (optional) Kalender-Heatmap.
4. **Vergleich:** „Temperatur Juni dieses vs. letztes Jahr" → ein Chart mit **zwei** überlagerten Serien (zwei Zeiträume), korrekt beschriftet.
5. **Derived:** „Heizgradtage Winter 2024/25" (HDD) → berechnete Reihe/Zahl (serverseitige Transform).
6. **Logging:** eine nicht beantwortbare/Out-of-Scope-Query landet **persistent** im Fehler-Log (`data/failed-queries.jsonl`) mit Query, Grund, Zeit — prüfbar.
7. **Anpinnen (global):** Pin-Button auf einer User-Card → Löschen+Neugenerieren **ausgeblendet**, Card global gespeichert. Verifiziere **alle** Fälle: (a) **frischer Browser** (leerer localStorage) zeigt die Pins beim Erstaufruf; (b) **bestehender Nutzer** mit eigenen lokalen Cards sieht die Pins **zusätzlich**; (c) **private** (ungepinnte) Cards erscheinen **nicht** in anderen Browsern; (d) Pinnen verschiebt die Card lokal→global **ohne Dublette**; (e) **Unpin** entfernt sie global wieder.
8. **Bestehendes** (Iteration 2/03/04) intakt.

---

## 3. Datenmodell-Erweiterung (additiv, forward-compatible)

```ts
// query-spec.ts — Ergänzungen
export interface ChartSpec {
  /* …bestehend… */
  answer?: Answer;            // NEU: prominentes berechnetes Ergebnis (zusätzlich zum Kontext-Chart)
}

export type Answer =
  | { kind: 'extreme'; mode: 'min' | 'max'; metric: string }          // Wert+Zeit füllt Backend
  | { kind: 'scalar';  agg: 'mean'|'sum'|'min'|'max'; metric: string }
  | { kind: 'count';   metric: string; op: '>'|'>='|'<'|'<='; threshold: number; per: 'day'|'hour' };

// Series: pro-Serie-Zeitraum (war reserviert) → Vergleichs-Overlay
export interface Series {
  /* …bestehend… */
  timeRange?: TimeRange;      // überschreibt ChartSpec.timeRange für DIESE Serie (Jahr-Vergleich)
}

// Source: derived-Zweig (war reserviert)
export type Source = MetricSource | DerivedSource;
export interface DerivedSource {
  kind: 'derived';
  transform: 'gdd' | 'hdd' | 'cdd';        // benannte, server-seitige Transform-Registry
  base?: number;                            // z. B. GDD Basis 10 °C, HDD Basis 18 °C
  inputs: { metric: string; as: string }[]; // i. d. R. outdoor_temperature
}
```

**Antwort-Payload** (`/api/ask`, `/api/chart`) je Chart erhält optional ein aufgelöstes `answer`:
```jsonc
{ "spec": ChartSpec, "series": [...], "answer": { "kind":"extreme", "value":-12.4, "t":"2025-01-08T06:10:00Z", "label":"Kältester Punkt 2025" } }
```

---

## 4. Fähigkeiten im Detail

- **Rekord/Extrem:** Backend ermittelt min/max + Zeitpunkt über den Range (eine `min()/max()`-Query + den Roh-Zeitpunkt). Kontext = Linie über den Range. Renderer: `markPoint` (großes Label `{Wert} {Einheit}` + Datum) am Extrem; zusätzlich die **Zahl groß im Card-Kopf**.
- **Skalar-Aggregat:** Backend rechnet sum/mean/min/max über den Range → eine Zahl. Kontext = passender Chart (line/bars) der Periode. Card zeigt **große Zahl + Einheit** oben, Chart darunter.
- **Count/Schwellwert:** Backend zählt Perioden (Tag/Stunde) mit Bedingung (z. B. Tages-max > 30 °C). Ergebnis = Anzahl; optional **Kalender-Heatmap** der Treffertage (reuse heatmapCalendar). Rain/Frost: Tagesakkumulator/Tages-min beachten (§ data-quality).
- **Jahr-Vergleich (Overlay):** zwei Serien gleicher Metrik mit **eigenem `timeRange`**; Backend löst beide auf und **rebasiert die X-Achse** auf eine gemeinsame relative Achse (z. B. Tag-im-Monat / Stunde-im-Tag), Serien-Labels = die Zeiträume.
- **Derived (GDD/HDD/CDD):** Transform-Registry `src/lib/transforms.ts` — benannte, **server-seitige** Funktionen über Tages-mean der Temperatur: `GDD=Σ max(0, Tmean−base)`, `HDD=Σ max(0, base−Tmean)`, `CDD=Σ max(0, Tmean−base)`. Kumulative Reihe **oder** Skalar (Saison-Summe). **Keine** vom LLM gelieferte Mathematik — nur Transform-Name + Parameter.

---

## 5. Claude — Intent-Klassifikation

- Das bestehende `reason`-Schema wird erweitert: Statt diese Fragen mit 422 abzulehnen, erzeugt Claude
  jetzt das passende **`answer`/`derived`/Vergleichs**-Spec. `reason` bleibt nur für **echtes**
  Out-of-Scope (Vorhersage/Radar/Fremddaten) und nicht zuordenbare Eingaben → 422 (+ Logging §6).
- Tool-Schema bekommt: `answer` (extreme/scalar/count), `Series.timeRange`, `source.kind:'derived'`
  (transform/base/inputs). System-Prompt: Erkennungsregeln (Schlüsselwörter „wann/wärmste/kälteste/
  Rekord" → extreme; „Durchschnitt/insgesamt/Summe" → scalar; „wie viele Tage/Stunden … über/unter" →
  count; „vs./im Vergleich/dieses vs. letztes" → Vergleich; „Heiz-/Kühl-/Wachstumsgradtage" → derived).
- Backend validiert jedes `answer`/`derived` (Metrik im Katalog, Transform bekannt, Schwellwert plausibel).

---

## 6. Logging nicht beantwortbarer Queries

- Jede Query, die **422** ergibt (out_of_scope / unmappable / unbekannte Metrik / Shape-Fehler) **oder**
  serverseitig fehlschlägt, wird **persistent protokolliert** in **`data/failed-queries.jsonl`** (JSON-Lines):
  `{ ts, query, reason, detail, route }`. Append-only, ohne Secrets.
- Zweck: spätere Analyse → Katalog/Prompt/Transforms verbessern. (Eine Auswertungs-Ansicht ist **Nicht-Ziel** dieser Phase; reines Sammeln.)
- Server-only (`import "server-only"`), Schreibzugriff über einen kleinen Logger (`src/lib/query-log.ts`).

---

## 7. Anpinnen — Sichtbarkeits-Modell (global vs. privat)

**Klares Modell (Nutzer-Entscheid 2026-06-27):**
- **Gepinnte Cards sind GLOBAL** — server-seitig gespeichert, **für ALLE Besucher sichtbar**: neue Nutzer
  **und** bestehende Nutzer, die schon eigene Cards haben. Pins erscheinen bei jedem.
- **Nicht-gepinnte (frei erstellte) Cards sind PRIVAT** — nur im `localStorage` des jeweiligen Nutzers,
  nur für ihn sichtbar.
- **Eigene Seitenstruktur (Nutzer-Entscheid 2026-06-27)** — gepinnte Cards bekommen einen **eigenen
  Abschnitt**, NICHT ins private Grid gemischt:
  ```
  [Header]
  [Kennwerte: momentane Werte]                       (1)
  [Suchzeile + dynamisch erzeugte, PRIVATE Cards]    (2)
  ──────── Trennlinie ────────                        (3)
  [ANGEPINNTE (globale) Cards]                        (4)
  ──── Trennlinie „STATIONS-DASHBOARD" ────           (5)
  [FIXE permanente Diagramme]                         (6)
  [Footer]
  ```

**Pin-Button** pro User-Card (neben Neugenerieren + Löschen):
- Klick **Anpinnen** → blendet **Löschen + Neugenerieren aus** (Card „fixiert"); der Button wird zu **Unpin**.
- **Transition beim Pinnen:** die `ChartSpec` wandert **privat (localStorage) → global** (`POST /api/pinned`
  → `data/pinned.json`). Card aus dem lokalen Store **entfernen** und fortan aus dem globalen Satz rendern
  (keine Dublette).
- **Unpin:** `DELETE /api/pinned/:id` → global entfernen. (Ob die Card danach wieder als private lokale Card
  erscheint oder verschwindet — beim Review entscheiden; Default: verschwindet.)
- **Pinned = nicht neugenerier-/löschbar** (nur Unpin). **Kein Limit** — beliebig viele Pins; jeder darf
  pinnen/unpinnen (kein Auth; Missbrauch wird bei Bedarf später adressiert).

**Laden (BESONDERS SORGFÄLTIG — Nutzer-Hinweis: hier extra iterieren):**
- Bei **jedem** Aufruf: `GET /api/pinned` (global) → Abschnitt **(4)**; `localStorage` (privat) → Abschnitt **(2)**.
- Eine Card ist **entweder** privat **oder** gepinnt, **nie beides** → beim Pinnen aus dem lokalen Store
  entfernen (keine Dublette über die Abschnitte). Stabile IDs.
- **Layout je Abschnitt getrennt:** Pins-Layout in `data/pinned.json` (global, konsistent für alle);
  privates Layout in localStorage. Lokales Verschieben gepinnter Cards = **view-only** (nicht global persistiert).
- Pinned-Cards nutzen Renderer + `/api/chart` wie gehabt (Daten **frisch**).

---

## 8. Server-seitige Persistenz (neu)

Erstes server-seitiges Schreiben der App. Ein **`data/`**-Verzeichnis:
- `data/pinned.json` (gepinnte ChartSpecs), `data/failed-queries.jsonl` (Fehler-Log).
- **Gitignored** (Runtime-Daten); zur Buildzeit nicht nötig.
- **Persistenz:** in Dev über den vorhandenen Bind-Mount (Host-`data/`); in Prod über ein **named volume**
  auf `/app/data`. Helper `src/lib/store.ts` (atomar lesen/schreiben, Verzeichnis bei Bedarf anlegen).
- Routes server-only, robust gegen fehlende/leere Datei.

---

## 9. Neue / geänderte Dateien (Soll)

```
src/lib/query-spec.ts        # ÄNDERN: Answer, Series.timeRange, DerivedSource
src/lib/claude.ts            # ÄNDERN: intent/answer/derived/vergleich im Tool-Schema + Prompt; reason verengt
src/lib/flux.ts              # ÄNDERN: extreme/scalar/count-Resolver, per-Serie-timeRange, X-Achsen-Rebase
src/lib/transforms.ts        # NEU: GDD/HDD/CDD-Registry (server-seitig)
src/lib/store.ts             # NEU: atomarer JSON/JSONL-Datei-Store (data/)
src/lib/query-log.ts         # NEU: Fehler-Logger → data/failed-queries.jsonl
src/app/api/ask/route.ts     # ÄNDERN: answer-Auflösung + Fehler-Logging
src/app/api/chart/route.ts   # ÄNDERN: answer-Auflösung
src/app/api/pinned/route.ts          # NEU: GET (Liste) + POST (pin)
src/app/api/pinned/[id]/route.ts     # NEU: DELETE (unpin)
src/components/cards/chart-card.tsx   # ÄNDERN: Pin-Button (+ Buttons ausblenden); großes answer-Label
src/components/cards/answer-card.tsx  # NEU (optional): KPI/Zahl-Darstellung über dem Chart
src/components/charts/line-chart.tsx  # ÄNDERN: markPoint für extreme answer
src/components/dashboard-grid.tsx     # ÄNDERN: Pin-Handling + Erstbesuch lädt /api/pinned
src/lib/card-store.ts        # ÄNDERN: pinned-Flag/Status pro Card
docker-compose.yml           # ÄNDERN: named volume /app/data (Prod) + ggf. Dev-Mount
.gitignore                   # ÄNDERN: /data/
```

---

## 10. Bekannte Stolpersteine

1. **`data/`-Schreibrechte** im Container (Prod läuft als `nextjs`-User): Volume + Verzeichnis müssen schreibbar sein.
2. **Vergleichs-Overlay:** X-Achse muss **rebasiert** werden (relativer Tag/Stunde), sonst liegen die zwei Jahre weit auseinander.
3. **Count/Frost/Hitze:** richtige Tagesgrundlage (Tages-min für Frost, Tages-max für Hitzetage) + Lokalzeit (Zeitzonen-Fix aus spec-04 gilt).
4. **Rekord-Zeitpunkt:** `min()/max()` liefert den Wert; den **genauen Zeitstempel** separat holen (z. B. via `sort+limit` oder `min(column:"_value")` mit Zeit).
5. **Pin ohne Auth:** global geteilt — bewusst; ggf. Limit auf N Pins, um Missbrauch zu begrenzen.
6. **Logging-Datei wächst:** JSONL append; optional später rotieren (Nicht-Ziel).
7. **markPoint-Label-Lesbarkeit:** großes Symbol/Label, Kontrast (Wappen-Farben).

---

## 11. Nicht-Ziele

- Vorhersage/Radar/Unwetterwarnung/Fremdstationen (keine Daten — dauerhaft Out-of-Scope; werden geloggt).
- Auth/Multi-User, Rollen, Moderation der Pins.
- Auswertungs-/Admin-Oberfläche für das Fehler-Log (nur Sammeln).
- Klima-Normal/Baseline-Overlay (Gap P5) und Top-N-Rangliste (Gap P8) — optional spätere Iteration.
- Log-Rotation, Rate-Limiting.

---

## 12. Hinweis zum Umfang

Das ist die **größte** Phase (5 Antwort-Fähigkeiten + erstmals server-seitige Persistenz für Logging &
Pins). Falls gewünscht, splitten wir in **05a** (Rekord/Aggregat/Count + Logging) und **05b**
(Vergleich + derived + Pinnen) — beim Review zu entscheiden.
