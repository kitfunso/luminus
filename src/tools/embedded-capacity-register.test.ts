import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEmbeddedCapacityRegister,
  resetEcrCacheForTests,
} from "./embedded-capacity-register.js";

vi.mock("../lib/auth.js", () => ({
  resolveApiKey: vi.fn(async () => "mock-api-key"),
  ConfigurationError: class extends Error {
    constructor(name: string) {
      super(`Key "${name}" not configured`);
      this.name = "ConfigurationError";
    }
  },
}));

const MOCK_UKPN_RESPONSE = {
  total_count: 3,
  results: [
    {
      customer_name: "Solar Farm Alpha",
      energy_source_1: "Solar",
      energy_conversion_technology_1: "Photovoltaic",
      connection_status: "Connected",
      maximum_export_capacity_mw: 10.5,
      maximum_import_capacity_mw: 0.5,
      storage_capacity_1_mwh: null,
      grid_supply_point: "Barking GSP",
      bulk_supply_point: "Barking BSP",
      primary: "Barking Primary",
      licence_area: "LPN",
      point_of_connection_poc_voltage_kv: 33,
      latitude: 51.535,
      longitude: 0.081,
    },
    {
      customer_name: "Battery Storage Beta",
      energy_source_1: "Battery Storage",
      energy_conversion_technology_1: "Lithium Ion",
      connection_status: "Accepted to Connect",
      maximum_export_capacity_mw: 20.0,
      maximum_import_capacity_mw: 20.0,
      storage_capacity_1_mwh: 40.0,
      grid_supply_point: "Barking GSP",
      bulk_supply_point: "Barking BSP",
      primary: "Barking Primary",
      licence_area: "LPN",
      point_of_connection_poc_voltage_kv: 33,
      latitude: 51.536,
      longitude: 0.082,
    },
    {
      customer_name: "Wind Farm Gamma",
      energy_source_1: "Wind",
      energy_conversion_technology_1: "Wind Turbine",
      connection_status: "Connected",
      maximum_export_capacity_mw: 5.0,
      maximum_import_capacity_mw: 0.0,
      storage_capacity_1_mwh: null,
      grid_supply_point: "Remote GSP",
      bulk_supply_point: "Remote BSP",
      primary: "Remote Primary",
      licence_area: "EPN",
      point_of_connection_poc_voltage_kv: 132,
      latitude: 55.0,
      longitude: -3.0,
    },
  ],
};

const MOCK_SPEN_RESPONSE = {
  total_count: 2,
  results: [
    {
      customer_name: "Chapelcross Solar",
      energy_source_1: "Solar",
      connection_status: "Connected",
      maximum_export_capacity_mw: "8.5",
      maximum_import_capacity_mw: "0.2",
      storage_capacity_1_mwh: null,
      grid_supply_point: "Chapelcross GSP",
      licence_area: "SPD",
      point_of_connection_poc_voltage_kv: "33",
    },
    {
      customer_name: "Ayr Battery",
      energy_source_1: "Battery Storage",
      connection_status: "Accepted to Connect",
      maximum_export_capacity_mw: "15.0",
      maximum_import_capacity_mw: "15.0",
      storage_capacity_1_mwh: "30.0",
      grid_supply_point: "Ayr GSP",
      licence_area: "SPD",
      point_of_connection_poc_voltage_kv: "33",
    },
  ],
};

function mockFetchUkpnOk(payload: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => payload,
    })),
  );
}

function mockFetchSpenOk(payload: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => payload,
    })),
  );
}

function mockFetchBothOk(ukpnPayload: unknown, spenPayload: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("ukpowernetworks")) {
        return {
          ok: true,
          status: 200,
          json: async () => ukpnPayload,
        };
      }
      if (url.includes("spenergynetworks")) {
        return {
          ok: true,
          status: 200,
          json: async () => spenPayload,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    }),
  );
}

describe("getEmbeddedCapacityRegister", () => {
  beforeEach(() => {
    resetEcrCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns UKPN entries within the search radius with spatial matching", async () => {
    mockFetchUkpnOk(MOCK_UKPN_RESPONSE);

    const result = await getEmbeddedCapacityRegister({
      lat: 51.535,
      lon: 0.081,
      operator: "UKPN",
      radius_km: 5,
    });

    expect(result.operator).toBe("UKPN");
    expect(result.entries.length).toBeGreaterThanOrEqual(1);
    // Only nearby entries should match (Wind Farm Gamma is far away)
    const names = result.entries.map((e) => e.customer_name);
    expect(names).toContain("Solar Farm Alpha");
    expect(names).toContain("Battery Storage Beta");
    expect(names).not.toContain("Wind Farm Gamma");
    // Check distance_km is populated
    expect(result.entries[0].distance_km).toBeGreaterThanOrEqual(0);
    expect(result.total_matched).toBe(2);
    expect(result.total_export_mw).toBeCloseTo(30.5, 1);
    expect(result.total_storage_mwh).toBeCloseTo(40.0, 1);
  });

  it("returns SPEN entries without spatial matching (alphabetical order)", async () => {
    mockFetchSpenOk(MOCK_SPEN_RESPONSE);

    const result = await getEmbeddedCapacityRegister({
      lat: 55.0,
      lon: -3.0,
      operator: "SPEN",
    });

    expect(result.operator).toBe("SPEN");
    expect(result.entries).toHaveLength(2);
    // SPEN entries should be sorted alphabetically
    expect(result.entries[0].customer_name).toBe("Ayr Battery");
    expect(result.entries[1].customer_name).toBe("Chapelcross Solar");
    // SPEN has no coordinates — distance should be 0
    expect(result.entries[0].distance_km).toBe(0);
    expect(result.entries[1].distance_km).toBe(0);
    // SPEN fields are TEXT; verify number parsing
    expect(result.entries[0].export_capacity_mw).toBe(15.0);
    expect(result.entries[1].export_capacity_mw).toBe(8.5);
    expect(result.total_storage_mwh).toBeCloseTo(30.0, 1);
  });

  it("filters by energy_source", async () => {
    mockFetchUkpnOk(MOCK_UKPN_RESPONSE);

    const result = await getEmbeddedCapacityRegister({
      lat: 51.535,
      lon: 0.081,
      operator: "UKPN",
      radius_km: 5,
      energy_source: "Solar",
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].customer_name).toBe("Solar Farm Alpha");
    expect(result.entries[0].energy_source).toBe("Solar");
    expect(result.energy_source_breakdown).toEqual({ Solar: 1 });
  });

  it("filters by connection_status", async () => {
    mockFetchUkpnOk(MOCK_UKPN_RESPONSE);

    const result = await getEmbeddedCapacityRegister({
      lat: 51.535,
      lon: 0.081,
      operator: "UKPN",
      radius_km: 5,
      connection_status: "Accepted to Connect",
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].customer_name).toBe("Battery Storage Beta");
    expect(result.status_breakdown).toEqual({ "Accepted to Connect": 1 });
  });

  it("rejects unsupported operators", async () => {
    await expect(
      getEmbeddedCapacityRegister({
        lat: 51.5,
        lon: -0.1,
        operator: "ENWL",
      }),
    ).rejects.toThrow('Supported operators: "UKPN", "SPEN", "all".');
  });

  it("returns combined results for operator 'all'", async () => {
    mockFetchBothOk(MOCK_UKPN_RESPONSE, MOCK_SPEN_RESPONSE);

    const result = await getEmbeddedCapacityRegister({
      lat: 51.535,
      lon: 0.081,
      operator: "all",
      radius_km: 5,
    });

    expect(result.operator).toBe("all");
    // Should include nearby UKPN entries + all SPEN entries
    const operators = new Set(result.entries.map((e) => e.operator));
    expect(operators.has("UKPN")).toBe(true);
    expect(operators.has("SPEN")).toBe(true);
  });

  it("caches UKPN ECR records after the first fetch", async () => {
    mockFetchUkpnOk(MOCK_UKPN_RESPONSE);

    await getEmbeddedCapacityRegister({
      lat: 51.535,
      lon: 0.081,
      operator: "UKPN",
    });
    await getEmbeddedCapacityRegister({
      lat: 51.535,
      lon: 0.081,
      operator: "UKPN",
    });

    // Only one set of paginated fetches should occur
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("returns empty entries when no UKPN site is within the search radius", async () => {
    mockFetchUkpnOk(MOCK_UKPN_RESPONSE);

    const result = await getEmbeddedCapacityRegister({
      lat: 0.0,
      lon: 0.0,
      operator: "UKPN",
      radius_km: 1,
    });

    expect(result.total_matched).toBe(0);
    expect(result.entries).toEqual([]);
    expect(result.total_export_mw).toBe(0);
  });

  it("builds correct energy_source and status breakdowns", async () => {
    mockFetchUkpnOk(MOCK_UKPN_RESPONSE);

    const result = await getEmbeddedCapacityRegister({
      lat: 51.535,
      lon: 0.081,
      operator: "UKPN",
      radius_km: 5,
    });

    expect(result.energy_source_breakdown).toEqual({
      Solar: 1,
      "Battery Storage": 1,
    });
    expect(result.status_breakdown).toEqual({
      Connected: 1,
      "Accepted to Connect": 1,
    });
  });

  it("handles fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        text: async () => "error",
      })),
    );

    await expect(
      getEmbeddedCapacityRegister({
        lat: 51.5,
        lon: -0.1,
        operator: "UKPN",
      }),
    ).rejects.toThrow("UKPN ECR dataset fetch failed: HTTP 503");
  });
});
