import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./grid-connection-intelligence.js", () => ({
  getGridConnectionIntelligence: vi.fn(),
}));
vi.mock("./land-constraints.js", () => ({
  getLandConstraints: vi.fn(),
}));
vi.mock("./flood-risk.js", () => ({
  getFloodRisk: vi.fn(),
}));
vi.mock("./agricultural-land.js", () => ({
  getAgriculturalLand: vi.fn(),
}));

import { getSiteConnectionReport } from "./site-connection-report.js";
import { getGridConnectionIntelligence } from "./grid-connection-intelligence.js";
import { getLandConstraints } from "./land-constraints.js";
import { getFloodRisk } from "./flood-risk.js";
import { getAgriculturalLand } from "./agricultural-land.js";

const mockGridIntel = vi.mocked(getGridConnectionIntelligence);
const mockLandConstraints = vi.mocked(getLandConstraints);
const mockFloodRisk = vi.mocked(getFloodRisk);
const mockAgriLand = vi.mocked(getAgriculturalLand);

const BASE_GRID_RESULT = {
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
  connection_queue: {
    projects: [
      {
        project_name: "Solar Farm Alpha",
        customer_name: "Alpha Ltd",
        connection_site: "Berkswell",
        stage: 1,
        mw_connected: 0,
        mw_increase_decrease: 100,
        cumulative_total_capacity_mw: 100,
        mw_effective_from: "2024-01-01",
        project_status: "Awaiting Consents",
        agreement_type: "Directly Connected",
        host_to: "NGET",
        plant_type: "Solar",
        project_id: "P001",
        project_number: "PN001",
        gate: null,
      },
    ],
    total_mw_queued: 100,
    search_term: "West Midlands",
  },
  nearby_substations: [],
  distribution_headroom: {
    operator: "SSEN",
    substation: "Alpha GSP",
    substation_type: "GSP",
    distance_km: 1.4,
    estimated_generation_headroom_mw: 35,
    estimated_demand_headroom_mva: 8,
    generation_rag_status: "Green",
    demand_rag_status: "Amber",
    generation_constraint: null,
    demand_constraint: "Demand constraint",
    upstream_reinforcement_works: null,
    upstream_reinforcement_completion_date: null,
  },
  nged_connection_signal: {
    queue_signal: {
      resource_name: "West Midlands",
      summary: {
        matched_projects: 0,
        returned_projects: 0,
        total_site_export_capacity_mw: 0,
        total_site_import_capacity_mw: 0,
        status_breakdown: {},
        fuel_type_breakdown: {},
      },
      projects: [],
    },
    td_limits: {
      resource_name: "West Midlands Td Limits",
      summary: {
        matched_rows: 2,
        seasons: ["Summer", "Winter"],
        min_import_tl_mw: -100,
        max_export_tl_mw: 63.9,
      },
      rows: [],
    },
  },
  confidence_notes: [],
  source_metadata: {
    gsp_lookup: { id: "neso-gsp-lookup" },
    tec_register: { id: "neso-tec-register" },
    grid_proximity: { id: "overpass-osm" },
    distribution_headroom: { id: "ssen-distribution-headroom" },
    nged_queue_signal: { id: "nged-connection-queue" },
    nged_td_limits: { id: "nged-asset-limits" },
  },
  disclaimer: "test",
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const BASE_LAND_RESULT = {
  lat: 52.39,
  lon: -1.64,
  radius_km: 2,
  country: "GB",
  constraints: [],
  summary: { has_hard_constraint: false, constraint_count: 0 },
  source_metadata: { id: "natural-england" },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const BASE_FLOOD_RESULT = {
  lat: 52.39,
  lon: -1.64,
  country: "GB",
  flood_zone: "1",
  flood_storage_area: false,
  planning_risk: "low",
  flood_zone_3: [],
  flood_zone_2: [],
  flood_storage_areas: [],
  explanation: "Point does not intersect any flood zone.",
  source_metadata: { id: "ea-flood-map" },
  disclaimer: "test",
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const BASE_ALC_RESULT = {
  lat: 52.39,
  lon: -1.64,
  country: "GB",
  post_1988: null,
  provisional: { source: "provisional", grade: "Grade 4", area_ha: 10, survey_ref: null },
  effective_grade: "Grade 4",
  bmv_status: "no",
  classification_basis: "provisional",
  explanation: "Not BMV.",
  source_metadata: { id: "natural-england-alc" },
  disclaimer: "test",
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe("getSiteConnectionReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a structured report when all upstreams resolve", async () => {
    mockGridIntel.mockResolvedValue(BASE_GRID_RESULT);
    mockLandConstraints.mockResolvedValue(BASE_LAND_RESULT);
    mockFloodRisk.mockResolvedValue(BASE_FLOOD_RESULT);
    mockAgriLand.mockResolvedValue(BASE_ALC_RESULT);

    const result = await getSiteConnectionReport({
      lat: 52.39,
      lon: -1.64,
      capacity_kind: "generation",
      project_name: "Alpha",
    });

    expect(result.project_name).toBe("Alpha");
    expect(result.lat).toBe(52.39);
    expect(result.lon).toBe(-1.64);
    expect(result.capacity_kind).toBe("generation");
    expect(result.structured.nearest_gsp?.gsp_name).toBe("BERKSWELL");
    expect(result.structured.tec_queue.total_mw_queued).toBe(100);
    expect(result.structured.tec_queue.top_entries.length).toBeGreaterThan(0);
    expect(result.structured.tec_queue.top_entries[0].source).toBe("neso-tec");
    expect(result.structured.dno_headroom.operator).toBe("SSEN");
    expect(result.structured.dno_headroom.canonical?.source).toBe("ssen");
    expect(result.structured.constraints.protected_area.flag).toBe(false);
    expect(result.structured.constraints.flood.flag).toBe(false);
    expect(result.structured.constraints.alc_grade.flag).toBe(false);
  });

  it("maps DNO generation RAG to the headroom traffic light", async () => {
    mockGridIntel.mockResolvedValue({
      ...BASE_GRID_RESULT,
      distribution_headroom: {
        ...BASE_GRID_RESULT.distribution_headroom,
        generation_rag_status: "Red",
      },
    });
    mockLandConstraints.mockResolvedValue(BASE_LAND_RESULT);
    mockFloodRisk.mockResolvedValue(BASE_FLOOD_RESULT);
    mockAgriLand.mockResolvedValue(BASE_ALC_RESULT);

    const result = await getSiteConnectionReport({
      lat: 52.39,
      lon: -1.64,
      capacity_kind: "generation",
    });

    expect(result.traffic_lights.headroom).toBe("red");
  });

  it("sets headroom to unknown when there is no DNO RAG status", async () => {
    mockGridIntel.mockResolvedValue({
      ...BASE_GRID_RESULT,
      distribution_headroom: {
        ...BASE_GRID_RESULT.distribution_headroom,
        generation_rag_status: null,
      },
    });
    mockLandConstraints.mockResolvedValue(BASE_LAND_RESULT);
    mockFloodRisk.mockResolvedValue(BASE_FLOOD_RESULT);
    mockAgriLand.mockResolvedValue(BASE_ALC_RESULT);

    const result = await getSiteConnectionReport({
      lat: 52.39,
      lon: -1.64,
      capacity_kind: "generation",
    });

    expect(result.traffic_lights.headroom).toBe("unknown");
  });

  it("sets land_constraints traffic light to red on hard designations", async () => {
    mockGridIntel.mockResolvedValue(BASE_GRID_RESULT);
    mockLandConstraints.mockResolvedValue({
      ...BASE_LAND_RESULT,
      constraints: [{ type: "sssi", name: "Foo SSSI", distance_km: 0 }],
      summary: { has_hard_constraint: true, constraint_count: 1 },
    });
    mockFloodRisk.mockResolvedValue(BASE_FLOOD_RESULT);
    mockAgriLand.mockResolvedValue(BASE_ALC_RESULT);

    const result = await getSiteConnectionReport({
      lat: 52.39,
      lon: -1.64,
      capacity_kind: "generation",
    });

    expect(result.traffic_lights.land_constraints).toBe("red");
    expect(result.structured.constraints.protected_area.flag).toBe(true);
    expect(result.structured.constraints.protected_area.reason).toContain("sssi");
  });

  it("keeps queue traffic light as unknown when TEC data is missing", async () => {
    mockGridIntel.mockRejectedValue(new Error("NESO timeout"));
    mockLandConstraints.mockResolvedValue(BASE_LAND_RESULT);
    mockFloodRisk.mockResolvedValue(BASE_FLOOD_RESULT);
    mockAgriLand.mockResolvedValue(BASE_ALC_RESULT);

    const result = await getSiteConnectionReport({
      lat: 52.39,
      lon: -1.64,
      capacity_kind: "generation",
    });

    expect(result.traffic_lights.queue).toBe("unknown");
    expect(result.structured.nearest_gsp).toBeNull();
    expect(result.structured.tec_queue.total_mw_queued).toBeNull();
  });

  it("does not upgrade to green when grid resolved but connection_queue is null", async () => {
    mockGridIntel.mockResolvedValue({
      ...BASE_GRID_RESULT,
      nearest_gsp: null,
      connection_queue: null,
      nged_connection_signal: null,
    });
    mockLandConstraints.mockResolvedValue(BASE_LAND_RESULT);
    mockFloodRisk.mockResolvedValue(BASE_FLOOD_RESULT);
    mockAgriLand.mockResolvedValue(BASE_ALC_RESULT);

    const result = await getSiteConnectionReport({
      lat: 52.39,
      lon: -1.64,
      capacity_kind: "generation",
    });

    expect(result.traffic_lights.queue).toBe("unknown");
    expect(result.structured.tec_queue.total_mw_queued).toBeNull();
    expect(result.structured.tec_queue.project_count).toBeNull();
  });

  it("marks queue traffic light green only when zero TEC and zero NGED entries", async () => {
    mockGridIntel.mockResolvedValue({
      ...BASE_GRID_RESULT,
      connection_queue: { projects: [], total_mw_queued: 0, search_term: "West Midlands" },
    });
    mockLandConstraints.mockResolvedValue(BASE_LAND_RESULT);
    mockFloodRisk.mockResolvedValue(BASE_FLOOD_RESULT);
    mockAgriLand.mockResolvedValue(BASE_ALC_RESULT);

    const result = await getSiteConnectionReport({
      lat: 52.39,
      lon: -1.64,
      capacity_kind: "generation",
    });

    expect(result.traffic_lights.queue).toBe("green");
  });

  it("includes the project name and coordinates in the markdown summary", async () => {
    mockGridIntel.mockResolvedValue(BASE_GRID_RESULT);
    mockLandConstraints.mockResolvedValue(BASE_LAND_RESULT);
    mockFloodRisk.mockResolvedValue(BASE_FLOOD_RESULT);
    mockAgriLand.mockResolvedValue(BASE_ALC_RESULT);

    const result = await getSiteConnectionReport({
      lat: 52.39,
      lon: -1.64,
      capacity_kind: "generation",
      project_name: "Alpha Solar",
    });

    expect(result.summary).toContain("Alpha Solar");
    expect(result.summary).toContain("52.39000");
    expect(result.summary).toContain("-1.64000");
    expect(result.summary).toContain("Traffic lights");
    expect(result.summary).toContain("Disclaimer");
  });

  it("exposes source metadata and disclaimer", async () => {
    mockGridIntel.mockResolvedValue(BASE_GRID_RESULT);
    mockLandConstraints.mockResolvedValue(BASE_LAND_RESULT);
    mockFloodRisk.mockResolvedValue(BASE_FLOOD_RESULT);
    mockAgriLand.mockResolvedValue(BASE_ALC_RESULT);

    const result = await getSiteConnectionReport({
      lat: 52.39,
      lon: -1.64,
      capacity_kind: "generation",
    });

    expect(result.source_metadata.grid_connection_intelligence.gsp_lookup.id).toBe("neso-gsp-lookup");
    expect(result.source_metadata.grid_connection_intelligence.tec_register.id).toBe("neso-tec-register");
    expect(result.source_metadata.land_constraints.id).toBe("natural-england");
    expect(result.source_metadata.flood_risk.id).toBe("ea-flood-map");
    expect(result.source_metadata.agricultural_land.id).toBe("natural-england-alc");
    expect(result.disclaimer).toContain("not a connection offer");
    expect(result.disclaimer).toContain("Gate 2 decision");
  });

  it("flags flood zone 3 in the flood constraint", async () => {
    mockGridIntel.mockResolvedValue(BASE_GRID_RESULT);
    mockLandConstraints.mockResolvedValue(BASE_LAND_RESULT);
    mockFloodRisk.mockResolvedValue({
      ...BASE_FLOOD_RESULT,
      flood_zone: "3",
      planning_risk: "high",
      explanation: "Point is in Flood Zone 3.",
    });
    mockAgriLand.mockResolvedValue(BASE_ALC_RESULT);

    const result = await getSiteConnectionReport({
      lat: 52.39,
      lon: -1.64,
      capacity_kind: "generation",
    });

    expect(result.structured.constraints.flood.flag).toBe(true);
    expect(result.structured.constraints.flood.reason).toContain("Flood Zone 3");
  });

  it("flags BMV agricultural land", async () => {
    mockGridIntel.mockResolvedValue(BASE_GRID_RESULT);
    mockLandConstraints.mockResolvedValue(BASE_LAND_RESULT);
    mockFloodRisk.mockResolvedValue(BASE_FLOOD_RESULT);
    mockAgriLand.mockResolvedValue({
      ...BASE_ALC_RESULT,
      effective_grade: "Grade 2",
      bmv_status: "yes",
    });

    const result = await getSiteConnectionReport({
      lat: 52.39,
      lon: -1.64,
      capacity_kind: "generation",
    });

    expect(result.structured.constraints.alc_grade.flag).toBe(true);
    expect(result.structured.constraints.alc_grade.reason).toContain("Grade 2");
  });

  it("validates latitude range", async () => {
    await expect(
      getSiteConnectionReport({
        lat: 200,
        lon: -1.64,
        capacity_kind: "generation",
      }),
    ).rejects.toThrow("Latitude must be between -90 and 90");
  });

  it("validates radius_km upper bound", async () => {
    await expect(
      getSiteConnectionReport({
        lat: 52.39,
        lon: -1.64,
        radius_km: 100,
        capacity_kind: "generation",
      }),
    ).rejects.toThrow("radius_km must be between 0 and 50");
  });

  it("rejects coordinates outside Great Britain with a pointer to screen_site", async () => {
    await expect(
      getSiteConnectionReport({
        // Paris — valid lat/lon, outside GB bounding box.
        lat: 48.85,
        lon: 2.35,
        capacity_kind: "generation",
      }),
    ).rejects.toThrow(/outside Great Britain/);

    await expect(
      getSiteConnectionReport({
        lat: 48.85,
        lon: 2.35,
        capacity_kind: "generation",
      }),
    ).rejects.toThrow(/screen_site/);
  });
});
