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
  resolveZone: vi.fn(() => "10Y1001A1001A82H"),
  AVAILABLE_ZONES: "DE",
}));

import { getImbalancePrices } from "./imbalance-prices.js";

describe("getImbalancePrices", () => {
  beforeEach(() => {
    queryEntsoeMock.mockReset();
  });

  it("queries documentType A85 (imbalance prices), not A86 (volumes)", async () => {
    queryEntsoeMock.mockResolvedValue({
      Balancing_MarketDocument: {
        TimeSeries: [
          {
            Period: [
              {
                timeInterval: { start: "2026-08-01T00:00Z", end: "2026-08-01T00:30Z" },
                resolution: "PT15M",
                Point: [{ position: "1", "imbalance_Price.amount": "88.4" }],
              },
            ],
          },
        ],
      },
    });

    await getImbalancePrices({ zone: "DE", date: "2026-08-01" });

    expect(queryEntsoeMock).toHaveBeenCalledWith(
      expect.objectContaining({ documentType: "A85" }),
      expect.anything()
    );
  });

  it("parses the Balancing_MarketDocument response root", async () => {
    queryEntsoeMock.mockResolvedValue({
      Balancing_MarketDocument: {
        TimeSeries: [
          {
            Period: [
              {
                timeInterval: { start: "2026-08-01T00:00Z", end: "2026-08-01T00:30Z" },
                resolution: "PT15M",
                Point: [
                  { position: "1", "imbalance_Price.amount": "88.4" },
                  { position: "2", "imbalance_Price.amount": "-5.1" },
                ],
              },
            ],
          },
        ],
      },
    });

    const result = await getImbalancePrices({ zone: "DE", date: "2026-08-01" });

    expect(result.prices).toEqual([
      { period: 1, price_eur_mwh: 88.4 },
      { period: 2, price_eur_mwh: -5.1 },
    ]);
    expect(result.stats).toEqual({ min: -5.1, max: 88.4, mean: 41.65 });
  });

  it("expands an A03 step curve to all 96 quarter-hours", async () => {
    queryEntsoeMock.mockResolvedValue({
      Balancing_MarketDocument: {
        TimeSeries: [
          {
            Period: [
              {
                timeInterval: { start: "2026-08-01T00:00Z", end: "2026-08-02T00:00Z" },
                resolution: "PT15M",
                curveType: "A03",
                Point: [
                  { position: "1", "imbalance_Price.amount": "60" },
                  { position: "50", "imbalance_Price.amount": "120" },
                ],
              },
            ],
          },
        ],
      },
    });

    const result = await getImbalancePrices({ zone: "DE", date: "2026-08-01" });

    expect(result.prices).toHaveLength(96);
    expect(result.prices[48]).toEqual({ period: 49, price_eur_mwh: 60 });
    expect(result.prices[49]).toEqual({ period: 50, price_eur_mwh: 120 });
    expect(result.prices[95]).toEqual({ period: 96, price_eur_mwh: 120 });
  });

  it("never reads Point.quantity (a volume) as a price", async () => {
    queryEntsoeMock.mockResolvedValue({
      Imbalance_MarketDocument: {
        TimeSeries: [
          {
            Period: [
              {
                timeInterval: { start: "2026-08-01T00:00Z", end: "2026-08-01T00:15Z" },
                resolution: "PT15M",
                Point: [{ position: "1", quantity: "1234.5" }],
              },
            ],
          },
        ],
      },
    });

    const result = await getImbalancePrices({ zone: "DE", date: "2026-08-01" });

    expect(result.prices).toEqual([]);
  });
});
