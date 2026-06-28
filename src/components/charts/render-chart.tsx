"use client";

import type EChartsReact from "echarts-for-react";

import { LineChart } from "@/components/charts/line-chart";
import { BarsChart } from "@/components/charts/bars-chart";
import { WindRose } from "@/components/charts/wind-rose";
import { CandlestickChart } from "@/components/charts/candlestick-chart";
import { RangeBandChart } from "@/components/charts/range-band-chart";
import { BarRangeChart } from "@/components/charts/bar-range-chart";
import { ScatterChart } from "@/components/charts/scatter-chart";
import { CalendarHeatmap } from "@/components/charts/calendar-heatmap";
import { HourDayHeatmap } from "@/components/charts/hourday-heatmap";
import { GaugeChart } from "@/components/charts/gauge-chart";
import { BoxplotChart } from "@/components/charts/boxplot-chart";
import { RadarChart } from "@/components/charts/radar-chart";
import { ViolinChart } from "@/components/charts/violin-chart";
import { ThemeRiverChart } from "@/components/charts/theme-river-chart";
import { TableCard } from "@/components/charts/table-card";
import { ShowerBarsChart } from "@/components/charts/shower-bars-chart";
import type {
  ChartSpec,
  ResolvedAnswer,
  ResolvedSeries,
} from "@/lib/query-spec";

/**
 * Single source of truth for the chart-type → renderer switch. Used by both the
 * user ChartCard and the permanent dashboard so every type renders identically.
 * An optional `answer` lets an extreme answer place a markPoint on the line.
 */
export function renderChart(
  spec: ChartSpec,
  series: ResolvedSeries[],
  chartRef: React.Ref<EChartsReact>,
  answer?: ResolvedAnswer,
) {
  switch (spec.chart) {
    case "bars":
      return <BarsChart ref={chartRef} series={series} />;
    case "windrose":
      return <WindRose ref={chartRef} series={series} />;
    case "candlestick":
      return <CandlestickChart ref={chartRef} series={series} />;
    case "rangeBand":
      return <RangeBandChart ref={chartRef} series={series} />;
    case "barRange":
      return <BarRangeChart ref={chartRef} series={series} />;
    case "scatter":
      return <ScatterChart ref={chartRef} series={series} />;
    case "heatmapCalendar":
      return <CalendarHeatmap ref={chartRef} series={series} />;
    case "heatmapHourDay":
      return <HourDayHeatmap ref={chartRef} series={series} />;
    case "gauge":
      return <GaugeChart ref={chartRef} series={series} />;
    case "boxplot":
      return <BoxplotChart ref={chartRef} series={series} />;
    case "radar":
      return <RadarChart ref={chartRef} series={series} />;
    case "violin":
      return <ViolinChart ref={chartRef} series={series} />;
    case "themeRiver":
      return <ThemeRiverChart ref={chartRef} series={series} />;
    case "table":
      // Tabellen-Card (spec-06 B): TanStack Table, no ECharts ref needed.
      return <TableCard series={series} />;
    case "showerBars":
      // spec-07: one bar per sessionized rain event, custom tooltip.
      return <ShowerBarsChart ref={chartRef} series={series} />;
    case "line":
    default: {
      // An extreme answer with a timestamp → highlight it on the line.
      const extreme =
        answer?.kind === "extreme" && answer.value != null && answer.t
          ? {
              t: answer.t,
              value: answer.value,
              unit: answer.unit,
              label: answer.label,
            }
          : undefined;
      return <LineChart ref={chartRef} series={series} extreme={extreme} />;
    }
  }
}

/**
 * Whether a ready chart should be treated as "empty". Most types use `points`;
 * the shaped types carry their data in `shaped`, so check both.
 */
export function isChartEmpty(series: ResolvedSeries[]): boolean {
  if (series.length === 0) return true;
  return series.every((s) => {
    if (s.points.length > 0) return false;
    const shaped = s.shaped;
    if (!shaped) return true;
    switch (shaped.shape) {
      case "ohlc":
        return shaped.ohlc.length === 0;
      case "band":
        return shaped.band.length === 0;
      case "xy":
        return shaped.pairs.length === 0;
      case "calendar":
        return shaped.calendar.length === 0;
      case "matrix":
        return shaped.matrix.length === 0;
      case "scalar":
        return shaped.scalar == null;
      case "distribution":
        return shaped.groups.every((g) => g.values.length === 0);
      case "showers":
        return shaped.showers.length === 0;
      default:
        return true;
    }
  });
}
