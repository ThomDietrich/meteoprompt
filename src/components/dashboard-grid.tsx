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
import { SkeletonCard } from "@/components/cards/skeleton-card";
import { PinnedGrid } from "@/components/pinned-grid";
import { SearchBox } from "@/components/search-box";
import {
  loadCards,
  saveCards,
  type CardLayout,
  type StoredCard,
} from "@/lib/card-store";
import { assignSeriesColors } from "@/lib/colors";
import type { AskResponse, ChartSpec, PinnedCard } from "@/lib/query-spec";

/** A transient skeleton placeholder shown while /api/ask is in flight. */
interface PendingCard {
  id: string;
  originQuery: string;
  layout: CardLayout;
}

/**
 * Give a chart's series persisted random colours (spec-04 §5). `avoid` biases a
 * regenerate away from the previous colours so a re-roll looks different.
 */
function colorizeSpec(spec: ChartSpec, avoid: readonly string[] = []): ChartSpec {
  return { ...spec, series: assignSeriesColors(spec.series, avoid) };
}

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

/** A top-of-grid layout box (new cards are prepended, spec correction §6). */
function topLayout(): CardLayout {
  return { x: 0, y: 0, w: DEFAULT_SIZE.w, h: DEFAULT_SIZE.h };
}

/** Shift every existing card down by `rows` so new top cards have room. */
function shiftDown<T extends { layout: CardLayout }>(cards: T[], rows: number): T[] {
  return cards.map((c) => ({ ...c, layout: { ...c.layout, y: c.layout.y + rows } }));
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
  const [pendingCards, setPendingCards] = useState<PendingCard[]>([]);
  const [pinnedCards, setPinnedCards] = useState<PinnedCard[]>([]);
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the active responsive breakpoint. We only persist layout edits made on
  // the widest (`lg`) breakpoint — narrower breakpoints auto-stack cards (w6 fills
  // 6-col `sm`), and persisting that would clobber the canonical wide arrangement.
  const breakpointRef = useRef<string>("lg");

  // When WE mutate the card set (add/prepend/regenerate/remove), react-grid-layout
  // fires onLayoutChange with its own freshly-(re)compacted layout — which can
  // place a just-added card at the BOTTOM, clobbering our intended prepend. Ignore
  // onLayoutChange during such a programmatic mutation; only user drags/resizes
  // (which happen when this flag is false) should persist. Cleared on the next tick.
  const mutatingRef = useRef(false);
  const mutationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beginMutation = useCallback(() => {
    mutatingRef.current = true;
    // Release after RGL has committed the new children and emitted its sync
    // onLayoutChange(s). A short delay covers the re-render + layout effect; well
    // within "instant" but long enough to swallow RGL's re-compaction callback.
    if (mutationTimer.current) clearTimeout(mutationTimer.current);
    mutationTimer.current = setTimeout(() => {
      mutatingRef.current = false;
      mutationTimer.current = null;
    }, 80);
  }, []);

  // Rehydrate PRIVATE cards from localStorage after mount (client-only).
  useEffect(() => {
    setCards(loadCards());
  }, []);

  // Fetch GLOBAL pinned cards on every load (spec-05 §7) — visible to everyone.
  const refreshPinned = useCallback(async () => {
    try {
      const res = await fetch("/api/pinned");
      if (!res.ok) return;
      const data = (await res.json()) as { cards?: PinnedCard[] };
      setPinnedCards(Array.isArray(data.cards) ? data.cards : []);
    } catch {
      // Network/store error → leave pins empty; non-fatal.
    }
  }, []);

  useEffect(() => {
    refreshPinned();
  }, [refreshPinned]);

  const persist = useCallback((next: StoredCard[]) => {
    saveCards(next);
  }, []);

  // Pin a PRIVATE card → move it to the GLOBAL set (no duplicate): POST to
  // /api/pinned, remove from localStorage, refresh the pinned list (spec-05 §7).
  const handlePin = useCallback(
    async (id: string) => {
      const card = cards.find((c) => c.id === id);
      if (!card) return;
      try {
        const res = await fetch("/api/pinned", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: card.id,
            spec: card.spec,
            originQuery: card.originQuery,
            layout: card.layout,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Remove from the private (local) set so it isn't shown twice.
        setCards((prev) => {
          const next = prev.filter((c) => c.id !== id);
          persist(next);
          return next;
        });
        await refreshPinned();
      } catch (e) {
        setError(e instanceof Error ? `Anpinnen fehlgeschlagen: ${e.message}` : "Anpinnen fehlgeschlagen");
      }
    },
    [cards, persist, refreshPinned],
  );

  // Unpin a GLOBAL card → remove it from the server set (default: it disappears).
  const handleUnpin = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/pinned/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await refreshPinned();
      } catch (e) {
        setError(e instanceof Error ? `Lösen fehlgeschlagen: ${e.message}` : "Lösen fehlgeschlagen");
      }
    },
    [refreshPinned],
  );

  // Submit free text → show a skeleton immediately → /api/ask → replace the
  // skeleton with the returned card(s), or remove it and surface the error.
  const handleSubmit = useCallback(
    async (query: string) => {
      setPending(true);
      setError(null);

      // Insert a skeleton placeholder right away at the TOP (spec correction §6).
      const skeletonId = `skeleton-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;
      beginMutation();
      setPendingCards((prev) => [
        { id: skeletonId, originQuery: query, layout: topLayout() },
        ...prev,
      ]);

      const dropSkeleton = () =>
        setPendingCards((prev) => prev.filter((p) => p.id !== skeletonId));

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

        // Replace the skeleton with the real cards, PREPENDED to the top.
        // Flag the mutation so RGL's sync onLayoutChange doesn't clobber y:0.
        beginMutation();
        dropSkeleton();
        setCards((prev) => {
          const additions: StoredCard[] = [];
          let yCursor = 0;
          for (const chart of data.charts) {
            const id = `${Date.now()}-${chart.spec.id}-${Math.random()
              .toString(36)
              .slice(2, 7)}`;
            // Stack the new cards two-per-row at the top.
            const even = additions.length % 2 === 0;
            const x = even ? 0 : DEFAULT_SIZE.w;
            additions.push({
              id,
              // Re-id the spec (unique /api/chart yields) + assign random colours.
              spec: colorizeSpec({ ...chart.spec, id }),
              originQuery: data.query,
              layout: { x, y: yCursor, w: DEFAULT_SIZE.w, h: DEFAULT_SIZE.h },
            });
            if (!even) yCursor += DEFAULT_SIZE.h; // advance a row after each pair
          }
          // Push existing cards below the freshly added block, then prepend.
          const blockRows =
            Math.ceil(additions.length / 2) * DEFAULT_SIZE.h;
          const next = [...additions, ...shiftDown(prev, blockRows)];
          persist(next);
          return next;
        });
      } catch (e) {
        dropSkeleton();
        setError(e instanceof Error ? e.message : "Unbekannter Fehler");
      } finally {
        setPending(false);
      }
    },
    [persist, cards, beginMutation],
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

  // "Neu erstellen" (spec-04 §5b): re-POST the card's origin query with a nudge
  // toward a DIFFERENT fitting chart type, then replace the card's spec in place
  // (same grid slot + layout) with new colours. Shows a skeleton while loading.
  const handleRegenerate = useCallback(
    async (id: string) => {
      const card = cards.find((c) => c.id === id);
      if (!card) return;

      setRegeneratingIds((prev) => new Set(prev).add(id));
      const clearFlag = () =>
        setRegeneratingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q: card.originQuery,
            currentChart: card.spec.chart,
          }),
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
        const first = data.charts[0];
        if (!first) throw new Error("Keine neue Darstellung erhalten.");

        const avoid = card.spec.series
          .map((s) => s.color)
          .filter(Boolean) as string[];

        setCards((prev) => {
          const next = prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  // Keep id + layout; swap in the new (recoloured) spec.
                  spec: colorizeSpec({ ...first.spec, id }, avoid),
                }
              : c,
          );
          persist(next);
          return next;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Neu erstellen fehlgeschlagen");
      } finally {
        clearFlag();
      }
    },
    [cards, persist],
  );

  const handleBreakpointChange = useCallback((breakpoint: string) => {
    breakpointRef.current = breakpoint;
  }, []);

  const handleLayoutChange = useCallback(
    (current: Layout) => {
      // Ignore the onLayoutChange RGL fires while WE are mutating the card set
      // (add/prepend/regenerate/remove) — that is RGL's own re-compaction, not a
      // user edit, and adopting it would clobber the intended prepend position.
      if (mutatingRef.current) return;
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

  // Empty state: centered hero search box only — but keep showing it while a
  // first skeleton is pending so the placeholder appears, and the hero shows
  // any error (errors must be visible in every state, spec §7).
  if (cards.length === 0 && pendingCards.length === 0) {
    return (
      <div ref={containerRef} className="w-full">
        <SearchBox
          variant="hero"
          onSubmit={handleSubmit}
          pending={pending}
          error={error}
        />
        {/* Global pins still show for a fresh visitor with no private cards. */}
        <PinnedGrid
          cards={pinnedCards}
          width={width}
          ready={ready}
          onUnpin={handleUnpin}
        />
      </div>
    );
  }

  // Layout items for real cards + transient skeletons. Skeletons sit at the TOP
  // (each at y:0, stacked) and the real cards are shifted DOWN by the skeleton
  // block height in the live layout — so a pending card visibly prepends in the
  // same render (no collision, no reload). Skeletons are static + never persisted.
  const skeletonRows = pendingCards.length * DEFAULT_SIZE.h;
  const layoutItems: LayoutItem[] = [
    ...toLayoutItems(cards).map((l) => ({ ...l, y: l.y + skeletonRows })),
    ...pendingCards.map((p, idx) => ({
      i: p.id,
      x: 0,
      y: idx * DEFAULT_SIZE.h,
      w: DEFAULT_SIZE.w,
      h: DEFAULT_SIZE.h,
      minW: DEFAULT_SIZE.minW,
      minH: DEFAULT_SIZE.minH,
      static: true,
    })),
  ];
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
          {cards.map((card) =>
            regeneratingIds.has(card.id) ? (
              <div key={card.id} className="flex">
                <SkeletonCard originQuery={card.originQuery} />
              </div>
            ) : (
              <div key={card.id} className="flex">
                <ChartCard
                  spec={card.spec}
                  originQuery={card.originQuery}
                  onRemove={() => handleRemove(card.id)}
                  onRegenerate={() => handleRegenerate(card.id)}
                  onPin={() => handlePin(card.id)}
                  regenerating={false}
                />
              </div>
            ),
          )}
          {pendingCards.map((p) => (
            <div key={p.id} className="flex">
              <SkeletonCard originQuery={p.originQuery} />
            </div>
          ))}
        </ResponsiveGridLayout>
      )}

      {/* Section 4: global pinned cards, below the private grid. */}
      <PinnedGrid
        cards={pinnedCards}
        width={width}
        ready={ready}
        onUnpin={handleUnpin}
      />
    </div>
  );
}
