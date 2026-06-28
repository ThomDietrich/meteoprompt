"use client";

import type { ResolvedSeries, ShapedData } from "@/lib/query-spec";

/**
 * spec-06 D) — client-side CSV export of a card's resolved data points.
 *
 * Builds CSV from the ALREADY-LOADED ResolvedSeries (no endpoint). For machine
 * re-use the timestamp is ISO and the decimal separator is a DOT (not the German
 * comma used in the UI). Columns are: a `time` column + one value column per
 * series, joined on the timestamp. Charts whose data lives in `shaped` (no
 * `points`) are flattened to the most meaningful per-row value(s) so a download
 * still carries data (e.g. candlestick → low/high columns). Triggers a browser
 * download named from the card title + range.
 */

/** RFC-4180-ish field escaping: quote when the field has a comma/quote/newline. */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** A dot-decimal numeric string (machine format), or empty for null/undefined. */
function num(v: number | undefined | null): string {
  return v == null ? "" : String(v);
}

/** Header label for a series column (label + unit, unit in parens). */
function seriesHeader(s: ResolvedSeries): string {
  return s.unit ? `${s.label} (${s.unit})` : s.label;
}

/**
 * Expand a shaped-only series into named sub-columns keyed by timestamp. Returns
 * the extra header names and a per-time lookup of each sub-column's value. Used
 * when a series carries no `points` (candlestick/rangeBand/scatter/…).
 */
function shapedColumns(
  s: ResolvedSeries,
  shaped: ShapedData,
): { headers: string[]; byTime: Map<string, Record<string, number>> } {
  const base = seriesHeader(s);
  const byTime = new Map<string, Record<string, number>>();
  const put = (t: string, key: string, v: number) => {
    const row = byTime.get(t) ?? {};
    row[key] = v;
    byTime.set(t, row);
  };

  switch (shaped.shape) {
    case "ohlc": {
      const headers = [`${base} open`, `${base} high`, `${base} low`, `${base} close`];
      for (const p of shaped.ohlc) {
        put(p.t, headers[0], p.open);
        put(p.t, headers[1], p.high);
        put(p.t, headers[2], p.low);
        put(p.t, headers[3], p.close);
      }
      return { headers, byTime };
    }
    case "band": {
      const headers = [`${base} low`, `${base} high`];
      for (const p of shaped.band) {
        put(p.t, headers[0], p.low);
        put(p.t, headers[1], p.high);
      }
      return { headers, byTime };
    }
    case "calendar": {
      const headers = [base];
      for (const p of shaped.calendar) put(p.date, base, p.value);
      return { headers, byTime };
    }
    default:
      // xy/matrix/scalar/distribution have no natural per-time row → handled by
      // the no-time fallback below (rare for tables/exports of these types).
      return { headers: [], byTime };
  }
}

/** Generate the CSV text for a set of resolved series. */
export function seriesToCsv(series: ResolvedSeries[]): string {
  // Time-keyed join across every series (and any time-keyed shaped columns).
  const headers: string[] = ["time"];
  const rowsByTime = new Map<string, Record<string, string>>();
  const ensure = (t: string) => {
    let row = rowsByTime.get(t);
    if (!row) {
      row = { time: t };
      rowsByTime.set(t, row);
    }
    return row;
  };

  for (const s of series) {
    if (s.points.length > 0) {
      const header = seriesHeader(s);
      headers.push(header);
      for (const p of s.points) ensure(p.t)[header] = num(p.v);
    } else if (s.shaped) {
      const { headers: extra, byTime } = shapedColumns(s, s.shaped);
      headers.push(...extra);
      for (const [t, vals] of byTime) {
        const row = ensure(t);
        for (const [k, v] of Object.entries(vals)) row[k] = num(v);
      }
    }
  }

  const times = [...rowsByTime.keys()].sort();
  const lines = [headers.map(csvField).join(",")];
  for (const t of times) {
    const row = rowsByTime.get(t)!;
    lines.push(headers.map((h) => csvField(row[h] ?? "")).join(","));
  }
  return lines.join("\r\n");
}

/** Slugify a card title + range into a safe filename stem. */
function filenameStem(title: string, series: ResolvedSeries[]): string {
  const times = series
    .flatMap((s) => s.points.map((p) => p.t))
    .sort();
  const from = times[0]?.slice(0, 10);
  const to = times[times.length - 1]?.slice(0, 10);
  const slug = title
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" })[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const stem = slug || "export";
  const range = from && to ? `_${from}_${to}` : "";
  return `${stem}${range}`;
}

/**
 * Build a CSV from the loaded series and trigger a browser download. Filename is
 * derived from the card title + the data's date range. Prepends a UTF-8 BOM so
 * Excel reads German/umlaut headers correctly.
 */
export function downloadSeriesCsv(
  title: string,
  series: ResolvedSeries[],
): void {
  if (typeof window === "undefined") return;
  const csv = seriesToCsv(series);
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameStem(title, series)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation so the download has a moment to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
