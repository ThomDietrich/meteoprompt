"use client";

import type { ChartSpec } from "@/lib/query-spec";

/**
 * localStorage persistence for dashboard cards (per browser).
 *
 * We persist ONLY specs + layout, never data. On load the grid re-runs
 * POST /api/chart per card to fetch fresh data (relative time ranges roll
 * forward). See spec-02 §8. All reads happen client-side after mount.
 */

const STORAGE_KEY = "meteoprompt:cards:v1";

export interface CardLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StoredCard {
  id: string;
  spec: ChartSpec;
  originQuery: string;
  layout: CardLayout;
}

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/** Load persisted cards. Returns [] on SSR, empty store, or parse error. */
export function loadCards(): StoredCard[] {
  if (!hasLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Trust the shape loosely; the /api/chart call re-validates each spec.
    return parsed.filter(
      (c): c is StoredCard =>
        c &&
        typeof c.id === "string" &&
        c.spec &&
        typeof c.spec === "object" &&
        typeof c.originQuery === "string" &&
        c.layout &&
        typeof c.layout === "object",
    );
  } catch {
    return [];
  }
}

/** Persist the full set of cards. No-op on SSR / quota errors. */
export function saveCards(cards: StoredCard[]): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  } catch {
    // localStorage unavailable (private mode / quota) — non-fatal.
  }
}
