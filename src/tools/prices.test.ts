import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryEntsoeMock } = vi.hoisted(() => ({
  queryEntsoeMock: vi.fn(),
}));

vi.mock("../lib/entsoe-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/entsoe-client.js")>();
  return {
    ...actual,
    queryEntsoe: queryEntsoeMock,
  };
});

vi.mock("../lib/zone-codes.js", () => ({
  resolvePriceZone: vi.fn(() => "10Y1001A1001A82H"),
  AVAILABLE_ZONES: "DE, FR, GB",
}));

import { getDayAheadPrices } from "./prices.js";

function hourlyPoint(position: number, price: string) {
  return { position: String(position), "price.amount": price };
}

describe("getDayAheadPrices", () => {
  beforeEach(() => {
    queryEntsoeMock.mockReset();
  });

  it("returns 24 ISO-timestamped hourly intervals for a normal day", async () => {
    queryEntsoeMock.mockResolvedValue({
      Publication_MarketDocument: {
        TimeSeries: [
          {
            "currency_Unit.name": "EUR",
            "price_Measure_Unit.name": "MWh",
            Period: [
              {
                timeInterval: { start: "2026-07-31T22:00Z", end: "2026-08-01T22:00Z" },
                resolution: "PT60M",
                Point: Array.from({ length: 24 }, (_, i) => hourlyPoint(i + 1, String(30 + i))),
              },
            ],
          },
        ],
      },
    });

    const result = await getDayAheadPrices({ zone: "DE", start_date: "2026-08-01" });

    expect(result.prices).toHaveLength(24);
    expect(result.prices[0]).toEqual({
      interval_start_utc: "2026-07-31T22:00:00.000Z",
      interval_end_utc: "2026-07-31T23:00:00.000Z",
      price: 30,
    });
    expect(result.currency).toBe("EUR");
    expect(result.unit).toBe("EUR/MWh");
    expect(result.resolution_minutes).toBe(60);
    expect(result.coverage).toEqual({
      expected_intervals: 24,
      returned_intervals: 24,
      missing_interval_starts: [],
      duplicates_dropped: 0,
    });
    expect(result.conflicts).toBe(0);
  });

  it("expands a 15-minute A03 step curve to 96 timestamped quarter-hours", async () => {
    queryEntsoeMock.mockResolvedValue({
      Publication_MarketDocument: {
        TimeSeries: [
          {
            Period: [
              {
                timeInterval: { start: "2026-07-31T22:00Z", end: "2026-08-01T22:00Z" },
                resolution: "PT15M",
                curveType: "A03",
                Point: [hourlyPoint(1, "50"), hourlyPoint(50, "75")],
              },
            ],
          },
        ],
      },
    });

    const result = await getDayAheadPrices({ zone: "DE", start_date: "2026-08-01" });

    expect(result.prices).toHaveLength(96);
    expect(result.resolution_minutes).toBe(15);
    expect(result.prices[95].interval_end_utc).toBe("2026-08-01T22:00:00.000Z");
  });

  it("throws a clear error when a period has no parseable timeInterval", async () => {
    queryEntsoeMock.mockResolvedValue({
      Publication_MarketDocument: {
        TimeSeries: [{ Period: [{ Point: [hourlyPoint(1, "10")] }] }],
      },
    });

    await expect(getDayAheadPrices({ zone: "DE", start_date: "2026-08-01" })).rejects.toThrow(
      /parseable timeInterval/
    );
  });

  it("spring-forward day: 23 intervals, full coverage, previous-day points clipped", async () => {
    queryEntsoeMock.mockResolvedValue({
      Publication_MarketDocument: {
        TimeSeries: [
          {
            Period: [
              {
                timeInterval: { start: "2026-03-27T23:00Z", end: "2026-03-28T23:00Z" },
                resolution: "PT60M",
                Point: Array.from({ length: 24 }, (_, i) => hourlyPoint(i + 1, "1")),
              },
              {
                timeInterval: { start: "2026-03-28T23:00Z", end: "2026-03-29T22:00Z" },
                resolution: "PT60M",
                Point: Array.from({ length: 23 }, (_, i) => hourlyPoint(i + 1, "2")),
              },
            ],
          },
        ],
      },
    });

    const result = await getDayAheadPrices({ zone: "DE", start_date: "2026-03-29" });

    expect(result.prices).toHaveLength(23);
    expect(result.prices[0].interval_start_utc).toBe("2026-03-28T23:00:00.000Z");
    expect(result.prices.every((p) => p.price === 2)).toBe(true);
    expect(result.coverage.expected_intervals).toBe(23);
    expect(result.coverage.missing_interval_starts).toEqual([]);
  });

  it("fall-back day: 25 intervals, full coverage", async () => {
    queryEntsoeMock.mockResolvedValue({
      Publication_MarketDocument: {
        TimeSeries: [
          {
            Period: [
              {
                timeInterval: { start: "2026-10-24T22:00Z", end: "2026-10-25T23:00Z" },
                resolution: "PT60M",
                Point: Array.from({ length: 25 }, (_, i) => hourlyPoint(i + 1, "3")),
              },
            ],
          },
        ],
      },
    });

    const result = await getDayAheadPrices({ zone: "DE", start_date: "2026-10-25" });

    expect(result.prices).toHaveLength(25);
    expect(result.coverage.expected_intervals).toBe(25);
    expect(result.coverage.missing_interval_starts).toEqual([]);
  });

  it("flags an empty document in notes instead of reporting nothing expected silently", async () => {
    queryEntsoeMock.mockResolvedValue({ Publication_MarketDocument: {} });

    const result = await getDayAheadPrices({ zone: "DE", start_date: "2026-08-01" });

    expect(result.prices).toEqual([]);
    expect(result.notes?.[0]).toMatch(/no price points/);
  });

  it("covers a two-day request with 48 distinct, non-colliding interval starts", async () => {
    queryEntsoeMock.mockResolvedValue({
      Publication_MarketDocument: {
        TimeSeries: [
          {
            Period: [
              {
                timeInterval: { start: "2026-07-31T22:00Z", end: "2026-08-01T22:00Z" },
                resolution: "PT60M",
                Point: Array.from({ length: 24 }, (_, i) => hourlyPoint(i + 1, "10")),
              },
              {
                timeInterval: { start: "2026-08-01T22:00Z", end: "2026-08-02T22:00Z" },
                resolution: "PT60M",
                Point: Array.from({ length: 24 }, (_, i) => hourlyPoint(i + 1, "20")),
              },
            ],
          },
        ],
      },
    });

    const result = await getDayAheadPrices({
      zone: "DE",
      start_date: "2026-08-01",
      end_date: "2026-08-03",
    });

    expect(result.prices).toHaveLength(48);
    expect(new Set(result.prices.map((p) => p.interval_start_utc)).size).toBe(48);
  });

  it("keeps only the finest resolution when a doc mixes 60m and 15m series", async () => {
    queryEntsoeMock.mockResolvedValue({
      Publication_MarketDocument: {
        TimeSeries: [
          {
            Period: [
              {
                timeInterval: { start: "2026-07-31T22:00Z", end: "2026-08-01T22:00Z" },
                resolution: "PT60M",
                Point: Array.from({ length: 24 }, (_, i) => hourlyPoint(i + 1, "999")),
              },
            ],
          },
          {
            Period: [
              {
                timeInterval: { start: "2026-07-31T22:00Z", end: "2026-08-01T22:00Z" },
                resolution: "PT15M",
                Point: Array.from({ length: 96 }, (_, i) => hourlyPoint(i + 1, "50")),
              },
            ],
          },
        ],
      },
    });

    const result = await getDayAheadPrices({ zone: "DE", start_date: "2026-08-01" });

    expect(result.resolution_minutes).toBe(15);
    expect(result.prices).toHaveLength(96);
    expect(result.prices.every((p) => p.price === 50)).toBe(true);
    expect(result.notes?.[0]).toMatch(/coarser-resolution/);
  });

  it("keeps coarse points where no finer series overlaps (range crossing a 60m->15m go-live)", async () => {
    queryEntsoeMock.mockResolvedValue({
      Publication_MarketDocument: {
        TimeSeries: [
          {
            Period: [
              {
                timeInterval: { start: "2025-09-29T22:00Z", end: "2025-09-30T22:00Z" },
                resolution: "PT60M",
                Point: Array.from({ length: 24 }, (_, i) => hourlyPoint(i + 1, "70")),
              },
            ],
          },
          {
            Period: [
              {
                timeInterval: { start: "2025-09-30T22:00Z", end: "2025-10-01T22:00Z" },
                resolution: "PT15M",
                Point: Array.from({ length: 96 }, (_, i) => hourlyPoint(i + 1, "50")),
              },
            ],
          },
        ],
      },
    });

    const result = await getDayAheadPrices({ zone: "DE", start_date: "2025-09-30", end_date: "2025-10-02" });

    expect(result.prices).toHaveLength(120);
    expect(result.prices[0].interval_end_utc).toBe("2025-09-29T23:00:00.000Z");
    expect(result.coverage.missing_interval_starts).toEqual([]);
    expect(result.notes).toBeUndefined();
  });

  it("labels GBP-priced documents with GBP currency and unit", async () => {
    queryEntsoeMock.mockResolvedValue({
      Publication_MarketDocument: {
        TimeSeries: [
          {
            "currency_Unit.name": "GBP",
            "price_Measure_Unit.name": "MWh",
            Period: [
              {
                timeInterval: { start: "2026-07-31T22:00Z", end: "2026-08-01T22:00Z" },
                resolution: "PT60M",
                Point: Array.from({ length: 24 }, (_, i) => hourlyPoint(i + 1, "80")),
              },
            ],
          },
        ],
      },
    });

    const result = await getDayAheadPrices({ zone: "GB", start_date: "2026-08-01" });

    expect(result.currency).toBe("GBP");
    expect(result.unit).toBe("GBP/MWh");
  });

  it("reports a missing interval in coverage when the published period ends short of the request", async () => {
    // ENTSO-E published only 23 of the requested 24 hours (e.g. a partial-day outage).
    queryEntsoeMock.mockResolvedValue({
      Publication_MarketDocument: {
        TimeSeries: [
          {
            Period: [
              {
                timeInterval: { start: "2026-07-31T22:00Z", end: "2026-08-01T21:00Z" },
                resolution: "PT60M",
                Point: Array.from({ length: 23 }, (_, i) => hourlyPoint(i + 1, "10")),
              },
            ],
          },
        ],
      },
    });

    const result = await getDayAheadPrices({ zone: "DE", start_date: "2026-08-01" });

    expect(result.coverage.expected_intervals).toBe(24);
    expect(result.coverage.returned_intervals).toBe(23);
    expect(result.coverage.missing_interval_starts).toEqual(["2026-08-01T21:00:00.000Z"]);
  });

  it("dedups equal-value same-start collisions without flagging a conflict", async () => {
    queryEntsoeMock.mockResolvedValue({
      Publication_MarketDocument: {
        TimeSeries: [
          { Period: [{ timeInterval: { start: "2026-07-31T22:00Z", end: "2026-07-31T23:00Z" }, resolution: "PT60M", Point: [hourlyPoint(1, "40")] }] },
          { Period: [{ timeInterval: { start: "2026-07-31T22:00Z", end: "2026-07-31T23:00Z" }, resolution: "PT60M", Point: [hourlyPoint(1, "40")] }] },
        ],
      },
    });

    const result = await getDayAheadPrices({ zone: "DE", start_date: "2026-08-01" });

    expect(result.prices).toHaveLength(1);
    expect(result.coverage.duplicates_dropped).toBe(1);
    expect(result.conflicts).toBe(0);
  });

  it("keeps the first series and flags a conflict when same-start values differ", async () => {
    queryEntsoeMock.mockResolvedValue({
      Publication_MarketDocument: {
        TimeSeries: [
          { businessType: "A62", Period: [{ timeInterval: { start: "2026-07-31T22:00Z", end: "2026-07-31T23:00Z" }, resolution: "PT60M", Point: [hourlyPoint(1, "40")] }] },
          { businessType: "A63", Period: [{ timeInterval: { start: "2026-07-31T22:00Z", end: "2026-07-31T23:00Z" }, resolution: "PT60M", Point: [hourlyPoint(1, "99")] }] },
        ],
      },
    });

    const result = await getDayAheadPrices({ zone: "DE", start_date: "2026-08-01" });

    expect(result.prices).toHaveLength(1);
    expect(result.prices[0].price).toBe(40);
    expect(result.conflicts).toBe(1);
    expect(result.notes?.[0]).toMatch(/Conflicting value/);
    expect(result.notes?.[0]).toMatch(/businessType=A63/);
  });
});
