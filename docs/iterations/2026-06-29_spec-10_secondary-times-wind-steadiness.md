# Iteration spec-10 — Sekundär-Zeitstempel & Wind-Stetigkeit

> **Status:** ✅ abgeschlossen — 2026-06-29.

Zwei Erweiterungen der Kennwerte-Sekundärwerte (spec-09 A).

## A) Tooltip mit Zeitpunkt für die Sekundärwerte
Die Sekundärwerte (heute Tief/Hoch bzw. Max) bekommen einen **Hover-Tooltip mit dem
Zeitpunkt** des Tief/Hoch/Max (heute). Beispiele:
- Außentemperatur „↓ 19,9 ↑ 29,4" → Tooltip „**Tief um 01:52 Uhr · Hoch um 14:20 Uhr**".
- Böen „↑ 21,9" → „**Maximum um 14:32 Uhr**".

### Umsetzung
- `resolveKennwerte` (flux.ts): die today-min/max-Queries halten bereits `_time`; statt nur
  `_value` werden jetzt die vollen Rows gespeichert. `buildSecondary` liefert
  `{ text, title }`; `title` aus den Uhrzeiten (Helfer `hhmm()` → Europe/Berlin HH:MM).
- `KennwertValue.secondaryTitle?: string` (kennwerte.ts).
- `Cell` (kennwerte-row.tsx): die Sekundärzeile rendert `title={kv.secondaryTitle}` +
  `cursor-help`.

## B) Wind-Stetigkeits-Indikator (Windrichtung)
Neuer Sekundärwert unter Windrichtung: die **directional constancy** (AMS „Steadiness of the
Wind") — wie stetig vs. ständig drehend der Wind heute war. Darstellung **Zahl + Wort**, z. B.
„**82 % · überwiegend stetig**". Tooltip erklärt die Skala.

### Metrik
Mittlere Resultierende der Richtungs-Einheitsvektoren über **heute**:
`r = √(mean(cosθ)² + mean(sinθ)²)`, 0 = ständig drehend, 1 = konstante Richtung. Robust gegen
HA-Oversampling (Duplikate skalieren Zähler+Nenner gleich → r unverändert).

### Umsetzung
- flux.ts: zwei today-scoped Skalare via `runFluxScalar` — `mean(math.cos(θ·π/180))` und
  `mean(math.sin(θ·π/180))` (Flux `import "math"`). App: `r = min(1, √(mc²+ms²))` →
  `{pct} % · {label}`. Schwellen: ≥85 % sehr stetig · ≥65 % überwiegend stetig · ≥40 %
  wechselhaft · sonst stark wechselnd. In denselben `Promise.all`-Batch (kein Extra-Roundtrip).
- `KennwertSecondary` += `"steadiness"`; `wind_direction.secondary = "steadiness"`.

## Verifikation (Gate A + B, grün)
- Gate A: typecheck + build Exit 0.
- A: 7 Sekundärzeilen tragen `secondaryTitle`; Uhrzeiten plausibel (z. B. Temp-Hoch 14:20).
- B: „82 % · überwiegend stetig" — gegen die DB gegengerechnet (cos̄ 0,6548 / sin̄ −0,4938 →
  r 0,82 = 82 %, exakt).
- Keine Regression: /api/now schnell, Werte sofort, Iteration 1–9.

## Entscheidungen (Interview)
1. Tooltip = Zeitpunkt von Tief/Hoch (Uhrzeit).
2. Wind-Stetigkeit = Zahl + Wort.
3. Zeitfenster = heute.
