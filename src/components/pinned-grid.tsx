"use client";

import {
  ResponsiveGridLayout,
  type Breakpoints,
  type LayoutItem,
  type ResponsiveLayouts,
} from "react-grid-layout";

import { ChartCard } from "@/components/cards/chart-card";
import { SectionDivider } from "@/components/section-divider";
import type { PinnedCard } from "@/lib/query-spec";

/**
 * The GLOBAL pinned-cards section (spec-05 §7, section 4). A separate grid below
 * the private cards, above the permanent dashboard. Pinned cards are fixed:
 * only Unpin (no delete/regenerate). Local moves are view-only — not persisted
 * back to the global layout (kept simple here: the grid is non-draggable so the
 * global layout from data/pinned.json is shown consistently to everyone).
 *
 * Renders nothing when there are no pins (no empty section / divider).
 */

const COLS: Breakpoints = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
const BREAKPOINTS: Breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const ROW_HEIGHT = 48;
const DEFAULT_SIZE = { w: 6, h: 8, minW: 3, minH: 4 };

export function PinnedGrid({
  cards,
  width,
  ready,
  onUnpin,
}: {
  cards: PinnedCard[];
  width: number;
  ready: boolean;
  onUnpin: (id: string) => void;
}) {
  if (cards.length === 0) return null;

  const layoutItems: LayoutItem[] = cards.map((c) => ({
    i: c.id,
    x: c.layout.x,
    y: c.layout.y,
    w: c.layout.w,
    h: c.layout.h,
    minW: DEFAULT_SIZE.minW,
    minH: DEFAULT_SIZE.minH,
    static: true, // global layout is fixed/consistent for all visitors
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
