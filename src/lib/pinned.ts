import "server-only";

import { readJson, writeJson } from "@/lib/store";
import type { CardBox, ChartSpec, PinnedCard } from "@/lib/query-spec";

/**
 * Server-side access to the GLOBAL pinned cards (spec-05 §7), persisted in
 * data/pinned.json. Tolerant of a missing/empty file (treated as no pins).
 */

const PINNED_FILE = "pinned.json";

/** List all pinned cards (global, shared by all visitors). */
export async function listPinned(): Promise<PinnedCard[]> {
  const cards = await readJson<PinnedCard[]>(PINNED_FILE, []);
  return Array.isArray(cards) ? cards : [];
}

/**
 * Add a card to the global pins. Idempotent on `id` (re-pinning replaces the
 * stored spec/layout rather than duplicating). Returns the updated list.
 */
export async function addPinned(card: PinnedCard): Promise<PinnedCard[]> {
  const cards = await listPinned();
  const next = cards.filter((c) => c.id !== card.id);
  next.push(card);
  await writeJson(PINNED_FILE, next);
  return next;
}

/** Remove a pinned card by id. Returns the updated list. */
export async function removePinned(id: string): Promise<PinnedCard[]> {
  const cards = await listPinned();
  const next = cards.filter((c) => c.id !== id);
  await writeJson(PINNED_FILE, next);
  return next;
}

/** One pinned card's new grid box (spec-08: editable pinned arrangement). */
export interface PinnedLayoutUpdate {
  id: string;
  layout: CardBox;
}

/**
 * Apply new grid layouts to the global pins (spec-08) — drag/resize edits from
 * the client. Only the `layout` of matched ids changes; spec/originQuery and any
 * unmatched pins are untouched. Returns the updated list.
 */
export async function updatePinnedLayouts(
  updates: PinnedLayoutUpdate[],
): Promise<PinnedCard[]> {
  const byId = new Map(updates.map((u) => [u.id, u.layout]));
  const cards = await listPinned();
  const next = cards.map((c) => {
    const l = byId.get(c.id);
    return l ? { ...c, layout: { x: l.x, y: l.y, w: l.w, h: l.h } } : c;
  });
  await writeJson(PINNED_FILE, next);
  return next;
}

/** Validate a PUT /api/pinned body: { layouts: [{ id, layout:{x,y,w,h} }] }. */
export function isValidLayoutUpdates(v: unknown): v is PinnedLayoutUpdate[] {
  if (!Array.isArray(v)) return false;
  return v.every((u) => {
    if (typeof u !== "object" || u === null) return false;
    const r = u as Record<string, unknown>;
    if (typeof r.id !== "string") return false;
    const l = r.layout as CardBox | undefined;
    return (
      !!l &&
      typeof l === "object" &&
      typeof l.x === "number" &&
      typeof l.y === "number" &&
      typeof l.w === "number" &&
      typeof l.h === "number"
    );
  });
}

/** Minimal validation of an incoming pin payload (POST body). */
export function isValidPinnedCard(v: unknown): v is PinnedCard {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.originQuery !== "string") return false;
  if (typeof r.layout !== "object" || r.layout === null) return false;
  const spec = r.spec as ChartSpec | undefined;
  if (!spec || typeof spec !== "object") return false;
  if (typeof spec.chart !== "string" || !Array.isArray(spec.series)) return false;
  const layout = r.layout as CardBox;
  return (
    typeof layout.x === "number" &&
    typeof layout.y === "number" &&
    typeof layout.w === "number" &&
    typeof layout.h === "number"
  );
}
