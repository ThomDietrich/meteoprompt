"use client";

import { useCallback, useState } from "react";
import {
  ResponsiveGridLayout,
  useContainerWidth,
  type Breakpoints,
  type Layout,
  type LayoutItem,
  type ResponsiveLayouts,
} from "react-grid-layout";

import { TemperatureCard } from "@/components/charts/temperature-card";

const STORAGE_KEY = "wetter-chat:layouts:v1";

// One card for Iteration 1. Reasonable default size; min size keeps the
// chart legible.
const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: "outdoor-temperature", x: 0, y: 0, w: 6, h: 8, minW: 3, minH: 4 },
];

const DEFAULT_LAYOUTS: ResponsiveLayouts = {
  lg: DEFAULT_LAYOUT,
  md: DEFAULT_LAYOUT,
  sm: DEFAULT_LAYOUT,
  xs: DEFAULT_LAYOUT,
  xxs: DEFAULT_LAYOUT,
};

const COLS: Breakpoints = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
const BREAKPOINTS: Breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };

function loadLayouts(): ResponsiveLayouts {
  if (typeof window === "undefined") return DEFAULT_LAYOUTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUTS;
    return JSON.parse(raw) as ResponsiveLayouts;
  } catch {
    return DEFAULT_LAYOUTS;
  }
}

export default function DashboardGrid() {
  // v2 dropped the WidthProvider HOC; useContainerWidth measures the wrapper.
  const { width, containerRef, mounted } = useContainerWidth();

  // Lazy init so the first paint already reflects any persisted layout.
  const [layouts, setLayouts] = useState<ResponsiveLayouts>(() =>
    loadLayouts(),
  );

  const handleLayoutChange = useCallback(
    (_current: Layout, allLayouts: ResponsiveLayouts) => {
      setLayouts(allLayouts);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(allLayouts));
      } catch {
        // localStorage unavailable (private mode / quota) — non-fatal.
      }
    },
    [],
  );

  return (
    <div ref={containerRef} className="w-full">
      {mounted && (
        <ResponsiveGridLayout
          className="layout"
          width={width}
          layouts={layouts}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={48}
          margin={[16, 16]}
          containerPadding={[0, 0]}
          dragConfig={{ handle: ".card-drag-handle" }}
          resizeConfig={{ handles: ["se", "sw", "e", "s"] }}
          onLayoutChange={handleLayoutChange}
        >
          <div key="outdoor-temperature" className="flex">
            <TemperatureCard />
          </div>
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
