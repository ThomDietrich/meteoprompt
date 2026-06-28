"use client";

import { useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { deNum } from "@/components/charts/chart-base";
import type { ResolvedSeries } from "@/lib/query-spec";

/**
 * spec-06 B) — Tabellen-Card renderer. TanStack Table (+ react-virtual) over the
 * resolved series, shadcn-styled, with sortable columns and row virtualization
 * for large datasets. Columns are: a time column + one value column per series,
 * joined on the timestamp so multi-series (comparison) tables line up. Numbers
 * are German-formatted with the series unit; the time column is a localized DE
 * date/time. Used ONLY when Claude picks chart:"table" (explicit request or a
 * few discrete values) — see claude.ts + chart-catalog.ts.
 */

/** One joined table row: a timestamp key + the value of each series at that time. */
interface TableRow {
  t: string;
  /** seriesId → value (may be undefined if a series has no point at this time). */
  values: Record<string, number | undefined>;
}

/** Localized DE date+time for the time column. */
function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Join all series on their timestamps into one row per distinct time. Each row
 * carries the value of every series at that time (sparse — a series missing a
 * point at that time leaves a gap). Rows start in chronological order; sorting is
 * handled by the table.
 */
function buildRows(series: ResolvedSeries[]): TableRow[] {
  const byTime = new Map<string, TableRow>();
  for (const s of series) {
    for (const p of s.points) {
      let row = byTime.get(p.t);
      if (!row) {
        row = { t: p.t, values: {} };
        byTime.set(p.t, row);
      }
      row.values[s.id] = p.v;
    }
  }
  return [...byTime.values()].sort((a, b) => a.t.localeCompare(b.t));
}

export function TableCard({ series }: { series: ResolvedSeries[] }) {
  const rows = useMemo(() => buildRows(series), [series]);

  const columns = useMemo<ColumnDef<TableRow>[]>(() => {
    const cols: ColumnDef<TableRow>[] = [
      {
        id: "t",
        header: "Zeitpunkt",
        accessorFn: (row) => row.t,
        cell: (ctx) => fmtTime(ctx.getValue<string>()),
        sortingFn: "alphanumeric",
      },
    ];
    for (const s of series) {
      const unit = s.unit ? ` ${s.unit}` : "";
      cols.push({
        id: s.id,
        header: s.unit ? `${s.label} (${s.unit})` : s.label,
        accessorFn: (row) => row.values[s.id],
        cell: (ctx) => {
          const v = ctx.getValue<number | undefined>();
          return v == null ? "–" : `${deNum(v)}${unit}`;
        },
        // Numeric sort; undefined values sort last.
        sortUndefined: "last",
        sortingFn: "basic",
      });
    }
    return cols;
  }, [series]);

  // Default sort: newest first (time descending) — most-recent-on-top reads well.
  const [sorting, setSorting] = useState<SortingState>([
    { id: "t", desc: true },
  ]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tableRows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 12,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - virtualRows[virtualRows.length - 1].end
      : 0;

  if (rows.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Keine Daten im gewählten Zeitraum.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="h-full w-full overflow-auto rounded-md border border-black/10 dark:border-white/10"
    >
      <table className="w-full border-collapse text-xs tabular-nums">
        <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur dark:bg-slate-900/95">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-black/10 dark:border-white/10">
              {hg.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    className="select-none px-2 py-1.5 text-left font-semibold text-slate-600 dark:text-slate-300"
                  >
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="flex items-center gap-1 hover:text-brand-blue dark:hover:text-sky-400"
                      title="Spalte sortieren"
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {sorted === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : sorted === "desc" ? (
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden>
              <td style={{ height: paddingTop }} colSpan={columns.length} />
            </tr>
          )}
          {virtualRows.map((vr) => {
            const row = tableRows[vr.index];
            return (
              <tr
                key={row.id}
                className="border-b border-black/5 last:border-0 odd:bg-black/[0.015] dark:border-white/5 dark:odd:bg-white/[0.02]"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-2 py-1 text-slate-700 dark:text-slate-200">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden>
              <td style={{ height: paddingBottom }} colSpan={columns.length} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
