# Iteration spec-08 — kompakteres Such-Layout + editierbare angepinnte Cards

> **Status:** ✅ abgeschlossen `e8303a1` — 2026-06-29.

## Ziel
Zwei kleine UX-Korrekturen am Dashboard:
1. **Weniger Leerraum** um die Suchzeile (Hero): der vertikale Abstand zwischen Such-
   zeile/Überschrift und den Elementen darüber (Überblick) und darunter (Angepinnt) wird
   **etwa halbiert**.
2. **Angepinnte Cards editierbar:** sie sollen sich **verschieben UND in der Größe ändern**
   lassen (zwei nebeneinander möglich), und die Anordnung wird **global persistent**
   gespeichert (wie die privaten Cards, nur serverseitig in `data/pinned.json`).

## Umsetzung
### 1) Spacing (search-box.tsx, Hero)
Der Hero zentriert in `min-h-[58vh]` (`justify-center`) → der Leerraum oben/unten entsteht
hier. → auf ~Hälfte reduzieren (Zielwert visuell verifizieren/feinjustieren).

### 2) Angepinnte Cards (drag/resize/persist)
- **`PinnedGrid`:** `static: true` entfernen; `dragConfig={{ handle: ".card-drag-handle" }}`
  + `resizeConfig={{ handles: ["se","sw","e","s"] }}` (gleich wie das private Grid; der
  Drag-Handle existiert in `ChartCard` auch im Pinned-Modus). `onBreakpointChange` +
  `onLayoutChange`; nur auf dem `lg`-Breakpoint persistieren (schmalere stapeln automatisch).
  Default-Größe `w:6` (zwei passen nebeneinander in 12 Spalten).
- **Persistenz:** neuer **`PUT /api/pinned`** mit `{ layouts: { id, layout:{x,y,w,h} }[] }` →
  `updatePinnedLayouts()` in `lib/pinned.ts` schreibt die neuen Layouts in `data/pinned.json`.
- **`DashboardGrid`:** `handlePinnedLayoutChange(updates)` — bei echter Änderung (Diff gegen
  `pinnedCards`) den lokalen State aktualisieren **und** `PUT /api/pinned` (best-effort). An
  beide `PinnedGrid`-Instanzen (Leerzustand + mit Cards) durchreichen.

## Verifikations-Gate
**Gate A:** `typecheck` + `build` → Exit 0.
**Gate B (Playwright + Live):**
- Hero-Leerraum oben/unten sichtbar ~halbiert (Screenshot-Vergleich).
- Eine angepinnte Card lässt sich **per Handle ziehen** und **per Ecke/Kante größer/kleiner**
  ziehen; zwei Cards lassen sich **nebeneinander** anordnen.
- Nach **Reload** ist die geänderte Anordnung **noch da** (`/api/pinned` GET liefert die neuen
  Layouts; `data/pinned.json` aktualisiert).
- Keine Regression: privates Grid (Drag/Resize/localStorage), Pin/Unpin, Kennwerte/Überblick.

## Entscheidungen
- Persistenz **global/serverseitig** (alle Besucher sehen dieselbe angepinnte Anordnung) —
  konsistent mit dem bestehenden `data/pinned.json`-Modell.
- Layout-Edits nur auf `lg` persistiert (kanonische Breite); schmalere Breakpoints sind View-only.
