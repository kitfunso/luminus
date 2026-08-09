import { describe, expect, it } from "vitest";
import { extractSeriesPoints, resolutionToMinutes } from "./entsoe-timeseries.js";

describe("resolutionToMinutes", () => {
  it("parses common ENTSO-E resolutions", () => {
    expect(resolutionToMinutes("PT15M")).toBe(15);
    expect(resolutionToMinutes("PT30M")).toBe(30);
    expect(resolutionToMinutes("PT60M")).toBe(60);
    expect(resolutionToMinutes("PT1H")).toBe(60);
    expect(resolutionToMinutes("P1D")).toBe(1440);
    expect(resolutionToMinutes(undefined)).toBe(0);
    expect(resolutionToMinutes("bogus")).toBe(0);
  });
});

describe("extractSeriesPoints", () => {
  it("forward-fills omitted A03 step-curve positions to the full period", () => {
    // 24h at PT15M = 96 slots; only 3 explicit points (step curve).
    const doc = {
      TimeSeries: [
        {
          Period: [
            {
              timeInterval: { start: "2026-08-01T00:00Z", end: "2026-08-02T00:00Z" },
              resolution: "PT15M",
              curveType: "A03",
              Point: [
                { position: "1", "imbalance_Price.amount": "50.0" },
                { position: "10", "imbalance_Price.amount": "75.5" },
                { position: "90", "imbalance_Price.amount": "-12.25" },
              ],
            },
          ],
        },
      ],
    };

    const points = extractSeriesPoints(doc, ["imbalance_Price.amount"]);
    expect(points).toHaveLength(96);
    expect(points[0]).toEqual({ period: 1, value: 50.0 });
    expect(points[8]).toEqual({ period: 9, value: 50.0 }); // filled from position 1
    expect(points[9]).toEqual({ period: 10, value: 75.5 });
    expect(points[88]).toEqual({ period: 89, value: 75.5 }); // filled from position 10
    expect(points[89]).toEqual({ period: 90, value: -12.25 });
    expect(points[95]).toEqual({ period: 96, value: -12.25 }); // filled to period end
  });

  it("numbers positions continuously across multiple periods", () => {
    const doc = {
      TimeSeries: [
        {
          Period: [
            {
              timeInterval: { start: "2026-08-01T00:00Z", end: "2026-08-01T12:00Z" },
              resolution: "PT15M",
              Point: [{ position: "1", "price.amount": "10" }],
            },
            {
              timeInterval: { start: "2026-08-01T12:00Z", end: "2026-08-02T00:00Z" },
              resolution: "PT15M",
              Point: [{ position: "1", "price.amount": "20" }],
            },
          ],
        },
      ],
    };

    const points = extractSeriesPoints(doc, ["price.amount"]);
    expect(points).toHaveLength(96);
    expect(points[47]).toEqual({ period: 48, value: 10 });
    expect(points[48]).toEqual({ period: 49, value: 20 });
  });

  it("skips points carrying none of the value keys instead of coercing to 0", () => {
    const doc = {
      TimeSeries: [
        {
          Period: [
            {
              timeInterval: { start: "2026-08-01T00:00Z", end: "2026-08-01T01:00Z" },
              resolution: "PT15M",
              Point: [
                { position: "1", quantity: "999" }, // a volume, not a price
                { position: "2", "imbalance_Price.amount": "42" },
              ],
            },
          ],
        },
      ],
    };

    const points = extractSeriesPoints(doc, ["imbalance_Price.amount", "price.amount"]);
    // Position 1 has no price key: skipped, not read as 999 or 0.
    // Fill starts from the first explicit price at position 2.
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ period: 2, value: 42 });
    expect(points[2]).toEqual({ period: 4, value: 42 });
  });

  it("carries A03 fill across period boundaries within one series, never across series", () => {
    const doc = {
      TimeSeries: [
        {
          Period: [
            {
              timeInterval: { start: "2026-08-01T00:00Z", end: "2026-08-01T01:00Z" },
              resolution: "PT15M",
              Point: [{ position: "1", "price.amount": "10" }],
            },
            {
              // Same series: first two positions omitted (step continues at 10).
              timeInterval: { start: "2026-08-01T01:00Z", end: "2026-08-01T02:00Z" },
              resolution: "PT15M",
              Point: [{ position: "3", "price.amount": "30" }],
            },
          ],
        },
        {
          // Different series over the same day: fill must NOT leak 30 into it.
          Period: [
            {
              timeInterval: { start: "2026-08-01T00:00Z", end: "2026-08-01T01:00Z" },
              resolution: "PT15M",
              Point: [{ position: "2", "price.amount": "99" }],
            },
          ],
        },
      ],
    };

    const points = extractSeriesPoints(doc, ["price.amount"]);
    const s1 = points.slice(0, 8);
    // Periods 5-6 (positions 1-2 of the second period) fill from the first period's 10.
    expect(s1.map((p) => [p.period, p.value])).toEqual([
      [1, 10], [2, 10], [3, 10], [4, 10],
      [5, 10], [6, 10], [7, 30], [8, 30],
    ]);
    // Second series starts fresh: nothing before its first explicit point.
    const s2 = points.slice(8);
    expect(s2.map((p) => [p.period, p.value])).toEqual([
      [2, 99], [3, 99], [4, 99],
    ]);
  });

  it("gives overlapping TimeSeries (same interval, e.g. price categories) the same period numbers", () => {
    const interval = { start: "2026-08-01T00:00Z", end: "2026-08-01T01:00Z" };
    const doc = {
      TimeSeries: [
        {
          Period: [
            {
              timeInterval: interval,
              resolution: "PT15M",
              Point: [{ position: "1", "imbalance_Price.amount": "30" }],
            },
          ],
        },
        {
          Period: [
            {
              timeInterval: interval,
              resolution: "PT15M",
              Point: [{ position: "1", "imbalance_Price.amount": "45" }],
            },
          ],
        },
      ],
    };

    const points = extractSeriesPoints(doc, ["imbalance_Price.amount"]);
    // Both series cover periods 1-4; the second must NOT be numbered 5-8.
    expect(points.map((p) => p.period)).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
    expect(Math.max(...points.map((p) => p.period))).toBe(4);
  });

  it("falls back to max explicit position when interval or resolution is missing", () => {
    const doc = {
      TimeSeries: [
        {
          Period: [
            {
              Point: [
                { position: "1", "price.amount": "5" },
                { position: "4", "price.amount": "6" },
              ],
            },
          ],
        },
      ],
    };

    const points = extractSeriesPoints(doc, ["price.amount"]);
    expect(points).toHaveLength(4);
    expect(points[2]).toEqual({ period: 3, value: 5 });
  });
});
