# AGENTS.md — meteoprompt

Tool-agnostische Anweisungen für KI-Coding-Agenten in diesem Repo.
(Claude Code lädt dies über `CLAUDE.md` → `@AGENTS.md`.) Single Source of Truth.

## Was das ist
**meteoprompt** ist primär ein **Daten-Visualisierungs-Tool**: ein dynamisches Dashboard
aus frei verschieb-/größenänderbaren **Cards**, jede mit einem ECharts-Diagramm oder einer
TanStack-Tabelle auf Basis echter Zeitreihen aus einer bestehenden **InfluxDB**. (Ein
Chat-Assistent ist ein geplanter späterer Aspekt, nicht Teil der frühen Iterationen.)

## Arbeitsweise (Methode)
- **Agent-first, loop-getrieben.** Der Mensch ist Orchestrator: schreibt die Spec, definiert
  das Erfolgs-/Verifikations-Gate, reviewt. Agenten führen aus.
- **Scope + Erfolgskriterien jeder Iteration liegen als eigenes Dokument unter
  [`docs/iterations/`](./docs/iterations/)** (`YYYY-MM-DD_spec-NN_<slug>.md`, datiert + fortlaufend).
  **Aktiv** = die Iteration mit `Status: aktiv` (i. d. R. die höchstnummerierte) — die zuerst lesen.
- **Niemals selbst abnehmen.** Schreiben und Verifizieren sind getrennte Durchgänge. Fertig =
  erst wenn das Gate mit Belegen grün ist.

## Harte Regeln
1. **Alles läuft in Docker / Docker Compose — nie nativ.** Kein `npm install` / `npm run` auf dem
   Host; stattdessen `docker compose run --rm web npm …`.
2. **Secrets bleiben in `.env` (gitignored).** Niemals einen Token committen; den InfluxDB-Token
   **nie** an den Client geben (kein `NEXT_PUBLIC_*` dafür). `.env.example` enthält nur Platzhalter.
3. **InfluxDB wird serverseitig abgefragt** via `@influxdata/influxdb-client` (Route Handlers /
   Server-Code). Der InfluxDB-**MCP-Server ist nur Entwicklungs-/Agenten-Werkzeug — keine
   Laufzeit-Datenquelle.**
4. **Grid + Diagramme sind client-only** (`"use client"` / `next/dynamic({ ssr: false })`), sonst
   Hydration-Mismatch. ECharts braucht pro Card `ResizeObserver` → `chart.resize()`.
5. **Den fixierten Stack/Versionen verwenden** — keine Library ohne Rücksprache tauschen.

## Stack (fixiert)
Next.js 16 · React 19 · TypeScript 6 · Tailwind v4 · shadcn/ui · react-grid-layout v2 ·
ECharts 6 (`echarts-for-react`) · TanStack Table 8 (`@tanstack/react-virtual`) ·
`@influxdata/influxdb-client`. Node: aktuelle LTS (≥22, 24 empfohlen).

## Verifikations-Gate
Beide müssen mit Exit 0 enden (= Erfolgsbedingung des Loops):

```bash
docker compose run --rm web npm run typecheck
docker compose run --rm web npm run build
```

Build/Typecheck dürfen **keine** DB-Verbindung brauchen (Daten erst zur Laufzeit).

## Konventionen
- Root-Meta-Dokumente GROSS (`README.md`, `AGENTS.md`).
- **Iterationen:** je ein Dokument `docs/iterations/YYYY-MM-DD_spec-NN_<slug>.md` — ISO-Start-Datum
  + `spec-NN` (nullgepaddete laufende Nummer) + Kurz-Slug. Jedes trägt oben eine `Status:`-Zeile
  (`geplant` · `aktiv` · `abgeschlossen [+ Commit]`). **Kein** rollierendes `SPEC.md`.
- Referenz-/Hintergrund-Doku gehört nach `docs/`.
- **Nur committen, wenn der Mensch es verlangt.**
