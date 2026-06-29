# Iteration spec-11 — Stabiles angepinntes Grid + größeres Query-Timeout

> **Status:** ✅ abgeschlossen — 2026-06-30 (Timeout-Teil: siehe Hinweis).

## A) Angepinntes Grid: zuverlässig anordnen + Größe ändern, stabil persistiert
**Problem:** der angepinnte Bereich „vergaß" Größe/Anordnung und beim Pin/Unpin kam es zur
Durchmischung der Reihenfolge.

**Ursache:** Das Pinned-Grid persistierte `onLayoutChange` **ungefiltert** — RGL feuert das auch
beim **Mount** und bei **programmatischen** Re-Renders (Pin/Unpin/Refresh) mit seiner frisch
(re)kompaktierten Layout-Fassung. Das überschrieb die gespeicherte Anordnung im
`data/pinned.json` und verschob Karten.

**Fix (wie im funktionierenden privaten Grid):** ein **`mutating`-Guard** im `DashboardGrid`
(`pinnedMutatingRef` + `beginPinnedMutation()`, ~150 ms), gesetzt vor jedem programmatischen
`setPinnedCards` (Mount/Refresh/Pin/Unpin). `handlePinnedLayoutChange` ignoriert `onLayoutChange`
solange der Guard aktiv ist → **nur echte User-Drag/Resize** erreichen den Server. Zusätzlich
hängt `handlePin` neue Pins kollisionsfrei **unten** an (`y = max(y+h)`).

> Verworfen: `compactor={noCompactor}` (RGL 2.2). Es stoppt zwar die Auto-Kompaktierung, ließ
> aber `onLayoutChange` die **Vor**-Drag-Fassung melden → Edits wurden still nicht gespeichert.
> Der Guard + Default-Kompaktor sind das bewährte, getestete Muster.

**Verifiziert (Playwright):** Pin sauber gerendert (x:0 → left 24, w:6 → 608 px); Drag **x:0→x:4**
persistiert via PUT, überlebt 2 Reloads; Layout **stabil über mehrere Reloads** (Guard verhindert
das Mount-Überschreiben). *(Frühere „Fehlschläge" trafen versehentlich eine private Card — die
Pinned-Logik selbst war ab dem Guard korrekt.)*

## B) Query-Timeout verdoppelt (10 s → 20 s)
Der InfluxDB-Client-Timeout (Lib-Default 10 s) ist explizit auf **20 s** gesetzt
(`influx.ts INFLUX_TIMEOUT_MS`), wie gewünscht.

> **Hinweis (ehrlich):** Für **5 Jahre** reicht das **nicht** — die Abfrage lief ~20 s in InfluxDB
> (Gesamt ~25 s inkl. Claude) und brach dann ab. Flaschenhals ist das Aggregieren über 5 Jahre der
> **HA-überabgetasteten Rohdaten**, nicht der Timeout. Mittel-/langfristig braucht es eine
> **gröbere Long-Range-Strategie** (z. B. vor-aggregierte Daten / aggressiveres Downsampling),
> nicht nur einen längeren Timeout. Offen zur Entscheidung: Timeout weiter erhöhen (schlechtere
> UX beim Warten) **oder** die Query-Strategie verbessern.

## Verifikations-Gate
- Gate A: typecheck + build Exit 0.
- Gate B (A): Drag persistiert + überlebt Reload; Layout stabil über Reloads; keine Regression
  (privates Grid, Pin/Unpin, Kennwerte).
- Gate B (B): 5-Jahres-Query bricht weiterhin ab (Timeout greift bei 20 s) — siehe Hinweis.
