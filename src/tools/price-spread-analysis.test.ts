import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./prices.js", () => ({
  getDayAheadPrices: vi.fn(),
}));

import { getPriceSpreadAnalysis } from "./price-spread-analysis.js";
import { getDayAheadPrices } from "./prices.js";

const mockPrices = vi.mocked(getDayAheadPrices);

function isoPoint(hour: number, price: number) {
  const start = new Date(Date.UTC(2026, 7, 1, hour, 0, 0));
  const end = new Date(start.getTime() + 60 * 60000);
  return { interval_start_utc: start.toISOString(), interval_end_utc: end.toISOString(), price };
}

function quarterHourPoint(index: number, price: number) {
  const start = new Date(Date.UTC(2026, 7, 1, 0, 0, 0) + index * 15 * 60000);
  const end = new Date(start.getTime() + 15 * 60000);
  return { interval_start_utc: start.toISOString(), interval_end_utc: end.toISOString(), price };
}

describe("getPriceSpreadAnalysis", () => {
  beforeEach(() => {
    mockPrices.mockReset();
  });

  it("selects cycles*60/resolution_minutes intervals for hourly data (one cycle = one hour)", async () => {
    const prices = Array.from({ length: 24 }, (_, h) => isoPoint(h, h < 2 ? 10 : h >= 22 ? 100 : 40));
    mockPrices.mockResolvedValue({
      zone: "DE",
      start_date: "2026-08-01",
      end_date: "2026-08-01",
      currency: "EUR",
      unit: "EUR/MWh",
      resolution_minutes: 60,
      prices,
      stats: { min: 10, max: 100, mean: 40 },
      coverage: { expected_intervals: 24, returned_intervals: 24, missing_interval_starts: [], duplicates_dropped: 0 },
      conflicts: 0,
    } as Awaited<ReturnType<typeof getDayAheadPrices>>);

    const result = await getPriceSpreadAnalysis({ zone: "DE", date: "2026-08-01", cycles: 2 });

    const chargeEntries = result.schedule.filter((s) => s.action === "charge");
    const dischargeEntries = result.schedule.filter((s) => s.action === "discharge");
    expect(chargeEntries).toHaveLength(2);
    expect(dischargeEntries).toHaveLength(2);
    expect(result.currency).toBe("EUR");
    expect(result.schedule[0]).toHaveProperty("interval_start_utc");
  });

  it("scales the intervals-per-cycle count for 15-minute resolution", async () => {
    // 96 quarter-hours; cycles=1 -> intervalsPerCycle = 60/15 = 4.
    const prices = Array.from({ length: 96 }, (_, i) => quarterHourPoint(i, i < 4 ? 5 : i >= 92 ? 90 : 30));
    mockPrices.mockResolvedValue({
      zone: "DE",
      start_date: "2026-08-01",
      end_date: "2026-08-01",
      currency: "EUR",
      unit: "EUR/MWh",
      resolution_minutes: 15,
      prices,
      stats: { min: 5, max: 90, mean: 30 },
      coverage: { expected_intervals: 96, returned_intervals: 96, missing_interval_starts: [], duplicates_dropped: 0 },
      conflicts: 0,
    } as Awaited<ReturnType<typeof getDayAheadPrices>>);

    const result = await getPriceSpreadAnalysis({ zone: "DE", date: "2026-08-01", cycles: 1 });

    expect(result.schedule.filter((s) => s.action === "charge")).toHaveLength(4);
    expect(result.schedule.filter((s) => s.action === "discharge")).toHaveLength(4);
  });

  it("passes currency through even when there are no prices", async () => {
    mockPrices.mockResolvedValue({
      zone: "GB",
      start_date: "2026-08-01",
      end_date: "2026-08-01",
      currency: "GBP",
      unit: "GBP/MWh",
      resolution_minutes: 0,
      prices: [],
      stats: { min: 0, max: 0, mean: 0 },
      coverage: { expected_intervals: 0, returned_intervals: 0, missing_interval_starts: [], duplicates_dropped: 0 },
      conflicts: 0,
    } as Awaited<ReturnType<typeof getDayAheadPrices>>);

    const result = await getPriceSpreadAnalysis({ zone: "GB", date: "2026-08-01" });

    expect(result.signal).toBe("no_arb");
    expect(result.currency).toBe("GBP");
    expect(result.schedule).toEqual([]);
  });
});
