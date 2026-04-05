import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the dependencies before importing the module under test
vi.mock("../lib/neso-gsp.js", () => ({
  lookupGspRegion: vi.fn(),
}));

vi.mock("./grid-connection-queue.js", () => ({
  getGridConnectionQueue: vi.fn(),
}));

vi.mock("./grid-proximity.js", () => ({
  getGridProximity: vi.fn(),
}));

vi.mock("./distribution-headroom.js", () => ({
  getDistributionHeadroom: vi.fn(),
}));

vi.mock("./nged-connection-signal.js", () => ({
  getNgedConnectionSignal: vi.fn(),
}));

import { getGridConnectionIntelligence } from "./grid-connection-intelligence.js";
import { lookupGspRegion } from "../lib/neso-gsp.js";
import { getGridConnectionQueue } from "./grid-connection-queue.js";
import { getGridProximity } from "./grid-proximity.js";
import { getDistributionHeadroom } from "./distribution-headroom.js";
import { getNgedConnectionSignal } from "./nged-connection-signal.js";

const mockLookupGspRegion = vi.mocked(lookupGspRegion);
const mockGetGridConnectionQueue = vi.mocked(getGridConnectionQueue);
const mockGetGridProximity = vi.mocked(getGridProximity);
const mockGetDistributionHeadroom = vi.mocked(getDistributionHeadroom);
const mockGetNgedConnectionSignal = vi.mocked(getNgedConnectionSignal);

const MOCK_GSP_RESULT = {
  gsp_id: "GSP_1",
  gsp_name: "BERKSWELL",
  region_id: "R1",
  region_name: "West Midlands",
  distance_km: 2.5,
};

const MOCK_TEC_RESULT = {
  filters: {
    connection_site_query: "West Midlands",
    project_name_query: null,
    host_to: null,
    plant_type: null,
    project_status: null,
    agreement_type: null,
  },
  summary: {
    matched_projects: 2,
    returned_projects: 2,
    total_connected_mw: 100,
    total_net_change_mw: 250,
    total_cumulative_capacity_mw: 350,
    earliest_effective_from: "2024-01-01",
    latest_effective_from: "2026-06-01",
  },
  connection_sites: [],
  projects: [
    {
      project_name: "Solar Farm Alpha",
      customer_name: "Alpha Ltd",
      connection_site: "Berkswell",
      stage: 1,
      mw_connected: 50,
      mw_increase_decrease: 100,
      cumulative_total_capacity_mw: 150,
      mw_effective_from: "2024-01-01",
      project_status: "Awaiting Consents",
      agreement_type: "Directly Connected",
      host_to: "NGET",
      plant_type: "Solar",
      project_id: "P001",
      project_number: "PN001",
      gate: null,
    },
    {
      project_name: "BESS Beta",
      customer_name: "Beta Energy",
      connection_site: "Berkswell",
      stage: 2,
      mw_connected: 50,
      mw_increase_decrease: 150,
      cumulative_total_capacity_mw: 200,
      mw_effective_from: "2026-06-01",
      project_status: "Scoping",
      agreement_type: "Directly Connected",
      host_to: "NGET",
      plant_type: "Energy Storage System",
      project_id: "P002",
      project_number: "PN002",
      gate: null,
    },
  ],
  source_metadata: {
    id: "neso-tec-register",
    name: "NESO TEC Register",
    provider: "NESO",
    licence: "NESO Open Data Licence",
    url: "https://api.neso.energy",
    api_key_required: false,
    coverage: "GB",
    update_frequency: "Twice weekly",
    reliability: "high" as const,
    caveats: [],
    attribution: "NESO",
  },
  disclaimer: "test disclaimer",
};

const MOCK_PROXIMITY_RESULT = {
  lat: 52.39,
  lon: -1.64,
  radius_km: 25,
  substations: [
    {
      name: "Berkswell Substation",
      voltage_kv: 132,
      operator: "NGET",
      distance_km: 1.2,
      lat: 52.395,
      lon: -1.643,
    },
    {
      name: null,
      voltage_kv: 33,
      operator: null,
      distance_km: 3.5,
      lat: 52.38,
      lon: -1.62,
    },
  ],
  lines: [],
  summary: {
    nearest_substation_km: 1.2,
    nearest_line_km: null,
    max_nearby_voltage_kv: 132,
  },
  source_metadata: {
    id: "overpass-osm",
    name: "Overpass API",
    provider: "OSM",
    licence: "ODbL",
    url: "https://overpass-api.de",
    api_key_required: false,
    coverage: "Global",
    update_frequency: "Near-real-time",
    reliability: "medium" as const,
    caveats: [],
    attribution: "OSM",
  },
};

const MOCK_DNO_RESULT = {
  lat: 52.39,
  lon: -1.64,
  operator: "SSEN",
  radius_km: 25,
  nearest_site: {
    asset_id: "E-ALPHA-01",
    licence_area: "England / SEPD",
    substation: "Alpha GSP",
    substation_type: "GSP",
    voltage_kv: "132",
    upstream_gsp: null,
    upstream_bsp: null,
    distance_km: 1.4,
    estimated_demand_headroom_mva: 8,
    demand_rag_status: "Amber",
    demand_constraint: "Demand constraint",
    connected_generation_mw: 10,
    contracted_generation_mw: 12,
    estimated_generation_headroom_mw: 35,
    generation_rag_status: "Green",
    generation_constraint: null,
    upstream_reinforcement_works: "Add transformer",
    upstream_reinforcement_completion_date: "Sep-26",
    substation_reinforcement_works: null,
    substation_reinforcement_completion_date: null,
  },
  matches: [],
  confidence_notes: [],
  source_metadata: {
    id: "ssen-distribution-headroom",
    name: "SSEN Distribution Headroom Dashboard",
    provider: "SSEN",
    licence: "Open Government Licence v3.0",
    url: "https://data-api.ssen.co.uk",
    api_key_required: false,
    coverage: "SSEN",
    update_frequency: "Periodic",
    reliability: "medium" as const,
    caveats: [],
    attribution: "SSEN",
  },
  disclaimer: "test disclaimer",
};

const MOCK_NGED_RESULT = {
  lat: 52.39,
  lon: -1.64,
  country: "GB",
  nearest_gsp: {
    gsp_id: "GSP_1",
    gsp_name: "BERKSWELL",
    distance_km: 2.5,
    region_id: "R1",
    region_name: "West Midlands",
  },
  queue_signal: {
    resource_name: "West Midlands",
    summary: {
      matched_projects: 2,
      returned_projects: 2,
      total_site_export_capacity_mw: 41.8,
      total_site_import_capacity_mw: 2.5,
      status_breakdown: {
        Accepted: 1,
        "Recently Connected": 1,
      },
      fuel_type_breakdown: {
        Battery: 1,
        Solar: 1,
      },
    },
    projects: [
      {
        licence_area: "East Midlands",
        gsp: "BERKSWELL 132kV S STN",
        tanm: false,
        danm: false,
        status: "Recently Connected",
        site_export_capacity_mw: 25,
      },
    ],
  },
  td_limits: {
    resource_name: "West Midlands Td Limits",
    summary: {
      matched_rows: 2,
      seasons: ["Summer", "Winter"],
      min_import_tl_mw: -302.6,
      max_export_tl_mw: 63.9,
    },
    rows: [
      {
        gsp_name: "West Midlands",
        season: "Winter",
        import_tl_mw: -302.6,
        export_tl_mw: 63.9,
      },
    ],
  },
  confidence_notes: [
    "NGED queue rows are project or machine records and should not be treated as available connection capacity",
  ],
  source_metadata: {
    gsp_lookup: {
      id: "neso-gsp-lookup",
    },
    queue_signal: {
      id: "nged-connection-queue",
    },
    td_limits: {
      id: "nged-asset-limits",
    },
  },
  disclaimer: "test disclaimer",
};

describe("getGridConnectionIntelligence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns result with nearest GSP and connection queue data", async () => {
    mockLookupGspRegion.mockResolvedValue(MOCK_GSP_RESULT);
    mockGetGridConnectionQueue.mockResolvedValue(MOCK_TEC_RESULT);
    mockGetGridProximity.mockResolvedValue(MOCK_PROXIMITY_RESULT);
    mockGetDistributionHeadroom.mockResolvedValue(MOCK_DNO_RESULT);
    mockGetNgedConnectionSignal.mockResolvedValue(MOCK_NGED_RESULT);

    const result = await getGridConnectionIntelligence({
      lat: 52.39,
      lon: -1.64,
      country: "GB",
    });

    expect(result.nearest_gsp).not.toBeNull();
    expect(result.nearest_gsp!.gsp_id).toBe("GSP_1");
    expect(result.nearest_gsp!.gsp_name).toBe("BERKSWELL");
    expect(result.nearest_gsp!.distance_km).toBe(2.5);

    expect(result.connection_queue).not.toBeNull();
    expect(result.connection_queue!.projects).toHaveLength(2);
    expect(result.connection_queue!.total_mw_queued).toBe(250);
    expect(result.connection_queue!.search_term).toBe("West Midlands");

    expect(result.nearby_substations).toHaveLength(2);
    expect(result.nearby_substations[0].name).toBe("Berkswell Substation");
    expect(result.nearby_substations[0].voltage_kv).toBe(132);
    expect(result.distribution_headroom).not.toBeNull();
    expect(result.distribution_headroom!.operator).toBe("SSEN");
    expect(result.distribution_headroom!.substation).toBe("Alpha GSP");
    expect(result.distribution_headroom!.estimated_generation_headroom_mw).toBe(35);
    expect(result.nged_connection_signal).not.toBeNull();
    expect(result.nged_connection_signal!.queue_signal?.summary.matched_projects).toBe(2);
    expect(result.nged_connection_signal!.td_limits?.summary.max_export_tl_mw).toBe(63.9);

    expect(result.country).toBe("GB");
    expect(result.lat).toBe(52.39);
    expect(result.lon).toBe(-1.64);
  });

  it("handles no GSP found gracefully", async () => {
    mockLookupGspRegion.mockResolvedValue(null);
    mockGetGridProximity.mockResolvedValue(MOCK_PROXIMITY_RESULT);
    mockGetDistributionHeadroom.mockResolvedValue({
      ...MOCK_DNO_RESULT,
      nearest_site: null,
    });

    const result = await getGridConnectionIntelligence({
      lat: 57.0,
      lon: -4.0,
      country: "GB",
    });

    expect(result.nearest_gsp).toBeNull();
    expect(result.connection_queue).toBeNull();
    expect(result.nearby_substations).toHaveLength(2);
    expect(result.distribution_headroom).toBeNull();
    expect(result.nged_connection_signal).toBeNull();

    // Should NOT have called TEC register
    expect(mockGetGridConnectionQueue).not.toHaveBeenCalled();
    expect(mockGetNgedConnectionSignal).not.toHaveBeenCalled();
  });

  it("handles TEC register failure gracefully", async () => {
    mockLookupGspRegion.mockResolvedValue(MOCK_GSP_RESULT);
    mockGetGridConnectionQueue.mockRejectedValue(new Error("NESO API timeout"));
    mockGetGridProximity.mockResolvedValue(MOCK_PROXIMITY_RESULT);
    mockGetDistributionHeadroom.mockResolvedValue(MOCK_DNO_RESULT);
    mockGetNgedConnectionSignal.mockResolvedValue(MOCK_NGED_RESULT);

    const result = await getGridConnectionIntelligence({
      lat: 52.39,
      lon: -1.64,
      country: "GB",
    });

    expect(result.nearest_gsp).not.toBeNull();
    expect(result.connection_queue).toBeNull();
    expect(result.nearby_substations).toHaveLength(2);
  });

  it("rejects non-GB country", async () => {
    await expect(
      getGridConnectionIntelligence({
        lat: 48.85,
        lon: 2.35,
        country: "FR",
      }),
    ).rejects.toThrow('Only country "GB" is supported');
  });

  it("confidence_notes always present", async () => {
    mockLookupGspRegion.mockResolvedValue(MOCK_GSP_RESULT);
    mockGetGridConnectionQueue.mockResolvedValue(MOCK_TEC_RESULT);
    mockGetGridProximity.mockResolvedValue(MOCK_PROXIMITY_RESULT);
    mockGetDistributionHeadroom.mockResolvedValue(MOCK_DNO_RESULT);
    mockGetNgedConnectionSignal.mockResolvedValue(MOCK_NGED_RESULT);

    const result = await getGridConnectionIntelligence({
      lat: 52.39,
      lon: -1.64,
      country: "GB",
    });

    expect(result.confidence_notes).toContain(
      "GSP lookup uses NESO region polygons when available, with nearest-point fallback if boundaries do not resolve a match",
    );
    expect(result.confidence_notes).toContain(
      "TEC register connection sites are matched by GSP name substring, not spatial coordinates",
    );
    expect(result.confidence_notes).toContain(
      "Connection queue data shows contracted positions, not guaranteed available capacity",
    );
    expect(result.confidence_notes).toContain(
      "Distribution headroom queries SSEN, NPG, UKPN, SPEN, and ENWL public data; coverage depends on the site's DNO area",
    );
    expect(result.confidence_notes).toContain(
      "NGED public queue and TD-limit context only appears where the matched GSP is covered by NGED's published resources",
    );
  });

  it("adds 'no GSP found' note when no GSP within radius", async () => {
    mockLookupGspRegion.mockResolvedValue(null);
    mockGetGridProximity.mockResolvedValue(MOCK_PROXIMITY_RESULT);
    mockGetDistributionHeadroom.mockResolvedValue({
      ...MOCK_DNO_RESULT,
      nearest_site: null,
    });

    const result = await getGridConnectionIntelligence({
      lat: 57.0,
      lon: -4.0,
      country: "GB",
    });

    expect(result.confidence_notes).toContain("No GSP found within search radius");
  });

  it("source_metadata includes NGED provenance alongside the existing sources", async () => {
    mockLookupGspRegion.mockResolvedValue(MOCK_GSP_RESULT);
    mockGetGridConnectionQueue.mockResolvedValue(MOCK_TEC_RESULT);
    mockGetGridProximity.mockResolvedValue(MOCK_PROXIMITY_RESULT);
    mockGetDistributionHeadroom.mockResolvedValue(MOCK_DNO_RESULT);
    mockGetNgedConnectionSignal.mockResolvedValue(MOCK_NGED_RESULT);

    const result = await getGridConnectionIntelligence({
      lat: 52.39,
      lon: -1.64,
      country: "GB",
    });

    expect(result.source_metadata.gsp_lookup).toBeDefined();
    expect(result.source_metadata.gsp_lookup.id).toBe("neso-gsp-lookup");
    expect(result.source_metadata.tec_register).toBeDefined();
    expect(result.source_metadata.tec_register.id).toBe("neso-tec-register");
    expect(result.source_metadata.grid_proximity).toBeDefined();
    expect(result.source_metadata.grid_proximity.id).toBe("overpass-osm");
    expect(result.source_metadata.distribution_headroom).toBeDefined();
    expect(result.source_metadata.distribution_headroom.id).toBe("ssen-distribution-headroom");
    expect(result.source_metadata.nged_queue_signal).toBeDefined();
    expect(result.source_metadata.nged_queue_signal.id).toBe("nged-connection-queue");
    expect(result.source_metadata.nged_td_limits).toBeDefined();
    expect(result.source_metadata.nged_td_limits.id).toBe("nged-asset-limits");
  });

  it("handles grid proximity failure gracefully", async () => {
    mockLookupGspRegion.mockResolvedValue(MOCK_GSP_RESULT);
    mockGetGridConnectionQueue.mockResolvedValue(MOCK_TEC_RESULT);
    mockGetGridProximity.mockRejectedValue(new Error("Overpass timeout"));
    mockGetDistributionHeadroom.mockResolvedValue(MOCK_DNO_RESULT);
    mockGetNgedConnectionSignal.mockResolvedValue(MOCK_NGED_RESULT);

    const result = await getGridConnectionIntelligence({
      lat: 52.39,
      lon: -1.64,
      country: "GB",
    });

    expect(result.nearest_gsp).not.toBeNull();
    expect(result.connection_queue).not.toBeNull();
    expect(result.nearby_substations).toEqual([]);
  });

  it("handles SSEN distribution headroom failure gracefully", async () => {
    mockLookupGspRegion.mockResolvedValue(MOCK_GSP_RESULT);
    mockGetGridConnectionQueue.mockResolvedValue(MOCK_TEC_RESULT);
    mockGetGridProximity.mockResolvedValue(MOCK_PROXIMITY_RESULT);
    mockGetDistributionHeadroom.mockRejectedValue(new Error("SSEN timeout"));
    mockGetNgedConnectionSignal.mockResolvedValue(MOCK_NGED_RESULT);

    const result = await getGridConnectionIntelligence({
      lat: 52.39,
      lon: -1.64,
      country: "GB",
    });

    expect(result.nearest_gsp).not.toBeNull();
    expect(result.connection_queue).not.toBeNull();
    expect(result.distribution_headroom).toBeNull();
  });

  it("handles NGED public signal failure gracefully", async () => {
    mockLookupGspRegion.mockResolvedValue(MOCK_GSP_RESULT);
    mockGetGridConnectionQueue.mockResolvedValue(MOCK_TEC_RESULT);
    mockGetGridProximity.mockResolvedValue(MOCK_PROXIMITY_RESULT);
    mockGetDistributionHeadroom.mockResolvedValue(MOCK_DNO_RESULT);
    mockGetNgedConnectionSignal.mockRejectedValue(new Error("NGED timeout"));

    const result = await getGridConnectionIntelligence({
      lat: 52.39,
      lon: -1.64,
      country: "GB",
    });

    expect(result.nearest_gsp).not.toBeNull();
    expect(result.connection_queue).not.toBeNull();
    expect(result.nged_connection_signal).toBeNull();
  });

  it("uses default radius_km of 25 when not provided", async () => {
    mockLookupGspRegion.mockResolvedValue(MOCK_GSP_RESULT);
    mockGetGridConnectionQueue.mockResolvedValue(MOCK_TEC_RESULT);
    mockGetGridProximity.mockResolvedValue(MOCK_PROXIMITY_RESULT);
    mockGetDistributionHeadroom.mockResolvedValue(MOCK_DNO_RESULT);
    mockGetNgedConnectionSignal.mockResolvedValue(MOCK_NGED_RESULT);

    await getGridConnectionIntelligence({
      lat: 52.39,
      lon: -1.64,
      country: "GB",
    });

    expect(mockLookupGspRegion).toHaveBeenCalledWith(52.39, -1.64, 25);
    expect(mockGetDistributionHeadroom).toHaveBeenCalledWith({
      lat: 52.39,
      lon: -1.64,
      operator: "SSEN",
      radius_km: 25,
    });
    expect(mockGetNgedConnectionSignal).toHaveBeenCalledWith({
      lat: 52.39,
      lon: -1.64,
      radius_km: 25,
      country: "GB",
    });
  });

  it("validates latitude range", async () => {
    await expect(
      getGridConnectionIntelligence({
        lat: 95,
        lon: -1.64,
        country: "GB",
      }),
    ).rejects.toThrow("Latitude must be between -90 and 90");
  });

  it("validates longitude range", async () => {
    await expect(
      getGridConnectionIntelligence({
        lat: 52.39,
        lon: 200,
        country: "GB",
      }),
    ).rejects.toThrow("Longitude must be between -180 and 180");
  });

  it("validates radius_km range", async () => {
    await expect(
      getGridConnectionIntelligence({
        lat: 52.39,
        lon: -1.64,
        radius_km: 60,
        country: "GB",
      }),
    ).rejects.toThrow("radius_km must be between 0 and 50");
  });
});
