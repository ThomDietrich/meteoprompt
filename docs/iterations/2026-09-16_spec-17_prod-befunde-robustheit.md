# Iteration spec-17 — Produktions-Befunde: Datum, Persistenz, Laufzeiten

> **Status:** geplant — 2026-09-16
>
> Grundlage: `docs/prod-feedback/meteoprompt-prod-log-handover.md` (58 Nutzer-Prompts,
> 2026-08-03 → 2026-09-15, deployt war `main@34f7b8a`). Jeder Befund unten ist gegen Code und
> laufende App **nachgeprüft**; wo die Prüfung der Handover-Aussage widerspricht, steht das dabei.

---

## A. Das Modell kennt das heutige Datum nicht (P1)

**Beleg.** Im Systemprompt (`src/lib/claude.ts`, `buildSystemPrompt`) kommt kein aktuelles Datum vor —
weder „heute" noch `new Date`. Das Modell muss also raten, ob ein genannter Zeitraum Vergangenheit
oder Zukunft ist.

Das erklärt beide belegten Fehlklassifikationen, und die Gegenprobe bestätigt es:

| Prompt | Damals | Heute (16.09.2026) |
|---|---|---|
| „Welche Windgeschwindigkeit war am 31.07.2026" | ❌ out_of_scope (16.08.) | ✅ 21 Punkte |
| „Niederschlag August 2026" | ❌ out_of_scope (20.08.) | ✅ 17 Punkte |

Beide Zeiträume lagen **auch damals** in der Vergangenheit. Dieselben Prompts laufen heute durch,
ohne dass sich am Code etwas geändert hätte — das Modell hat schlicht anders geraten.

**Maßnahme.** Systemprompt um „heute ist <Datum>, Ortszeit Europe/Berlin" und den Archivbeginn
(2021-10-19) ergänzen, dazu die Regel: Zeiträume bis heute sind gültig, nur **Zukunft** ist
`out_of_scope`; „dieser Monat/dieses Jahr" relativ zu heute auflösen.

**Erfolgskriterium.** Die zwei Prompts oben plus eine echte Zukunftsfrage (z. B. „05.09.2027")
werden korrekt klassifiziert; ein Unit-Test prüft, dass der Prompt das heutige Datum enthält.

## B. Persistenz: stille Pfade und kein Start-Check (P1)

**Beleg — und eine Korrektur am Handover.** Das Anpinnen meldet Fehler **sehr wohl**:
`/api/pinned` liefert 500 mit Detail (`store-error.ts`), und `dashboard-grid.tsx` setzt in
`handlePin`/`handleUnpin` einen Fehlerzustand, der an die Oberfläche durchgereicht wird. Die
Handover-Aussage „von der UI verschluckt" trifft so nicht zu.

Still sind drei andere Stellen:

1. **Pins nachladen** (`refreshPinned`): `if (!res.ok) return;` — schlägt das Lesen fehl, zeigt die
   Seite einfach *keine* Pins. Für den Nutzer sieht das aus, als wären sie gelöscht.
2. **Anordnung speichern** (Layout-`PUT`): `.catch(() => {})` — jeder Fehler wird verworfen, die
   Verschiebung gilt nur noch in dieser Sitzung.
3. **Kein Start-Check:** `instrumentation.ts` prüft beim Boot nur die InfluxDB-Erreichbarkeit. Ob
   `data/` beschreibbar ist, prüft niemand — deshalb blieb der Ausfall zwei Monate unbemerkt.

**Nicht bestätigt:** Der Handover beschreibt einen gecachten Fehlzustand („Restart-Pflicht").
Im Code gibt es das nicht: `store.ts` hält keinen Zustand, jeder Aufruf schreibt neu. Die
Beobachtung ist damit **unerklärt** und braucht eine Reproduktion, bevor daraus eine Code-Maßnahme
wird.

**Maßnahmen.**
- Start-Check: Schreibprobe in `data/` beim Boot, bei Fehlschlag `level: "error"` ins Log.
- `refreshPinned`: Lesefehler sichtbar machen statt leerer Liste.
- Layout-`PUT`: Fehlschlag einmal sichtbar melden.
- Reproduktionsversuch zur „Restart-Pflicht" (Container gegen ein `root:root`-Verzeichnis, chown im
  laufenden Betrieb); Ergebnis dokumentieren, Code nur bei Bestätigung ändern.

**Erfolgskriterium.** Container gegen ein nicht beschreibbares `data/` → Fehlerzeile beim Start;
Pinnen zeigt den Fehler; Ergebnis des Reproduktionsversuchs ist dokumentiert.

## C. Timeouts bei Langzeit-Abfragen: erst messen (P1 Messung, P2 Optimierung)

**Beleg — nicht reproduzierbar.** Die beiden auffälligen Widgets („Monatsregen (12 Monate)",
„Temperatur — Jahres-Heatmap", je 20 Timeouts) laufen hier problemlos:

| Test | Ergebnis |
|---|---|
| einzeln | 2,0 s bzw. 1,7 s |
| 21 Widget-Abfragen gleichzeitig (wie ein Seitenaufruf) | langsamste 1,6 s, **0 Fehlschläge** |

Die naheliegende Vermutung „zu viele parallele Abfragen" ist damit **widerlegt**, jedenfalls vom
Entwicklungsrechner aus gegen dieselbe Datenbank.

**Die eigentliche Lücke:** `/api/chart` schreibt **kein einziges Log-Event**. Im Betrieb existieren
deshalb nur die Fehlzeilen, aber keine Laufzeiten — auch `logFailedQuery` kennt kein `durationMs`.
Ohne Messpunkt lässt sich der Befund nicht diagnostizieren, und jede Optimierung wäre geraten.

**Maßnahmen.**
1. `/api/chart` protokolliert Erfolg und Fehler mit `durationMs`, Chart-Typ, Metriken und Zeitraum —
   analog zu `/api/ask`.
2. `logFailedQuery` um `durationMs` erweitern.
3. Erst nach ein paar Tagen Prod-Daten optimieren. Kandidaten, falls die Messung sie bestätigt:
   zeitzonen-bewusstes `aggregateWindow` über 365 Tage, die `difference`-Kette des Regen-Akkumulators
   über ein Jahr, das 20-Sekunden-Client-Timeout, ein serverseitiger Kurzzeit-Cache.

**Erfolgskriterium.** Für jede Chart-Anfrage steht eine Dauer in `data/prompts.jsonl`; daraus lassen
sich p50/p90/max je Widget auswerten.

## D. Kein Backoff bei Backend-Ausfall (P2)

**Beleg.** Jede Karte lädt beim Mount genau einmal (`permanent-dashboard.tsx`, `chart-card.tsx`),
ohne Retry und ohne gemeinsamen Zustand. Bei ~22 Widgets bedeutet jeder Seitenaufruf während eines
Ausfalls 22 Fehlversuche — daher die 325 Ereignisse an einem Tag. Bei `ECONNREFUSED` scheitern sie
schnell, bei einem hängenden Backend erst nach 20 Sekunden.

**Maßnahme.** Gemeinsamer Unterbrecher im Client: nach N aufeinanderfolgenden Verbindungsfehlern für
X Sekunden keine weiteren Chart-Abrufe, stattdessen **eine** verständliche Meldung statt 22
Fehlerkarten. Optional serverseitig schnell scheitern, solange die Datenbank als nicht erreichbar gilt.

**Erfolgskriterium.** Simulierter Ausfall (falsche `INFLUXDB_URL`) → höchstens N Anfragen statt 22,
eine Meldung.

## E. Unsinn-Eingaben vor dem LLM-Aufruf abfangen (P3)

**Beleg.** Der belegte Fall ist Tastatur-Wirrwarr **mit gültigem Kopf und Ende** („Wind und Bö…" …
„… von gestern"). Das Modell hat daraus korrekt ein Liniendiagramm gebaut — 7,7 s und ein bezahlter
API-Aufruf.

**Maßnahme.** Heuristik vor dem Aufruf (Länge, Anteil aussprechbarer Wörter). Wichtig: Der Fall zeigt,
dass eine reine Ablehnung die **gültige** Frage mitvernichten würde. Besser ist eine Rückfrage mit dem
erkannten Kern („Meintest du: Wind und Böen von gestern?").

**Erfolgskriterium.** Unit-Tests mit den belegten Beispielen; keine der 38 erfolgreichen Prod-Anfragen
wird blockiert.

## F. Wissensfragen ohne Datenbezug (P3, Produktentscheidung)

„Ist 30 °C viel?", „Was bedeutet Luftdruck 1000 hPa?" landen heute in `unmappable` mit der Bitte um
Präzisierung. Eine erklärende Antwortkategorie wäre die bessere UX — das ist aber eine
Produktentscheidung, keine Fehlerbehebung. **Offen.**

## Nicht in diesem Scope

- **Stationsausfall:** Die Rohserie liefert seit dem 11.09. nur noch vereinzelt Werte, seit dem 15.09.
  gar keine. Das ist ein Betriebsthema der Station, kein App-Fehler.
- **Vorbestehende Akkumulator-Lesart** in Kalender-Heatmap und Boxplot (aus spec-16 dokumentiert).
- **`docs/prod-feedback/` gehört nicht ins öffentliche Repo** — es enthält die Backend-IP und echte
  Nutzer-Prompts.

## Verifikations-Gate

Wie immer `typecheck`, `test`, `build` mit Exit 0, dazu die Erfolgskriterien je Abschnitt.

## Offene Entscheidungen

1. Reihenfolge: A ist klein und sofort spürbar, B verhindert stillen Datenverlust, C ist ohne die
   Messung gar nicht angreifbar. Vorschlag: **A → B → C (Messung) → D → E**.
2. Soll F überhaupt verfolgt werden?
3. Soll das Client-Timeout von 20 s angehoben werden, bevor die Messung aus C vorliegt?
