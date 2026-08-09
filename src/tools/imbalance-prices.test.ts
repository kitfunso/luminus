import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryEntsoeMock, fetchNtpDayMock, hasNtpCredentialsMock } = vi.hoisted(() => ({
  queryEntsoeMock: vi.fn(),
  fetchNtpDayMock: vi.fn(),
  hasNtpCredentialsMock: vi.fn(),
}));

vi.mock("../lib/entsoe-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/entsoe-client.js")>();
  return {
    ...actual,
    queryEntsoe: queryEntsoeMock,
  };
});

vi.mock("../lib/netztransparenz.js", () => ({
  fetchNtpDay: fetchNtpDayMock,
  hasNtpCredentials: hasNtpCredentialsMock,
}));

vi.mock("../lib/zone-codes.js", () => ({
  resolveZone: vi.fn(() => "10Y1001A1001A82H"),
  AVAILABLE_ZONES: "DE",
}));

import { getImbalancePrices } from "./imbalance-prices.js";

describe("getImbalancePrices", () => {
  beforeEach(() => {
    queryEntsoeMock.mockReset();
    fetchNtpDayMock.mockReset();
    hasNtpCredentialsMock.mockReset();
    hasNtpCredentialsMock.mockResolvedValue(false);
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

  it("falls back to reBAP for DE when ENTSO-E has no data and credentials exist", async () => {
    queryEntsoeMock.mockRejectedValue(new Error("No matching data found"));
    hasNtpCredentialsMock.mockResolvedValue(true);
    fetchNtpDayMock.mockResolvedValue([
      { period: 1, value: 55.5 },
      { period: 2, value: -4.0 },
    ]);

    const result = await getImbalancePrices({ zone: "DE", date: "2021-06-01" });

    expect(fetchNtpDayMock).toHaveBeenCalledWith("reBAP", "2021-06-01");
    expect(result.source).toBe("netztransparenz_rebap");
    expect(result.prices).toEqual([
      { period: 1, price_eur_mwh: 55.5 },
      { period: 2, price_eur_mwh: -4.0 },
    ]);
  });

  it("does not fall back for non-DE zones and keeps the ENTSO-E error", async () => {
    queryEntsoeMock.mockRejectedValue(new Error("No matching data found"));
    hasNtpCredentialsMock.mockResolvedValue(true);

    await expect(getImbalancePrices({ zone: "FR", date: "2021-06-01" })).rejects.toThrow(
      "No matching data found"
    );
    expect(fetchNtpDayMock).not.toHaveBeenCalled();
  });

  it("mentions the reBAP registration path when DE fails without credentials", async () => {
    queryEntsoeMock.mockRejectedValue(new Error("No matching data found"));

    await expect(getImbalancePrices({ zone: "DE", date: "2021-06-01" })).rejects.toThrow(
      /NETZTRANSPARENZ_CLIENT_ID/
    );
    expect(fetchNtpDayMock).not.toHaveBeenCalled();
  });

  it("labels ENTSO-E results with source entsoe and does not call the fallback", async () => {
    hasNtpCredentialsMock.mockResolvedValue(true);
    queryEntsoeMock.mockResolvedValue({
      Balancing_MarketDocument: {
        TimeSeries: [
          {
            Period: [
              {
                timeInterval: { start: "2026-08-01T00:00Z", end: "2026-08-01T00:15Z" },
                resolution: "PT15M",
                Point: [{ position: "1", "imbalance_Price.amount": "12.0" }],
              },
            ],
          },
        ],
      },
    });

    const result = await getImbalancePrices({ zone: "DE", date: "2026-08-01" });
    expect(result.source).toBe("entsoe");
    expect(fetchNtpDayMock).not.toHaveBeenCalled();
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
