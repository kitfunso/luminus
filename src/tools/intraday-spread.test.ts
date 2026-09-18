import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./prices.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./prices.js")>();
  return {
    ...actual,
    getDayAheadPrices: vi.fn(),
  };
});

vi.mock("./intraday-prices.js", () => ({
  getIntradayPrices: vi.fn(),
}));

import { getIntradayDaSpread } from "./intraday-spread.js";
import { getDayAheadPrices } from "./prices.js";
import { getIntradayPrices } from "./intraday-prices.js";

const mockDa = vi.mocked(getDayAheadPrices);
const mockId = vi.mocked(getIntradayPrices);

function hourly(hour: number, price: number) {
  const start = new Date(Date.UTC(2026, 7, 1, hour, 0, 0));
  const end = new Date(start.getTime() + 60 * 60000);
  return { interval_start_utc: start.toISOString(), interval_end_utc: end.toISOString(), price };
}

function quarterHour(index: number, price: number) {
  const start = new Date(Date.UTC(2026, 7, 1, 0, 0, 0) + index * 15 * 60000);
  const end = new Date(start.getTime() + 15 * 60000);
  return { interval_start_utc: start.toISOString(), interval_end_utc: end.toISOString(), price };
}

function daResponse(prices: ReturnType<typeof hourly>[], resolutionMinutes = 60) {
  return {
    zone: "DE",
    start_date: "2026-08-01",
    end_date: "2026-08-01",
    currency: "EUR",
    unit: "EUR/MWh",
    resolution_minutes: resolutionMinutes,
    prices,
    stats: { min: 0, max: 0, mean: 0 },
    coverage: { expected_intervals: prices.length, returned_intervals: prices.length, missing_interval_starts: [], duplicates_dropped: 0 },
    conflicts: 0,
  } as Awaited<ReturnType<typeof getDayAheadPrices>>;
}

function idResponse(prices: ReturnType<typeof hourly>[], resolutionMinutes = 60) {
  return {
    zone: "DE",
    date: "2026-08-01",
    currency: "EUR",
    unit: "EUR/MWh",
    resolution_minutes: resolutionMinutes,
    prices,
    stats: { min: 0, max: 0, mean: 0 },
    coverage: { expected_intervals: prices.length, returned_intervals: prices.length, missing_interval_starts: [], duplicates_dropped: 0 },
    conflicts: 0,
  } as Awaited<ReturnType<typeof getIntradayPrices>>;
}

describe("getIntradayDaSpread", () => {
  beforeEach(() => {
    mockDa.mockReset();
    mockId.mockReset();
  });

  it("joins matching hourly intervals by interval_start_utc", async () => {
    mockDa.mockResolvedValue(daResponse([hourly(0, 40), hourly(1, 50)]));
    mockId.mockResolvedValue(idResponse([hourly(0, 45), hourly(1, 48)]));

    const result = await getIntradayDaSpread({ zone: "DE", date: "2026-08-01" });

    expect(result.spreads).toHaveLength(2);
    expect(result.spreads[0]).toEqual({
      interval_start_utc: hourly(0, 0).interval_start_utc,
      day_ahead: 40,
      intraday: 45,
      spread: 5,
    });
    expect(result.unmatched_intervals).toEqual([]);
  });

  it("reports unmatched_intervals when one side is missing an interval", async () => {
    mockDa.mockResolvedValue(daResponse([hourly(0, 40), hourly(1, 50)]));
    mockId.mockResolvedValue(idResponse([hourly(0, 45)]));

    const result = await getIntradayDaSpread({ zone: "DE", date: "2026-08-01" });

    expect(result.spreads).toHaveLength(1);
    expect(result.unmatched_intervals).toEqual([hourly(1, 0).interval_start_utc]);
  });

  it("averages the finer series up to the coarser grid before joining", async () => {
    // DA hourly at 100; ID at 15-min resolution averaging to 90 for that hour.
    mockDa.mockResolvedValue(daResponse([hourly(0, 100)], 60));
    mockId.mockResolvedValue(
      idResponse([quarterHour(0, 80), quarterHour(1, 90), quarterHour(2, 90), quarterHour(3, 100)], 15)
    );

    const result = await getIntradayDaSpread({ zone: "DE", date: "2026-08-01" });

    expect(result.spreads).toHaveLength(1);
    expect(result.spreads[0].intraday).toBe(90);
    expect(result.spreads[0].spread).toBe(-10);
    expect(result.unmatched_intervals).toEqual([]);
  });
});
