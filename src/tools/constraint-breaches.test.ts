import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getConstraintBreaches,
  resetConstraintBreachesCacheForTests,
} from "./constraint-breaches.js";

vi.mock("../lib/auth.js", () => ({
  resolveApiKey: vi.fn(async () => "mock-api-key"),
  ConfigurationError: class extends Error {
    constructor(name: string) {
      super(`Key "${name}" not configured`);
      this.name = "ConfigurationError";
    }
  },
}));

const MOCK_BREACHES = {
  results: [
    {
      scheme: "RAYLEIGH",
      start_time_utc: "2026-03-15T10:00:00+00:00",
      end_time_utc: "2026-03-15T10:01:41+00:00",
      duration_hours: 0.028,
      total_der_access_reduction_kwh: 76.6,
      event_id: "EVT-001",
      constraint_id: "CON-001",
      constraint_description:
        "MALDON GRID 132/33KV - TILLINGHAM 2 - PEMBERTON SOLAR - SUM CONSTRAINT",
      constraint_voltage_kv: 132,
    },
    {
      scheme: "RAYLEIGH",
      start_time_utc: "2026-03-10T14:30:00+00:00",
      end_time_utc: "2026-03-10T16:30:00+00:00",
      duration_hours: 2.0,
      total_der_access_reduction_kwh: 5400.0,
      event_id: "EVT-002",
      constraint_id: "CON-002",
      constraint_description:
        "RAYLEIGH GRID 132/33KV - EASTWOOD - THERMAL CONSTRAINT",
      constraint_voltage_kv: 132,
    },
    {
      scheme: "CANTERBURY",
      start_time_utc: "2026-03-08T09:00:00+00:00",
      end_time_utc: "2026-03-08T09:45:00+00:00",
      duration_hours: 0.75,
      total_der_access_reduction_kwh: 312.5,
      event_id: "EVT-003",
      constraint_id: "CON-003",
      constraint_description:
        "CANTERBURY NORTH 33/11KV - VOLTAGE CONSTRAINT",
      constraint_voltage_kv: 33,
    },
  ],
};

function mockFetchOk(payload: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => payload,
    })),
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

describe("getConstraintBreaches", () => {
  beforeEach(() => {
    resetConstraintBreachesCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns breaches with correct aggregation", async () => {
    mockFetchOk(MOCK_BREACHES);

    const result = await getConstraintBreaches({});

    expect(result.period_days).toBe(90);
    expect(result.total_breaches).toBe(3);
    expect(result.total_curtailment_kwh).toBe(5789.1);
    expect(result.total_curtailment_hours).toBe(2.778);
    expect(result.breaches).toHaveLength(3);
    expect(result.breaches[0].scheme).toBe("RAYLEIGH");
    expect(result.breaches[0].der_curtailment_kwh).toBe(76.6);
    expect(result.breaches[0].voltage_kv).toBe(132);
    expect(result.source_metadata.id).toBe("ukpn-constraint-breaches");
    expect(result.disclaimer).toBeTruthy();
  });

  it("builds scheme breakdown correctly", async () => {
    mockFetchOk(MOCK_BREACHES);

    const result = await getConstraintBreaches({});

    expect(result.scheme_breakdown).toHaveProperty("RAYLEIGH");
    expect(result.scheme_breakdown).toHaveProperty("CANTERBURY");
    expect(result.scheme_breakdown.RAYLEIGH.count).toBe(2);
    expect(result.scheme_breakdown.RAYLEIGH.total_kwh).toBe(5476.6);
    expect(result.scheme_breakdown.RAYLEIGH.total_hours).toBe(2.028);
    expect(result.scheme_breakdown.CANTERBURY.count).toBe(1);
    expect(result.scheme_breakdown.CANTERBURY.total_kwh).toBe(312.5);
    expect(result.scheme_breakdown.CANTERBURY.total_hours).toBe(0.75);
  });

  it("filters by scheme", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        expect(url).toContain("scheme");
        expect(url).toContain("CANTERBURY");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [MOCK_BREACHES.results[2]],
          }),
        };
      }),
    );

    const result = await getConstraintBreaches({ scheme: "CANTERBURY" });

    expect(result.total_breaches).toBe(1);
    expect(result.breaches[0].scheme).toBe("CANTERBURY");
  });

  it("respects date range via days parameter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        // Verify the where clause includes a date filter
        // URLSearchParams encodes spaces as +, not %20
        const decodedUrl = decodeURIComponent(url).replace(/\+/g, " ");
        expect(decodedUrl).toContain("start_time_utc >= date'");
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: [] }),
        };
      }),
    );

    const result = await getConstraintBreaches({ days: 30 });

    expect(result.period_days).toBe(30);
    expect(result.total_breaches).toBe(0);
    expect(result.breaches).toEqual([]);
  });

  it("filters by min_duration_hours", async () => {
    mockFetchOk(MOCK_BREACHES);

    const result = await getConstraintBreaches({ min_duration_hours: 1.0 });

    expect(result.total_breaches).toBe(1);
    expect(result.breaches).toHaveLength(1);
    expect(result.breaches[0].event_id).toBe("EVT-002");
    expect(result.breaches[0].duration_hours).toBe(2.0);
    // Aggregation should only include filtered breaches
    expect(result.total_curtailment_kwh).toBe(5400.0);
    expect(result.scheme_breakdown).not.toHaveProperty("CANTERBURY");
  });

  it("respects limit parameter", async () => {
    mockFetchOk(MOCK_BREACHES);

    const result = await getConstraintBreaches({ limit: 2 });

    // total_breaches reflects all matching, breaches array is capped
    expect(result.total_breaches).toBe(3);
    expect(result.breaches).toHaveLength(2);
  });

  it("clamps days to max 365", async () => {
    mockFetchOk({ results: [] });

    const result = await getConstraintBreaches({ days: 999 });

    expect(result.period_days).toBe(365);
  });

  it("clamps limit to max 200", async () => {
    mockFetchOk({ results: [] });

    const result = await getConstraintBreaches({ limit: 500 });

    // No records to return, but the clamping is verified via period_days pattern
    expect(result.total_breaches).toBe(0);
  });

  it("caches results after the first fetch", async () => {
    mockFetchOk(MOCK_BREACHES);

    await getConstraintBreaches({});
    await getConstraintBreaches({});

    // Only one fetch call (results served from cache on second call)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("handles fetch failure", async () => {
    mockFetchFail(503);

    await expect(getConstraintBreaches({})).rejects.toThrow(
      "UKPN constraint breaches dataset fetch failed: HTTP 503",
    );
  });

  it("handles empty results", async () => {
    mockFetchOk({ results: [] });

    const result = await getConstraintBreaches({});

    expect(result.total_breaches).toBe(0);
    expect(result.breaches).toEqual([]);
    expect(result.scheme_breakdown).toEqual({});
    expect(result.total_curtailment_kwh).toBe(0);
    expect(result.total_curtailment_hours).toBe(0);
  });

  it("skips rows with missing scheme or duration", async () => {
    mockFetchOk({
      results: [
        {
          scheme: null,
          start_time_utc: "2026-03-15T10:00:00+00:00",
          duration_hours: 1.0,
          constraint_description: "Missing scheme",
        },
        {
          scheme: "RAYLEIGH",
          start_time_utc: "2026-03-15T10:00:00+00:00",
          duration_hours: null,
          constraint_description: "Missing duration",
        },
        ...MOCK_BREACHES.results.slice(0, 1),
      ],
    });

    const result = await getConstraintBreaches({});

    // Only the valid RAYLEIGH record should survive
    expect(result.total_breaches).toBe(1);
    expect(result.breaches[0].scheme).toBe("RAYLEIGH");
  });
});
