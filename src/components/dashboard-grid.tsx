"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ResponsiveGridLayout,
  type Breakpoints,
  type Layout,
  type LayoutItem,
  type ResponsiveLayouts,
} from "react-grid-layout";

import { ChartCard } from "@/components/cards/chart-card";
import { SearchBox } from "@/components/search-box";
import {
  loadCards,
  saveCards,
  type CardLayout,
  type StoredCard,
} from "@/lib/card-store";
import type { AskResponse } from "@/lib/query-spec";

/**
 * Dashboard orchestrator (client-only).
 * - Empty state → centered search box.
 * - ≥1 card → slim top search bar + responsive grid of ChartCards.
 * - Submit → POST /api/ask → append one card per returned ChartSpec.
 * - Cards persist (specs + layout) in localStorage; reload rehydrates and each
 *   card re-fetches fresh data via /api/chart (no Claude). See spec-02 §3/§8/§9.
 */

const COLS: Breakpoints = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
const BREAKPOINTS: Breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const ROW_HEIGHT = 48;
const DEFAULT_SIZE = { w: 6, h: 8, minW: 3, minH: 4 };

/** Place a new card below existing ones (two-per-row on wide screens). */
function nextLayoutPosition(existing: StoredCard[]): CardLayout {
  if (existing.length === 0)
    return { x: 0, y: 0, w: DEFAULT_SIZE.w, h: DEFAULT_SIZE.h };
  const maxY = existing.reduce((m, c) => Math.max(m, c.layout.y + c.layout.h), 0);
  const x = existing.length % 2 === 0 ? 0 : DEFAULT_SIZE.w;
  const y =
    existing.length % 2 === 0 ? maxY : Math.max(0, maxY - DEFAULT_SIZE.h);
  return { x, y, w: DEFAULT_SIZE.w, h: DEFAULT_SIZE.h };
}

/**
 * Self-managed container width.
 *
 * Replaces RGL v2's `useContainerWidth`, which latched a stale, too-narrow width
 * on rehydrate. We use a **callback ref** rather than a layout effect so the
 * measurement re-attaches whenever the measured node actually changes — crucial
 * here because the ref target swaps between the empty-state hero `<div>` and the
 * grid `<div>` when the first card appears. A plain `useRef` + `[]`-deps effect
 * stays bound to the first node (the hero) and never measures the grid container,
 * which is what left RGL computing columns against a tiny width. The callback ref
 * observes the live node with a ResizeObserver and also tracks window resizes.
 * The component is loaded `ssr:false`, so this only runs client-side.
 */
function useMeasuredWidth(): {
  width: number;
  ref: (node: HTMLDivElement | null) => void;
  ready: boolean;
} {
  const [width, setWidth] = useState(0);
  // Keep the current node + observer so the window-resize listener can re-measure.
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const measure = useCallback(() => {
    const el = nodeRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w > 0) setWidth((prev) => (prev === w ? prev : w));
  }, []);

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      // Detach from the previous node.
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      nodeRef.current = node;
      if (!node) return;

      // Measure immediately, then keep current via ResizeObserver.
      const w = node.clientWidth;
      if (w > 0) setWidth((prev) => (prev === w ? prev : w));

      const observer = new ResizeObserver(measure);
      observer.observe(node);
      observerRef.current = observer;
    },
    [measure],
  );

  // Window resize as a backstop (e.g. when only the viewport, not the box, changes).
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return { width, ref, ready: width > 0 };
}

/** Derive the RGL layout items from the stored cards. */
function toLayoutItems(cards: StoredCard[]): LayoutItem[] {
  return cards.map((c) => ({
    i: c.id,
    x: c.layout.x,
    y: c.layout.y,
    w: c.layout.w,
    h: c.layout.h,
    minW: DEFAULT_SIZE.minW,
    minH: DEFAULT_SIZE.minH,
  }));
}

export default function DashboardGrid() {
  const { width, ref: containerRef, ready } = useMeasuredWidth();

  const [cards, setCards] = useState<StoredCard[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the active responsive breakpoint. We only persist layout edits made on
  // the widest (`lg`) breakpoint — narrower breakpoints auto-stack cards (w6 fills
  // 6-col `sm`), and persisting that would clobber the canonical wide arrangement.
  const breakpointRef = useRef<string>("lg");

  // Rehydrate from localStorage after mount (client-only → no SSR mismatch).
  useEffect(() => {
    setCards(loadCards());
  }, []);

  const persist = useCallback((next: StoredCard[]) => {
    saveCards(next);
  }, []);

  // Submit free text → /api/ask → append a card per returned ChartSpec.
  const handleSubmit = useCallback(
    async (query: string) => {
      setPending(true);
      setError(null);
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: query }),
        });
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try {
            const body = (await res.json()) as { detail?: string };
            if (body?.detail) detail = body.detail;
          } catch {
            // keep status message
          }
          throw new Error(detail);
        }
        const data = (await res.json()) as AskResponse;

        setCards((prev) => {
          const additions: StoredCard[] = [];
          for (const chart of data.charts) {
            const layout = nextLayoutPosition([...prev, ...additions]);
            const id = `${Date.now()}-${chart.spec.id}-${Math.random()
              .toString(36)
              .slice(2, 7)}`;
            additions.push({
              id,
              // Re-id the spec so /api/chart series yields stay unique per card.
              spec: { ...chart.spec, id },
              originQuery: data.query,
              layout,
            });
          }
          const next = [...prev, ...additions];
          persist(next);
          return next;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unbekannter Fehler");
      } finally {
        setPending(false);
      }
    },
    [persist],
  );

  const handleRemove = useCallback(
    (id: string) => {
      setCards((prev) => {
        const next = prev.filter((c) => c.id !== id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const handleBreakpointChange = useCallback((breakpoint: string) => {
    breakpointRef.current = breakpoint;
  }, []);

  const handleLayoutChange = useCallback(
    (current: Layout) => {
      // Only persist edits made on the canonical wide breakpoint; ignore the
      // auto-reflow RGL emits when a narrower breakpoint stacks the cards.
      if (breakpointRef.current !== "lg") return;

      const byId = new Map(current.map((l) => [l.i, l]));
      setCards((prev) => {
        let changed = false;
        const next = prev.map((c) => {
          const l = byId.get(c.id);
          if (!l) return c;
          if (
            l.x === c.layout.x &&
            l.y === c.layout.y &&
            l.w === c.layout.w &&
            l.h === c.layout.h
          ) {
            return c;
          }
          changed = true;
          return { ...c, layout: { x: l.x, y: l.y, w: l.w, h: l.h } };
        });
        if (changed) persist(next);
        return next;
      });
    },
    [persist],
  );

  // Empty state: centered hero search box only.
  if (cards.length === 0) {
    return (
      <div ref={containerRef} className="w-full">
        <SearchBox
          variant="hero"
          onSubmit={handleSubmit}
          pending={pending}
          error={error}
        />
      </div>
    );
  }

  const layoutItems = toLayoutItems(cards);
  const layouts: ResponsiveLayouts = {
    lg: layoutItems,
    md: layoutItems,
    sm: layoutItems,
    xs: layoutItems,
    xxs: layoutItems,
  };

  return (
    <div ref={containerRef} className="w-full">
      <SearchBox
        variant="bar"
        onSubmit={handleSubmit}
        pending={pending}
        error={error}
      />
      {ready && (
        <ResponsiveGridLayout
          className="layout"
          width={width}
          layouts={layouts}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          margin={[16, 16]}
          containerPadding={[0, 0]}
          dragConfig={{ handle: ".card-drag-handle" }}
          resizeConfig={{ handles: ["se", "sw", "e", "s"] }}
          onBreakpointChange={handleBreakpointChange}
          onLayoutChange={handleLayoutChange}
        >
          {cards.map((card) => (
            <div key={card.id} className="flex">
              <ChartCard
                spec={card.spec}
                originQuery={card.originQuery}
                onRemove={() => handleRemove(card.id)}
              />
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
