"use client";

import { useCallback, useRef } from "react";
import {
  ResponsiveGridLayout,
  type Breakpoints,
  type Layout,
  type LayoutItem,
  type ResponsiveLayouts,
} from "react-grid-layout";

import { ChartCard } from "@/components/cards/chart-card";
import { SectionDivider } from "@/components/section-divider";
import type { CardBox, PinnedCard } from "@/lib/query-spec";

/**
 * The GLOBAL pinned-cards section (spec-05 §7, section 4). A separate grid below
 * the private cards, above the permanent dashboard. Pinned cards keep only Unpin
 * (no delete/regenerate), but — spec-08 — are now **draggable + resizable**, and
 * the arrangement is persisted GLOBALLY (server-side `data/pinned.json`) via the
 * `onLayoutChange` callback. Only `lg`-breakpoint edits persist (narrower
 * breakpoints auto-stack and would clobber the canonical wide layout).
 *
 * Renders nothing when there are no pins (no empty section / divider).
 */

const COLS: Breakpoints = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
const BREAKPOINTS: Breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const ROW_HEIGHT = 48;
const MIN = { minW: 3, minH: 4 };

export function PinnedGrid({
  cards,
  width,
  ready,
  onUnpin,
  onLayoutChange,
}: {
  cards: PinnedCard[];
  width: number;
  ready: boolean;
  onUnpin: (id: string) => void;
  /** Persist a drag/resize edit (spec-08): the new box per card. */
  onLayoutChange: (updates: { id: string; layout: CardBox }[]) => void;
}) {
  // Only persist edits made on the canonical wide (`lg`) breakpoint.
  const breakpointRef = useRef<string>("lg");
  const handleBreakpointChange = useCallback((bp: string) => {
    breakpointRef.current = bp;
  }, []);

  // Persist on layout change. Stability (spec-11): the parent GUARDS this against
  // mount/pin/unpin re-renders (a `mutating` flag) so only a real USER drag/resize
  // is saved — RGL's mount/programmatic onLayoutChange can't clobber the stored
  // arrangement. (We keep the default compactor: with it the drag/resize layout
  // RGL reports is the committed one — noCompactor made onLayoutChange report the
  // pre-drag layout, so edits silently didn't persist.) Only `lg` is canonical.
  const handleLayoutChange = useCallback(
    (current: Layout) => {
      if (breakpointRef.current !== "lg") return;
      onLayoutChange(
        current.map((l) => ({
          id: l.i,
          layout: { x: l.x, y: l.y, w: l.w, h: l.h },
        })),
      );
    },
    [onLayoutChange],
  );

  if (cards.length === 0) return null;

  const layoutItems: LayoutItem[] = cards.map((c) => ({
    i: c.id,
    x: c.layout.x,
    y: c.layout.y,
    w: c.layout.w,
    h: c.layout.h,
    minW: MIN.minW,
    minH: MIN.minH,
  }));
  const layouts: ResponsiveLayouts = {
    lg: layoutItems,
    md: layoutItems,
    sm: layoutItems,
    xs: layoutItems,
    xxs: layoutItems,
  };

  return (
    <>
      <SectionDivider label="Angepinnt" />
      {ready && width > 0 && (
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
                pinned
                onUnpin={() => onUnpin(card.id)}
              />
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </>
  );
}
