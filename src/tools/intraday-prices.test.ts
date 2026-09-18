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

import { getIntradayPrices } from "./intraday-prices.js";

function hourlyPoint(position: number, price: string) {
  return { position: String(position), "price.amount": price };
}

describe("getIntradayPrices", () => {
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
                Point: Array.from({ length: 24 }, (_, i) => hourlyPoint(i + 1, String(40 + i))),
              },
            ],
          },
        ],
      },
    });

    const result = await getIntradayPrices({ zone: "DE", date: "2026-08-01" });

    expect(result.prices).toHaveLength(24);
    expect(result.prices[0]).toEqual({
      interval_start_utc: "2026-07-31T22:00:00.000Z",
      interval_end_utc: "2026-07-31T23:00:00.000Z",
      price: 40,
    });
    expect(result.currency).toBe("EUR");
    expect(result.unit).toBe("EUR/MWh");
    expect(result.resolution_minutes).toBe(60);
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

    const result = await getIntradayPrices({ zone: "DE", date: "2026-08-01" });

    expect(result.prices).toHaveLength(96);
    expect(result.resolution_minutes).toBe(15);
  });

  it("throws a clear error when a period has no parseable timeInterval", async () => {
    queryEntsoeMock.mockResolvedValue({
      Publication_MarketDocument: {
        TimeSeries: [{ Period: [{ Point: [hourlyPoint(1, "10")] }] }],
      },
    });

    await expect(getIntradayPrices({ zone: "DE", date: "2026-08-01" })).rejects.toThrow(
      /parseable timeInterval/
    );
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

    const result = await getIntradayPrices({ zone: "DE", date: "2026-08-01" });

    expect(result.resolution_minutes).toBe(15);
    expect(result.prices).toHaveLength(96);
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

    const result = await getIntradayPrices({ zone: "GB", date: "2026-08-01" });

    expect(result.currency).toBe("GBP");
    expect(result.unit).toBe("GBP/MWh");
  });

  it("reports a missing interval in coverage when the published period ends short of the request", async () => {
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

    const result = await getIntradayPrices({ zone: "DE", date: "2026-08-01" });

    expect(result.coverage.expected_intervals).toBe(24);
    expect(result.coverage.returned_intervals).toBe(23);
    expect(result.coverage.missing_interval_starts).toEqual(["2026-08-01T21:00:00.000Z"]);
  });
});
