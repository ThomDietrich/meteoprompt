# Iteration spec-15 — Prompt- & Ereignis-Logging (sichtbar + host-persistiert)

> **Status:** ✅ abgeschlossen — 2026-07-12
>
> Jeder eingegebene Prompt (Erfolg **und** Fehler) sowie ausgewählte App-Ereignisse sollen
> nachvollziehbar sein — (a) strukturiert in der **Konsole** (`docker compose logs`) und (b) in einer
> **host-zugänglichen** JSONL-Datei. Ziel: die Nutzung verstehen und die Website auf Basis realer
> (auch fehlschlagender) Anfragen verbessern.

---

## Ist-Zustand (Befund, warum aktuell unsichtbar)

- **Erfolgreiche Prompts:** werden **nirgends** persistiert.
- **Fehlgeschlagene Prompts:** `data/failed-queries.jsonl` (via `lib/query-log.ts` → `lib/store.ts`).
  Erfasst 422er + Fehlerkategorien aus `/api/ask` **und** `/api/chart`.
- **Nicht sichtbar, weil** `data/` = `/app/data` an das **Named-Volume `app_data`** gebunden ist
  (`docker-compose.yaml:25`), das den Repo-Bind-Mount `./:/app` an dieser Stelle überschattet →
  die Datei liegt **nicht** im Host-`./data`, sondern nur im Docker-Volume.
- **Konsole:** einzelne Fehler via `console.error` in `docker compose logs web` — nur Fehler, ohne
  zuverlässigen Prompt-Text, ohne Erfolge.

## Entscheidungen (mit dem Menschen abgestimmt)

- **Speicherort:** Named-Volume → **Bind-Mount `./data`** (host-sichtbar; `./data` ist bereits gitignored).
- **Inhalt/PII:** Query + Ergebnis (Chart-Typen, Dauer, Fehlerkategorie) — **keine Client-IP / kein User-Agent.**
- **Ereignisse:** Prompts (Eingang + Ausgang), Prompt-Fehler, **Serverstart**, **DB-Verbindung/-Fehler.**
  Bewusst **nicht**: Seitenaufrufe, periodische `/api/now`-Polls (würden das Log fluten).

## Umsetzung (Vorschlag)

**1) Docker: Bind-Mount statt Named-Volume** (`docker-compose.yaml`)
- `app_data:/app/data` → **`./data:/app/data`**; die `app_data:`-Volume-Deklaration entfernen.
- Danach liegen `prompts.jsonl`, `failed-queries.jsonl` und `pinned-cards.json` direkt in `./data/`.
- **Einmalige Migration** der bestehenden Volume-Daten (Pins/History) vor der Umstellung, z. B.:
  ```bash
  docker volume ls | grep app_data     # exakten Namen prüfen (i. d. R. meteoprompt_app_data)
  docker run --rm -v meteoprompt_app_data:/from -v "$(pwd)/data":/to alpine \
    sh -c 'cp -a /from/. /to/ 2>/dev/null || true'
  ```

**2) Kleiner Logger** — `src/lib/logger.ts` (server-only)
- Eine Funktion `logEvent({ event, level, ...fields })`, die **doppelt** schreibt:
  - **Konsole:** eine lesbare Zeile (`[prompt] ok · "Regen letzte Woche" · bars · 512ms`) → `docker logs`.
  - **Datei:** vollständiges JSON-Objekt (`{ts, level, event, ...}`) an `data/prompts.jsonl`
    (über das bestehende `store.appendJsonl`). **Best-effort** — ein Log-Fehler bricht nie den Request
    (wie schon `logFailedQuery`). **Keine Secrets, keine IP.**

**3) Ereignisse verdrahten**
- `src/app/api/ask/route.ts`: `prompt_received` (bei Eingang, crash-sicher) + `prompt_ok`
  (Chart-Typen, Anzahl, `durationMs`) / `prompt_error` (Reason/Kategorie, Detail, `durationMs`).
  `/api/chart` analog (Regenerate/Pin-Refresh).
- `src/instrumentation.ts` (Next `register()`): `server_start` **und** ein einmaliger InfluxDB-Konnektivitäts-Ping
  → `db_connect` bzw. `db_error`.
- **DB-Fehler zur Laufzeit:** treten sie *während eines Prompts* auf, landen sie bereits als
  `prompt_error` (Reason `timeout`/`config`/`server_error`) — der Kontext (welcher Prompt) ist so am
  wertvollsten. Der heiße Influx-Pfad (`influx.ts`, 4 Query-Runner) bleibt **bewusst unangetastet**:
  ein `db_error` pro fehlgeschlagenem `/api/now`-Poll würde das Log fluten. (Optional später: ein
  Zustandswechsel-Monitor, der DB-Ausfall/-Recovery nur bei Übergang loggt.)
- `lib/query-log.ts` → **vereinheitlicht**: `logFailedQuery` ist jetzt ein dünner Wrapper über
  `logEvent({event:"prompt_error", …})`; `failed-queries.jsonl` entfällt (alle Prompts + Fehler in
  `prompts.jsonl`). Call-Sites in `/api/ask` + `/api/chart` unverändert.

**4) Datensatz-Schema** (`prompts.jsonl`, eine Zeile/Ereignis)
```jsonc
{ "ts":"2026-07-12T18:20:05.123Z", "event":"prompt_ok",
  "query":"Regen letzte Woche", "route":"/api/ask",
  "chartTypes":["bars"], "chartCount":1, "durationMs":512 }
{ "ts":"…", "event":"prompt_error", "query":"…", "route":"/api/ask",
  "reason":"timeout", "detail":"…", "durationMs":20031 }
{ "ts":"…", "event":"server_start" }
{ "ts":"…", "event":"db_connect", "bucket":"…" }   // kein Token, keine URL-Credentials
```

## Offen / später
- **Rotation:** `prompts.jsonl` wächst append-only. Für den privaten Betrieb unkritisch; eine
  Größen-/Zeit-Rotation kann später ergänzt werden.
- **Auswertung:** eine kleine `jq`-Rezeptsammlung (häufigste Fehlkategorien, meistgestellte Prompts)
  kann als Doku folgen.

## Verifikations-Gate

```bash
docker compose run --rm web npm run typecheck
docker compose run --rm web npm run build
docker compose run --rm web npm run test   # + Unit-Test: Logger-Record-Shaping / keine PII
```

Zusätzlich (separater Durchgang):
- Nach einer echten Anfrage erscheint eine `[prompt] …`-Zeile in `docker compose logs web`
  **und** eine JSON-Zeile in **`./data/prompts.jsonl`** (host-sichtbar).
- Serverstart erzeugt `server_start` + `db_connect`/`db_error`; ein erzwungener DB-Fehler erzeugt `db_error`.
- Kein Token / keine IP in irgendeiner Log-Zeile.
