import { describe, expect, it } from "vitest";

import { seriesToCsv } from "@/lib/csv";
import type { ResolvedSeries, SeriesPoint } from "@/lib/query-spec";

const series = (over: Partial<ResolvedSeries>): ResolvedSeries => ({
  id: "s",
  label: "Temp",
  unit: "°C",
  points: [],
  ...over,
});

describe("seriesToCsv", () => {
  it("sorts points ascending, uses dot decimals + CRLF + a labelled header", () => {
    const csv = seriesToCsv([
      series({
        points: [
          { t: "2020-01-02T00:00:00Z", v: 2.5 },
          { t: "2020-01-01T00:00:00Z", v: 1.5 },
        ],
      }),
    ]);
    expect(csv).toBe(
      "time,Temp (°C)\r\n2020-01-01T00:00:00Z,1.5\r\n2020-01-02T00:00:00Z,2.5",
    );
    // Explicit sub-property checks the exact string already covers:
    expect(csv).toContain("\r\n"); // CRLF line endings
    expect(csv).toContain("1.5"); // dot decimal, not a comma
    expect(csv.split("\r\n")[0]).toBe("time,Temp (°C)"); // header
  });

  it("quotes a header label that contains a comma", () => {
    const csv = seriesToCsv([
      series({
        label: "Temp, außen",
        points: [{ t: "2020-01-01T00:00:00Z", v: 1 }],
      }),
    ]);
    expect(csv.split("\r\n")[0]).toBe('time,"Temp, außen (°C)"');
  });

  it("expands an OHLC shaped series into open/high/low/close columns", () => {
    const csv = seriesToCsv([
      series({
        points: [],
        shaped: {
          shape: "ohlc",
          ohlc: [
            { t: "2020-01-01T00:00:00Z", open: 1, high: 5, low: 0, close: 3 },
          ],
        },
      }),
    ]);
    const [header, row] = csv.split("\r\n");
    expect(header).toBe(
      "time,Temp (°C) open,Temp (°C) high,Temp (°C) low,Temp (°C) close",
    );
    expect(row).toBe("2020-01-01T00:00:00Z,1,5,0,3");
  });

  it("renders a null value as an empty field", () => {
    const csv = seriesToCsv([
      series({
        points: [
          { t: "2020-01-01T00:00:00Z", v: null } as unknown as SeriesPoint,
        ],
      }),
    ]);
    expect(csv.split("\r\n")[1]).toBe("2020-01-01T00:00:00Z,");
  });
});
