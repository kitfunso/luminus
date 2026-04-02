import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./compare-sites.js", () => ({
  compareSites: vi.fn(),
}));

vi.mock("./grid-connection-intelligence.js", () => ({
  getGridConnectionIntelligence: vi.fn(),
}));

vi.mock("./site-revenue.js", () => ({
  estimateSiteRevenue: vi.fn(),
}));

vi.mock("./distribution-headroom.js", () => ({
  getDistributionHeadroom: vi.fn(),
}));

import { shortlistBessSites } from "./bess-shortlist.js";
import { compareSites } from "./compare-sites.js";
import { getGridConnectionIntelligence } from "./grid-connection-intelligence.js";
import { estimateSiteRevenue } from "./site-revenue.js";
import { getDistributionHeadroom } from "./distribution-headroom.js";

const compareSitesMock = vi.mocked(compareSites);
const getGridConnectionIntelligenceMock = vi.mocked(getGridConnectionIntelligence);
const estimateSiteRevenueMock = vi.mocked(estimateSiteRevenue);
const getDistributionHeadroomMock = vi.mocked(getDistributionHeadroom);

describe("shortlistBessSites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDistributionHeadroomMock.mockResolvedValue({
      lat: 0,
      lon: 0,
      operator: "SSEN",
      radius_km: 25,
      nearest_site: null,
      matches: [],
      confidence_notes: ["No SSEN headroom site found within search radius"],
      source_metadata: {} as any,
      disclaimer: "dno",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a ranked BESS shortlist with GIS, revenue, and queue context", async () => {
    compareSitesMock.mockResolvedValue({
      site_count: 3,
      rankings: [
        {
          rank: 1,
          label: "Alpha",
          lat: 52.1,
          lon: -0.1,
          verdict: "pass",
          flag_count: 0,
          solar_kwh_m2: 1120,
          slope_deg: 2.1,
          nearest_grid_km: 0.9,
          constraint_count: 0,
          score: 92,
          reasoning: "Strong GIS site.",
          data_gaps: [],
        },
        {
          rank: 2,
          label: "Bravo",
          lat: 52.2,
          lon: -0.2,
          verdict: "pass",
          flag_count: 0,
          solar_kwh_m2: 1110,
          slope_deg: 2.6,
          nearest_grid_km: 1.2,
          constraint_count: 0,
          score: 84,
          reasoning: "Good GIS site.",
          data_gaps: [],
        },
        {
          rank: 3,
          label: "Charlie",
          lat: 52.3,
          lon: -0.3,
          verdict: "warn",
          flag_count: 1,
          solar_kwh_m2: 1105,
          slope_deg: 5.4,
          nearest_grid_km: 1.8,
          constraint_count: 0,
          score: 73,
          reasoning: "Usable with caveats.",
          data_gaps: [],
        },
      ],
      failed_sites: [],
      heuristics_used: ["GIS heuristic"],
      disclaimer: "GIS disclaimer",
    });

    estimateSiteRevenueMock
      .mockResolvedValueOnce({
        lat: 52.1,
        lon: -0.1,
        zone: "GB",
        technology: "bess",
        capacity_mw: 25,
        terrain: null,
        revenue: { estimated_annual_revenue_eur: 420000, daily_revenue_eur: 1150 },
        price_snapshot: null,
        caveats: [],
        disclaimer: "rev",
      })
      .mockResolvedValueOnce({
        lat: 52.2,
        lon: -0.2,
        zone: "GB",
        technology: "bess",
        capacity_mw: 25,
        terrain: null,
        revenue: { estimated_annual_revenue_eur: 760000, daily_revenue_eur: 2080 },
        price_snapshot: null,
        caveats: [],
        disclaimer: "rev",
      })
      .mockResolvedValueOnce({
        lat: 52.3,
        lon: -0.3,
        zone: "GB",
        technology: "bess",
        capacity_mw: 25,
        terrain: null,
        revenue: { estimated_annual_revenue_eur: 510000, daily_revenue_eur: 1397 },
        price_snapshot: null,
        caveats: [],
        disclaimer: "rev",
      });

    getGridConnectionIntelligenceMock
      .mockResolvedValueOnce({
        lat: 52.1,
        lon: -0.1,
        country: "GB",
        nearest_gsp: { gsp_id: "A", gsp_name: "Alpha", distance_km: 1.5, region_id: "RA", region_name: "Alpha" },
        connection_queue: { projects: [{ id: 1 }], total_mw_queued: 2800, search_term: "Alpha" },
        nearby_substations: [],
        confidence_notes: ["Queue is heavy"],
        source_metadata: {} as any,
        disclaimer: "queue",
      })
      .mockResolvedValueOnce({
        lat: 52.2,
        lon: -0.2,
        country: "GB",
        nearest_gsp: { gsp_id: "B", gsp_name: "Bravo", distance_km: 1.1, region_id: "RB", region_name: "Bravo" },
        connection_queue: { projects: [{ id: 1 }], total_mw_queued: 250, search_term: "Bravo" },
        nearby_substations: [],
        confidence_notes: ["Queue is lighter"],
        source_metadata: {} as any,
        disclaimer: "queue",
      })
      .mockResolvedValueOnce({
        lat: 52.3,
        lon: -0.3,
        country: "GB",
        nearest_gsp: { gsp_id: "C", gsp_name: "Charlie", distance_km: 1.9, region_id: "RC", region_name: "Charlie" },
        connection_queue: { projects: [{ id: 1 }], total_mw_queued: 1400, search_term: "Charlie" },
        nearby_substations: [],
        confidence_notes: ["Queue is moderate"],
        source_metadata: {} as any,
        disclaimer: "queue",
      });

    const result = await shortlistBessSites({
      country: "GB",
      sites: [
        { label: "Alpha", lat: 52.1, lon: -0.1 },
        { label: "Bravo", lat: 52.2, lon: -0.2 },
        { label: "Charlie", lat: 52.3, lon: -0.3 },
      ],
      capacity_mw: 25,
      shortlist_size: 2,
    });

    expect(result.country).toBe("GB");
    expect(result.site_count).toBe(3);
    expect(result.shortlist).toHaveLength(2);
    expect(result.rankings).toHaveLength(3);
    expect(result.rankings[0]).toMatchObject({
      label: "Bravo",
      rank: 1,
      verdict: "pass",
      estimated_annual_revenue_eur: 760000,
      queue_total_mw_queued: 250,
    });
    expect(result.shortlist.map((site) => site.label)).toEqual(["Bravo", "Charlie"]);
    expect(result.rankings[0].reasoning).toContain("GIS");
    expect(result.rankings[0].reasoning).toContain("queue");
    expect(compareSitesMock).toHaveBeenCalledWith({
      country: "GB",
      sites: [
        { label: "Alpha", lat: 52.1, lon: -0.1 },
        { label: "Bravo", lat: 52.2, lon: -0.2 },
        { label: "Charlie", lat: 52.3, lon: -0.3 },
      ],
    });
    expect(estimateSiteRevenueMock).toHaveBeenCalledTimes(3);
    expect(getGridConnectionIntelligenceMock).toHaveBeenCalledTimes(3);
  });

  it("keeps ranked sites when revenue or queue lookups fail and surfaces the gaps", async () => {
    compareSitesMock.mockResolvedValue({
      site_count: 2,
      rankings: [
        {
          rank: 1,
          label: "Alpha",
          lat: 52.1,
          lon: -0.1,
          verdict: "pass",
          flag_count: 0,
          solar_kwh_m2: 1120,
          slope_deg: 2.1,
          nearest_grid_km: 0.9,
          constraint_count: 0,
          score: 92,
          reasoning: "Strong GIS site.",
          data_gaps: [],
        },
        {
          rank: 2,
          label: "Bravo",
          lat: 52.2,
          lon: -0.2,
          verdict: "warn",
          flag_count: 1,
          solar_kwh_m2: 1110,
          slope_deg: 3.4,
          nearest_grid_km: 1.1,
          constraint_count: 0,
          score: 76,
          reasoning: "Some GIS caveats.",
          data_gaps: [],
        },
      ],
      failed_sites: [{ label: "Dropped", lat: 52.4, lon: -0.4, error: "GIS timeout" }],
      heuristics_used: ["GIS heuristic"],
      disclaimer: "GIS disclaimer",
    });

    estimateSiteRevenueMock
      .mockResolvedValueOnce({
        lat: 52.1,
        lon: -0.1,
        zone: "GB",
        technology: "bess",
        capacity_mw: 10,
        terrain: null,
        revenue: { estimated_annual_revenue_eur: 500000, daily_revenue_eur: 1370 },
        price_snapshot: null,
        caveats: [],
        disclaimer: "rev",
      })
      .mockRejectedValueOnce(new Error("ENTSO-E key missing"));

    getGridConnectionIntelligenceMock
      .mockResolvedValueOnce({
        lat: 52.1,
        lon: -0.1,
        country: "GB",
        nearest_gsp: null,
        connection_queue: null,
        nearby_substations: [],
        confidence_notes: [],
        source_metadata: {} as any,
        disclaimer: "queue",
      })
      .mockRejectedValueOnce(new Error("NESO timeout"));

    const result = await shortlistBessSites({
      country: "GB",
      sites: [
        { label: "Alpha", lat: 52.1, lon: -0.1 },
        { label: "Bravo", lat: 52.2, lon: -0.2 },
      ],
    });

    expect(result.rankings).toHaveLength(2);
    expect(result.failed_sites).toHaveLength(1);
    expect(result.rankings[1]).toMatchObject({
      label: "Bravo",
      estimated_annual_revenue_eur: null,
      queue_total_mw_queued: null,
    });
    expect(result.rankings[1].data_gaps).toContain("site_revenue");
    expect(result.rankings[1].data_gaps).toContain("grid_connection_intelligence");
    expect(result.rankings[1].reasoning).toContain("missing");
  });

  it("caps shortlist_size to the surviving ranked sites when comparison drops failures", async () => {
    compareSitesMock.mockResolvedValue({
      site_count: 3,
      rankings: [
        {
          rank: 1,
          label: "Alpha",
          lat: 52.1,
          lon: -0.1,
          verdict: "pass",
          flag_count: 0,
          solar_kwh_m2: 1120,
          slope_deg: 2.1,
          nearest_grid_km: 0.9,
          constraint_count: 0,
          score: 92,
          reasoning: "Strong GIS site.",
          data_gaps: [],
        },
        {
          rank: 2,
          label: "Bravo",
          lat: 52.2,
          lon: -0.2,
          verdict: "warn",
          flag_count: 1,
          solar_kwh_m2: 1110,
          slope_deg: 3.4,
          nearest_grid_km: 1.1,
          constraint_count: 0,
          score: 76,
          reasoning: "Some GIS caveats.",
          data_gaps: [],
        },
      ],
      failed_sites: [{ label: "Dropped", lat: 52.4, lon: -0.4, error: "GIS timeout" }],
      heuristics_used: ["GIS heuristic"],
      disclaimer: "GIS disclaimer",
    });

    estimateSiteRevenueMock.mockResolvedValue({
      lat: 52.1,
      lon: -0.1,
      zone: "GB",
      technology: "bess",
      capacity_mw: 10,
      terrain: null,
      revenue: { estimated_annual_revenue_eur: 500000, daily_revenue_eur: 1370 },
      price_snapshot: null,
      caveats: [],
      disclaimer: "rev",
    });

    getGridConnectionIntelligenceMock.mockResolvedValue({
      lat: 52.1,
      lon: -0.1,
      country: "GB",
      nearest_gsp: null,
      connection_queue: { projects: [], total_mw_queued: 1000, search_term: "Alpha" },
      nearby_substations: [],
      confidence_notes: [],
      source_metadata: {} as any,
      disclaimer: "queue",
    });

    const result = await shortlistBessSites({
      country: "GB",
      shortlist_size: 3,
      sites: [
        { label: "Alpha", lat: 52.1, lon: -0.1 },
        { label: "Bravo", lat: 52.2, lon: -0.2 },
        { label: "Dropped", lat: 52.4, lon: -0.4 },
      ],
    });

    expect(result.rankings).toHaveLength(2);
    expect(result.shortlist).toHaveLength(2);
    expect(result.shortlist_size).toBe(2);
  });

  it("rejects unsupported countries and invalid shortlist size", async () => {
    await expect(
      shortlistBessSites({
        country: "DE",
        sites: [
          { label: "Alpha", lat: 52.1, lon: -0.1 },
          { label: "Bravo", lat: 52.2, lon: -0.2 },
        ],
      }),
    ).rejects.toThrow('Only country "GB" is supported');

    await expect(
      shortlistBessSites({
        country: "GB",
        shortlist_size: 3,
        sites: [
          { label: "Alpha", lat: 52.1, lon: -0.1 },
          { label: "Bravo", lat: 52.2, lon: -0.2 },
        ],
      }),
    ).rejects.toThrow("shortlist_size");
  });

  it("uses SSEN DNO headroom to break ties when shortlist inputs are otherwise similar", async () => {
    compareSitesMock.mockResolvedValue({
      site_count: 2,
      rankings: [
        {
          rank: 1,
          label: "Alpha",
          lat: 51.5,
          lon: -0.1,
          verdict: "pass",
          flag_count: 0,
          solar_kwh_m2: 1100,
          slope_deg: 2,
          nearest_grid_km: 0.8,
          constraint_count: 0,
          score: 85,
          reasoning: "Strong GIS site.",
          data_gaps: [],
        },
        {
          rank: 2,
          label: "Bravo",
          lat: 51.52,
          lon: -0.12,
          verdict: "pass",
          flag_count: 0,
          solar_kwh_m2: 1100,
          slope_deg: 2,
          nearest_grid_km: 0.8,
          constraint_count: 0,
          score: 85,
          reasoning: "Strong GIS site.",
          data_gaps: [],
        },
      ],
      failed_sites: [],
      heuristics_used: ["GIS heuristic"],
      disclaimer: "GIS disclaimer",
    });

    estimateSiteRevenueMock.mockResolvedValue({
      lat: 51.5,
      lon: -0.1,
      zone: "GB",
      technology: "bess",
      capacity_mw: 10,
      terrain: null,
      revenue: { estimated_annual_revenue_eur: 500000, daily_revenue_eur: 1370 },
      price_snapshot: null,
      caveats: [],
      disclaimer: "rev",
    });

    getGridConnectionIntelligenceMock.mockResolvedValue({
      lat: 51.5,
      lon: -0.1,
      country: "GB",
      nearest_gsp: null,
      connection_queue: { projects: [], total_mw_queued: 1000, search_term: "Alpha" },
      nearby_substations: [],
      confidence_notes: [],
      source_metadata: {} as any,
      disclaimer: "queue",
    });

    getDistributionHeadroomMock
      .mockResolvedValueOnce({
        lat: 51.5,
        lon: -0.1,
        operator: "SSEN",
        radius_km: 25,
        nearest_site: {
          asset_id: "A",
          licence_area: "England / SEPD",
          substation: "Alpha GSP",
          substation_type: "GSP",
          voltage_kv: "132",
          upstream_gsp: null,
          upstream_bsp: null,
          distance_km: 1.2,
          estimated_demand_headroom_mva: 5,
          demand_rag_status: "Amber",
          demand_constraint: "Demand constraint",
          connected_generation_mw: 10,
          contracted_generation_mw: 15,
          estimated_generation_headroom_mw: 5,
          generation_rag_status: "Red",
          generation_constraint: "Generation constraint",
          upstream_reinforcement_works: null,
          upstream_reinforcement_completion_date: null,
          substation_reinforcement_works: null,
          substation_reinforcement_completion_date: null,
        },
        matches: [],
        confidence_notes: [],
        source_metadata: {} as any,
        disclaimer: "dno",
      })
      .mockResolvedValueOnce({
        lat: 51.52,
        lon: -0.12,
        operator: "SSEN",
        radius_km: 25,
        nearest_site: {
          asset_id: "B",
          licence_area: "England / SEPD",
          substation: "Bravo GSP",
          substation_type: "GSP",
          voltage_kv: "132",
          upstream_gsp: null,
          upstream_bsp: null,
          distance_km: 1.1,
          estimated_demand_headroom_mva: 12,
          demand_rag_status: "Green",
          demand_constraint: null,
          connected_generation_mw: 8,
          contracted_generation_mw: 9,
          estimated_generation_headroom_mw: 45,
          generation_rag_status: "Green",
          generation_constraint: null,
          upstream_reinforcement_works: null,
          upstream_reinforcement_completion_date: null,
          substation_reinforcement_works: null,
          substation_reinforcement_completion_date: null,
        },
        matches: [],
        confidence_notes: [],
        source_metadata: {} as any,
        disclaimer: "dno",
      });

    const result = await shortlistBessSites({
      country: "GB",
      sites: [
        { label: "Alpha", lat: 51.5, lon: -0.1 },
        { label: "Bravo", lat: 51.52, lon: -0.12 },
      ],
    });

    expect(result.rankings[0].label).toBe("Bravo");
    expect(result.rankings[0].dno_generation_headroom_mw).toBe(45);
    expect(result.rankings[0].dno_headroom_site).toBe("Bravo GSP");
    expect(result.rankings[0].reasoning).toContain("SSEN DNO headroom");
  });
});
