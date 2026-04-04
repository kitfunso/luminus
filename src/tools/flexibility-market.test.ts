import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getFlexibilityMarket,
  resetFlexCacheForTests,
} from "./flexibility-market.js";

vi.mock("../lib/auth.js", () => ({
  resolveApiKey: vi.fn(async () => "mock-api-key"),
  ConfigurationError: class extends Error {
    constructor(name: string) { super(`Key "${name}" not configured`); this.name = "ConfigurationError"; }
  },
}));

const MOCK_UKPN_DISPATCHES = {
  results: [
    {
      company_name: "Octopus",
      zone: "Burnham Thorpe",
      product: "Dynamic",
      start_time_local: "2026-03-20T10:00:00+00:00",
      end_time_local: "2026-03-20T12:00:00+00:00",
      availability_mw_req: 0.5,
      utilisation_mw_req: 0.386,
      availability_price: 120.0,
      utilisation_price: 872.0,
      technology: "Demand",
      dispatch_type: "demand_turn_up",
      hours_requested: 2,
    },
    {
      company_name: "Centrica",
      zone: "Burnham Thorpe",
      product: "Sustain",
      start_time_local: "2026-03-19T14:00:00+00:00",
      end_time_local: "2026-03-19T16:00:00+00:00",
      availability_mw_req: 1.0,
      utilisation_mw_req: 0.8,
      availability_price: 100.0,
      utilisation_price: 450.0,
      technology: "Battery",
      dispatch_type: "demand_turn_down",
      hours_requested: 2,
    },
    {
      company_name: "Flexitricity",
      zone: "Wymondham",
      product: "Dynamic",
      start_time_local: "2026-03-18T08:00:00+00:00",
      end_time_local: "2026-03-18T10:00:00+00:00",
      availability_mw_req: 0.3,
      utilisation_mw_req: 0.25,
      availability_price: 80.0,
      utilisation_price: 600.0,
      technology: "Generation",
      dispatch_type: "generation_turn_up",
      hours_requested: 2,
    },
  ],
};

const MOCK_SPEN_DISPATCHES = {
  results: [
    {
      capacity: 1.5,
      mwh: 3.0,
      start: "2026-03-20T09:00:00+00:00",
      end: "2026-03-20T11:00:00+00:00",
      hours: 2,
      need_direction: "demand_turn_up",
      power_type: "Battery",
      status: "Dispatched",
    },
    {
      capacity: 2.0,
      mwh: 4.0,
      start: "2026-03-19T13:00:00+00:00",
      end: "2026-03-19T15:00:00+00:00",
      hours: 2,
      need_direction: "demand_turn_down",
      power_type: "Generation",
      status: "Dispatched",
    },
  ],
};

function mockFetchUkpnOk(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("ukpn-flexibility-dispatches")) {
        return {
          ok: true,
          status: 200,
          json: async () => MOCK_UKPN_DISPATCHES,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    }),
  );
}

function mockFetchSpenOk(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("flex_dispatch")) {
        return {
          ok: true,
          status: 200,
          json: async () => MOCK_SPEN_DISPATCHES,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    }),
  );
}

function mockFetchBothOk(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("ukpn-flexibility-dispatches")) {
        return {
          ok: true,
          status: 200,
          json: async () => MOCK_UKPN_DISPATCHES,
        };
      }
      if (url.includes("flex_dispatch")) {
        return {
          ok: true,
          status: 200,
          json: async () => MOCK_SPEN_DISPATCHES,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    }),
  );
}

function mockFetchFail(status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status,
      text: async () => "error",
    })),
  );
}

describe("getFlexibilityMarket", () => {
  beforeEach(() => {
    resetFlexCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns UKPN dispatches with correct shape and summary", async () => {
    mockFetchUkpnOk();

    const result = await getFlexibilityMarket({
      operator: "UKPN",
      days: 30,
    });

    expect(result.operator).toBe("UKPN");
    expect(result.period_days).toBe(30);
    expect(result.total_dispatches).toBe(3);
    expect(result.dispatches).toHaveLength(3);
    expect(result.source_metadata.id).toBe("ukpn-flexibility-dispatches");

    const first = result.dispatches[0];
    expect(first.operator).toBe("UKPN");
    expect(first.zone).toBe("Burnham Thorpe");
    expect(first.provider).toBe("Octopus");
    expect(first.product).toBe("Dynamic");
    expect(first.capacity_mw).toBe(0.386);
    expect(first.utilisation_price).toBe(872.0);
    expect(first.technology).toBe("Demand");
    expect(first.dispatch_type).toBe("demand_turn_up");
    expect(first.hours).toBe(2);

    // Avg utilisation price: (872 + 450 + 600) / 3 = 640.67
    expect(result.avg_utilisation_price).toBeCloseTo(640.67, 1);
  });

  it("returns SPEN dispatches with correct shape and summary", async () => {
    mockFetchSpenOk();

    const result = await getFlexibilityMarket({
      operator: "SPEN",
      days: 30,
    });

    expect(result.operator).toBe("SPEN");
    expect(result.total_dispatches).toBe(2);
    expect(result.dispatches).toHaveLength(2);
    expect(result.source_metadata.id).toBe("spen-flex-dispatch");

    const first = result.dispatches[0];
    expect(first.operator).toBe("SPEN");
    expect(first.zone).toBeNull();
    expect(first.provider).toBeNull();
    expect(first.capacity_mw).toBe(1.5);
    expect(first.energy_mwh).toBe(3.0);
    expect(first.technology).toBe("Battery");
    expect(first.dispatch_type).toBe("demand_turn_up");
    expect(first.utilisation_price).toBeNull();

    // SPEN provides mwh directly: 3.0 + 4.0 = 7.0
    expect(result.total_mwh).toBe(7);
    // No utilisation prices in SPEN data
    expect(result.avg_utilisation_price).toBeNull();
  });

  it("filters UKPN dispatches by zone", async () => {
    mockFetchUkpnOk();

    const result = await getFlexibilityMarket({
      operator: "UKPN",
      zone: "Burnham Thorpe",
      days: 30,
    });

    expect(result.total_dispatches).toBe(3);
    // The API-level filter is passed as a where clause; all mock data has the zone
    // so we verify the zone appears in the query params
    const fetchMock = vi.mocked(fetch);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("Burnham+Thorpe");
  });

  it("rejects zone filter for SPEN", async () => {
    mockFetchSpenOk();

    await expect(
      getFlexibilityMarket({
        operator: "SPEN",
        zone: "SomeZone",
        days: 30,
      }),
    ).rejects.toThrow("Zone filtering is only supported for UKPN dispatches.");
  });

  it("returns combined dispatches for operator=all", async () => {
    mockFetchBothOk();

    const result = await getFlexibilityMarket({
      operator: "all",
      days: 30,
    });

    expect(result.operator).toBe("UKPN+SPEN");
    expect(result.total_dispatches).toBe(5);
    expect(result.dispatches).toHaveLength(5);

    // Dispatches are sorted by start_time descending
    const startTimes = result.dispatches.map((d) => d.start_time);
    for (let i = 1; i < startTimes.length; i++) {
      expect(startTimes[i - 1] >= startTimes[i]).toBe(true);
    }

    // Both operators present
    const operators = new Set(result.dispatches.map((d) => d.operator));
    expect(operators.has("UKPN")).toBe(true);
    expect(operators.has("SPEN")).toBe(true);
  });

  it("respects the limit parameter", async () => {
    mockFetchUkpnOk();

    const result = await getFlexibilityMarket({
      operator: "UKPN",
      days: 30,
      limit: 2,
    });

    expect(result.dispatches).toHaveLength(2);
    expect(result.total_dispatches).toBe(2);
  });

  it("clamps days to valid range", async () => {
    mockFetchUkpnOk();

    const result = await getFlexibilityMarket({
      operator: "UKPN",
      days: 500,
    });

    // Clamped to MAX_DAYS (365)
    expect(result.period_days).toBe(365);
  });

  it("defaults to 30 days when days is not provided", async () => {
    mockFetchUkpnOk();

    const result = await getFlexibilityMarket({
      operator: "UKPN",
    });

    expect(result.period_days).toBe(30);
  });

  it("rejects unsupported operators", async () => {
    await expect(
      getFlexibilityMarket({
        operator: "ENWL",
      }),
    ).rejects.toThrow('Supported operators: "UKPN", "SPEN", "all".');
  });

  it("handles UKPN fetch failure", async () => {
    mockFetchFail(503);

    await expect(
      getFlexibilityMarket({
        operator: "UKPN",
        days: 30,
      }),
    ).rejects.toThrow("UKPN flexibility dispatches fetch failed: HTTP 503");
  });

  it("handles SPEN fetch failure", async () => {
    mockFetchFail(500);

    await expect(
      getFlexibilityMarket({
        operator: "SPEN",
        days: 30,
      }),
    ).rejects.toThrow("SPEN flexibility dispatches fetch failed: HTTP 500");
  });

  it("caches UKPN dispatches after the first fetch", async () => {
    mockFetchUkpnOk();

    await getFlexibilityMarket({ operator: "UKPN", days: 30 });
    await getFlexibilityMarket({ operator: "UKPN", days: 30 });

    // Second call uses cache, so fetch is only called once
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("computes zone_breakdown correctly", async () => {
    mockFetchUkpnOk();

    const result = await getFlexibilityMarket({
      operator: "UKPN",
      days: 30,
    });

    expect(result.zone_breakdown["Burnham Thorpe"]).toBe(2);
    expect(result.zone_breakdown["Wymondham"]).toBe(1);
  });

  it("computes total_mwh from capacity_mw * hours for UKPN", async () => {
    mockFetchUkpnOk();

    const result = await getFlexibilityMarket({
      operator: "UKPN",
      days: 30,
    });

    // UKPN: energy_mwh is null, so fallback to capacity_mw * hours
    // 0.386*2 + 0.8*2 + 0.25*2 = 0.772 + 1.6 + 0.5 = 2.872
    expect(result.total_mwh).toBeCloseTo(2.872, 2);
  });

  it("includes correct disclaimer", async () => {
    mockFetchUkpnOk();

    const result = await getFlexibilityMarket({
      operator: "UKPN",
      days: 30,
    });

    expect(result.disclaimer).toContain("flexibility dispatch data");
  });
});
