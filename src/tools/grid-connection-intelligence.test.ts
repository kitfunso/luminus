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

import { getGridConnectionIntelligence } from "./grid-connection-intelligence.js";
import { lookupGspRegion } from "../lib/neso-gsp.js";
import { getGridConnectionQueue } from "./grid-connection-queue.js";
import { getGridProximity } from "./grid-proximity.js";

const mockLookupGspRegion = vi.mocked(lookupGspRegion);
const mockGetGridConnectionQueue = vi.mocked(getGridConnectionQueue);
const mockGetGridProximity = vi.mocked(getGridProximity);

const MOCK_GSP_RESULT = {
  gsp_id: "GSP_1",
  gsp_name: "BERKSWELL",
  region_id: "R1",
  region_name: "West Midlands",
  distance_km: 2.5,
};

const MOCK_TEC_RESULT = {
  filters: {
    connection_site_query: "Berkswell",
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
    expect(result.connection_queue!.search_term).toBe("Berkswell");

    expect(result.nearby_substations).toHaveLength(2);
    expect(result.nearby_substations[0].name).toBe("Berkswell Substation");
    expect(result.nearby_substations[0].voltage_kv).toBe(132);

    expect(result.country).toBe("GB");
    expect(result.lat).toBe(52.39);
    expect(result.lon).toBe(-1.64);
  });

  it("handles no GSP found gracefully", async () => {
    mockLookupGspRegion.mockResolvedValue(null);
    mockGetGridProximity.mockResolvedValue(MOCK_PROXIMITY_RESULT);

    const result = await getGridConnectionIntelligence({
      lat: 57.0,
      lon: -4.0,
      country: "GB",
    });

    expect(result.nearest_gsp).toBeNull();
    expect(result.connection_queue).toBeNull();
    expect(result.nearby_substations).toHaveLength(2);

    // Should NOT have called TEC register
    expect(mockGetGridConnectionQueue).not.toHaveBeenCalled();
  });

  it("handles TEC register failure gracefully", async () => {
    mockLookupGspRegion.mockResolvedValue(MOCK_GSP_RESULT);
    mockGetGridConnectionQueue.mockRejectedValue(new Error("NESO API timeout"));
    mockGetGridProximity.mockResolvedValue(MOCK_PROXIMITY_RESULT);

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

    const result = await getGridConnectionIntelligence({
      lat: 52.39,
      lon: -1.64,
      country: "GB",
    });

    expect(result.confidence_notes).toContain(
      "GSP lookup uses nearest-GSP approximation, not polygon containment",
    );
    expect(result.confidence_notes).toContain(
      "TEC register connection sites are matched by GSP name substring, not spatial coordinates",
    );
    expect(result.confidence_notes).toContain(
      "Connection queue data shows contracted positions, not guaranteed available capacity",
    );
  });

  it("adds 'no GSP found' note when no GSP within radius", async () => {
    mockLookupGspRegion.mockResolvedValue(null);
    mockGetGridProximity.mockResolvedValue(MOCK_PROXIMITY_RESULT);

    const result = await getGridConnectionIntelligence({
      lat: 57.0,
      lon: -4.0,
      country: "GB",
    });

    expect(result.confidence_notes).toContain("No GSP found within search radius");
  });

  it("source_metadata includes all three sources", async () => {
    mockLookupGspRegion.mockResolvedValue(MOCK_GSP_RESULT);
    mockGetGridConnectionQueue.mockResolvedValue(MOCK_TEC_RESULT);
    mockGetGridProximity.mockResolvedValue(MOCK_PROXIMITY_RESULT);

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
  });

  it("handles grid proximity failure gracefully", async () => {
    mockLookupGspRegion.mockResolvedValue(MOCK_GSP_RESULT);
    mockGetGridConnectionQueue.mockResolvedValue(MOCK_TEC_RESULT);
    mockGetGridProximity.mockRejectedValue(new Error("Overpass timeout"));

    const result = await getGridConnectionIntelligence({
      lat: 52.39,
      lon: -1.64,
      country: "GB",
    });

    expect(result.nearest_gsp).not.toBeNull();
    expect(result.connection_queue).not.toBeNull();
    expect(result.nearby_substations).toEqual([]);
  });

  it("uses default radius_km of 25 when not provided", async () => {
    mockLookupGspRegion.mockResolvedValue(MOCK_GSP_RESULT);
    mockGetGridConnectionQueue.mockResolvedValue(MOCK_TEC_RESULT);
    mockGetGridProximity.mockResolvedValue(MOCK_PROXIMITY_RESULT);

    await getGridConnectionIntelligence({
      lat: 52.39,
      lon: -1.64,
      country: "GB",
    });

    expect(mockLookupGspRegion).toHaveBeenCalledWith(52.39, -1.64, 25);
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
