import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getUkpnGridOverview,
  resetUkpnGridOverviewCacheForTests,
} from "./ukpn-grid-overview.js";

vi.mock("../lib/auth.js", () => ({
  resolveApiKey: vi.fn(async () => "mock-api-key"),
  ConfigurationError: class extends Error {
    constructor(name: string) {
      super(`Key "${name}" not configured`);
      this.name = "ConfigurationError";
    }
  },
}));

const MOCK_GSP_RESPONSE = {
  total_count: 2,
  results: [
    {
      dno: "EPN",
      gsp: "Barking Grid",
      minimum_observed_power_flow: -10.5,
      maximum_observed_power_flow: 85.2,
      asset_import_limit: "120 MVA",
      asset_export_limit: 40,
      technical_limit_import_summer: "100 MVA",
      technical_limit_import_winter: "110 MVA",
      technical_limit_export: "50 MVA",
      export_capacity_utilisation: 72.5,
      import_capacity_utilisation: 85.0,
      geo_point_2d: { lat: 51.535, lon: 0.081 },
    },
    {
      dno: "LPN",
      gsp: "City Road",
      minimum_observed_power_flow: -5.0,
      maximum_observed_power_flow: 60.0,
      asset_import_limit: "90 MVA",
      asset_export_limit: 30,
      technical_limit_import_summer: "80 MVA",
      technical_limit_import_winter: "85 MVA",
      technical_limit_export: "40 MVA",
      export_capacity_utilisation: 55.0,
      import_capacity_utilisation: 70.0,
      geo_point_2d: { lat: 51.528, lon: -0.099 },
    },
  ],
};

const MOCK_FLEX_RESPONSE = {
  total_count: 2,
  results: [
    {
      dno: "EPN",
      tender_round: "TR5",
      flexbility_zone: "Barking Flex Zone",
      constraint_type: "Thermal",
      geo_point_2d: { lat: 51.536, lon: 0.082 },
    },
    {
      dno: "SPN",
      tender_round: null,
      flexbility_zone: "Canterbury Flex Zone",
      constraint_type: "Voltage",
      geo_point_2d: { lat: 51.28, lon: 1.08 },
    },
  ],
};

const MOCK_FAULTS_RESPONSE = {
  total_count: 2,
  results: [
    {
      incidentreference: "INCD-12345",
      powercuttype: "Unplanned",
      nocustomeraffected: 150,
      incidentdescription: "Underground cable fault",
      incidentcategory: "HV",
      statusid: 2,
      geopoint: { lat: 51.534, lon: 0.080 },
      estimatedrestorationdate: "2026-04-03T14:00:00Z",
      operatingzone: "East",
    },
    {
      incidentreference: "INCD-67890",
      powercuttype: "Planned",
      nocustomeraffected: 0,
      incidentdescription: "Scheduled maintenance",
      incidentcategory: "LV",
      statusid: 1,
      geopoint: { lat: 51.52, lon: -0.10 },
      estimatedrestorationdate: "2026-04-04T18:00:00Z",
      operatingzone: "Central",
    },
  ],
};

function mockFetchAll(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(input);

      if (url.includes("ukpn-grid-supply-points-overview")) {
        return {
          ok: true,
          status: 200,
          json: async () => MOCK_GSP_RESPONSE,
        };
      }

      if (url.includes("ukpn-hv-flex-zones")) {
        return {
          ok: true,
          status: 200,
          json: async () => MOCK_FLEX_RESPONSE,
        };
      }

      if (url.includes("ukpn-live-faults")) {
        return {
          ok: true,
          status: 200,
          json: async () => MOCK_FAULTS_RESPONSE,
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    }),
  );
}

function mockFetchGspFail(status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(input);

      if (url.includes("ukpn-grid-supply-points-overview")) {
        return { ok: false, status, text: async () => "error" };
      }

      if (url.includes("ukpn-hv-flex-zones")) {
        return {
          ok: true,
          status: 200,
          json: async () => MOCK_FLEX_RESPONSE,
        };
      }

      if (url.includes("ukpn-live-faults")) {
        return {
          ok: true,
          status: 200,
          json: async () => MOCK_FAULTS_RESPONSE,
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    }),
  );
}

describe("getUkpnGridOverview", () => {
  beforeEach(() => {
    resetUkpnGridOverviewCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns all GSPs, flex zones, and faults when no lat/lon provided", async () => {
    mockFetchAll();

    const result = await getUkpnGridOverview({});

    expect(result.lat).toBeNull();
    expect(result.lon).toBeNull();
    expect(result.radius_km).toBeNull();

    expect(result.gsps).toHaveLength(2);
    expect(result.gsps[0].gsp).toBe("Barking Grid");
    expect(result.gsps[0].dno).toBe("EPN");
    expect(result.gsps[0].max_observed_flow_mw).toBe(85.2);
    expect(result.gsps[0].export_utilisation_pct).toBe(72.5);
    expect(result.gsps[0].distance_km).toBeNull();

    expect(result.flex_zones).toHaveLength(2);
    expect(result.flex_zones[0].zone).toBe("Barking Flex Zone");
    expect(result.flex_zones[0].constraint_type).toBe("Thermal");
    expect(result.flex_zones[0].tender_round).toBe("TR5");
    expect(result.flex_zones[0].distance_km).toBeNull();

    expect(result.live_faults).toHaveLength(2);
    expect(result.live_faults[0].reference).toBe("INCD-12345");
    expect(result.live_faults[0].type).toBe("Unplanned");
    expect(result.live_faults[0].customers_affected).toBe(150);
    expect(result.live_faults[0].operating_zone).toBe("East");

    expect(result.source_metadata.gsp_overview.id).toBe("ukpn-gsp-overview");
    expect(result.source_metadata.flex_zones.id).toBe("ukpn-flex-zones");
    expect(result.source_metadata.live_faults.id).toBe("ukpn-live-faults");

    expect(result.disclaimer).toContain("UK Power Networks");
  });

  it("filters and sorts by distance when lat/lon provided", async () => {
    mockFetchAll();

    const result = await getUkpnGridOverview({
      lat: 51.535,
      lon: 0.081,
      radius_km: 10,
    });

    expect(result.lat).toBe(51.535);
    expect(result.lon).toBe(0.081);
    expect(result.radius_km).toBe(10);

    expect(result.gsps).toHaveLength(1);
    expect(result.gsps[0].gsp).toBe("Barking Grid");
    expect(result.gsps[0].distance_km).toBeLessThan(1);

    expect(result.flex_zones).toHaveLength(1);
    expect(result.flex_zones[0].zone).toBe("Barking Flex Zone");
    expect(result.flex_zones[0].distance_km).toBeLessThan(1);

    expect(result.live_faults).toHaveLength(1);
    expect(result.live_faults[0].reference).toBe("INCD-12345");
    expect(result.live_faults[0].distance_km).toBeLessThan(1);
  });

  it("excludes faults when include_faults is false", async () => {
    mockFetchAll();

    const result = await getUkpnGridOverview({
      include_faults: false,
    });

    expect(result.gsps).toHaveLength(2);
    expect(result.flex_zones).toHaveLength(2);
    expect(result.live_faults).toHaveLength(0);

    const fetchMock = vi.mocked(fetch);
    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.includes("ukpn-live-faults"))).toBe(false);
  });

  it("clamps radius to max 100km", async () => {
    mockFetchAll();

    const result = await getUkpnGridOverview({
      lat: 51.5,
      lon: 0.0,
      radius_km: 200,
    });

    expect(result.radius_km).toBe(100);
  });

  it("caches GSP and flex zone data after first fetch", async () => {
    mockFetchAll();

    await getUkpnGridOverview({});
    await getUkpnGridOverview({});

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("handles GSP fetch failure", async () => {
    mockFetchGspFail(503);

    await expect(getUkpnGridOverview({})).rejects.toThrow(
      "UKPN GSP overview fetch failed: HTTP 503",
    );
  });

  it("returns empty arrays when search radius excludes all results", async () => {
    mockFetchAll();

    const result = await getUkpnGridOverview({
      lat: 55.0,
      lon: -3.0,
      radius_km: 5,
    });

    expect(result.gsps).toEqual([]);
    expect(result.flex_zones).toEqual([]);
    expect(result.live_faults).toEqual([]);
  });

  it("uses default radius of 50km when lat/lon provided without radius", async () => {
    mockFetchAll();

    const result = await getUkpnGridOverview({
      lat: 51.535,
      lon: 0.081,
    });

    expect(result.radius_km).toBe(50);
    expect(result.gsps.length).toBeGreaterThanOrEqual(1);
  });
});
