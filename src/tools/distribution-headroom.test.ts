import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDistributionHeadroom,
  resetDistributionHeadroomCacheForTests,
} from "./distribution-headroom.js";

const MOCK_CSV = [
  "AssetID,GSP Grouping / Default Order,Map / License Area,Substation,Upstream GSP,Upstream BSP,Substation Type,Voltage (kV),Location Latitude,Location Longitude,Grid Reference,Substation Comment,LTDS CIM Nodes,Transformer Nameplate Ratings,Single Transformer Site,Maximum Observed Gross Demand (MVA),Minimum Observed Gross Demand (MVA),Contracted Demand Excl BESS (MVA),Contracted BESS Demand (MVA),Estimated Demand Headroom (MVA),Substation Demand RAG Status,Demand Constraint,TIA Threshold,Connected Generation (MW),Contracted Generation (MW),Technical Limits Agreed at GSP,Estimated Generation Headroom (MW),3-Phase Break Fault Rating (kA),3-Phase Break Fault Level (kA),Substation Generation RAG Status,Generation Constraint,Upstream Reinforcement Works,Upstream Reinforcement Completion Date,Substation Reinforcement Works,Substation Reinforcement Completion Date",
  'E-ALPHA-01,E-ALPHA-01,England / SEPD,Alpha GSP,N/A,N/A,GSP,132,51.5000,-0.1000,TQ 000 000,"Shared with another DNO",1000,"2 x 120MVA",No,30.0,10.0,12.0,0.0,14.5,Amber,Upstream Thermal Capacity,5MW,15.0,20.0,No,80.0,20.0,10.5,Amber,Transmission Constraint,"Transmission works:\nAdd transformer",Sep-26,"Substation works",Oct-26',
  "E-BRAVO-02,E-BRAVO-02,England / SEPD,Bravo Primary,Alpha GSP,Alpha BSP,Primary,33,51.5200,-0.1200,TQ 111 111,,1001,2 x 20MVA,No,15.0,4.0,6.0,0.0,2.5,Red,Substation Thermal Capacity,5MW,1.0,3.0,No,10.0,13.1,9.8,Red,Substation Thermal Capacity,,,",
  "BAD-ROW,BAD-ROW,England / SEPD,Missing Coordinates,Alpha GSP,Alpha BSP,Primary,33,,,TQ 222 222,,1002,2 x 20MVA,No,12.0,3.0,5.0,0.0,1.0,Red,Substation Thermal Capacity,5MW,0.0,0.0,No,5.0,13.1,8.8,Red,Substation Thermal Capacity,,,",
].join("\n");

const MOCK_NPG_RESPONSE = {
  total_count: 2,
  results: [
    {
      name: "Armouries Drive",
      type: "Primary",
      pvoltage: 11,
      genhr: 29.5,
      demhr: 12.3,
      gentot: 0.432,
      demtot: 6.751,
      genconstraint: ["No Voltage Constraint"],
      demconstraint: ["No Demand Constraint"],
      worst_case_constraint_gen_colour: "Green",
      worst_case_constraint_dem_colour: "Green",
      upstreamname: "Low Road",
      gsp_name: "Skelton Grange",
      substation_location: {
        lat: 53.79066604669437,
        lon: -1.5299547015469377,
      },
    },
    {
      name: "Temple Moor",
      type: "BSP",
      pvoltage: 33,
      genhr: 4.1,
      demhr: 1.8,
      gentot: 12.2,
      demtot: 24.4,
      genconstraint: ["Amber - Voltage"],
      demconstraint: ["Red - Fault Level"],
      worst_case_constraint_gen_colour: "Amber",
      worst_case_constraint_dem_colour: "Red",
      upstreamname: "Skelton Grange",
      gsp_name: "Skelton Grange",
      substation_location: {
        lat: 53.803,
        lon: -1.49,
      },
    },
  ],
};

function mockFetchOk(body: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("package_show")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: {
              resources: [
                {
                  name: "Headroom Dashboard Data - March 2026",
                  format: "CSV",
                  last_modified: "2026-03-11T12:12:32.113749",
                  url: "https://data-api.ssen.co.uk/download/headroom-dashboard-data-march-2026.csv",
                },
              ],
            },
          }),
        };
      }

      if (url.includes("headroom-dashboard-data-march-2026.csv")) {
        return {
          ok: true,
          status: 200,
          text: async () => body,
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    }),
  );
}

function mockFetchFail(status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("package_show")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: {
              resources: [
                {
                  name: "Headroom Dashboard Data - March 2026",
                  format: "CSV",
                  last_modified: "2026-03-11T12:12:32.113749",
                  url: "https://data-api.ssen.co.uk/download/headroom-dashboard-data-march-2026.csv",
                },
              ],
            },
          }),
        };
      }

      return {
        ok: false,
        status,
        text: async () => "error",
      };
    }),
  );
}

function mockFetchNpgOk(payload: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("northernpowergrid.opendatasoft.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => payload,
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    }),
  );
}

describe("getDistributionHeadroom", () => {
  beforeEach(() => {
    resetDistributionHeadroomCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the nearest SSEN headroom sites within the search radius", async () => {
    mockFetchOk(MOCK_CSV);

    const result = await getDistributionHeadroom({
      lat: 51.521,
      lon: -0.121,
      operator: "SSEN",
    });

    expect(result.operator).toBe("SSEN");
    expect(result.nearest_site).not.toBeNull();
    expect(result.nearest_site!.asset_id).toBe("E-BRAVO-02");
    expect(result.nearest_site!.substation).toBe("Bravo Primary");
    expect(result.nearest_site!.estimated_generation_headroom_mw).toBe(10);
    expect(result.nearest_site!.estimated_demand_headroom_mva).toBe(2.5);
    expect(result.matches).toHaveLength(2);
    expect(result.matches[1].upstream_reinforcement_works).toContain("Add transformer");
    expect(result.source_metadata.id).toBe("ssen-distribution-headroom");
  });

  it("returns the nearest NPG headroom sites within the search radius", async () => {
    mockFetchNpgOk(MOCK_NPG_RESPONSE);

    const result = await getDistributionHeadroom({
      lat: 53.791,
      lon: -1.531,
      operator: "NPG",
    });

    expect(result.operator).toBe("NPG");
    expect(result.nearest_site).not.toBeNull();
    expect(result.nearest_site!.asset_id).toBe("NPG:Primary:Armouries Drive");
    expect(result.nearest_site!.substation).toBe("Armouries Drive");
    expect(result.nearest_site!.substation_type).toBe("Primary");
    expect(result.nearest_site!.upstream_gsp).toBe("Skelton Grange");
    expect(result.nearest_site!.upstream_bsp).toBe("Low Road");
    expect(result.nearest_site!.estimated_generation_headroom_mw).toBe(29.5);
    expect(result.nearest_site!.estimated_demand_headroom_mva).toBe(12.3);
    expect(result.nearest_site!.generation_rag_status).toBe("Green");
    expect(result.nearest_site!.demand_rag_status).toBe("Green");
    expect(result.matches).toHaveLength(2);
    expect(result.matches[1].generation_constraint).toContain("Amber - Voltage");
    expect(result.source_metadata.id).toBe("npg-heatmap-substation-areas");
  });

  it("caches the SSEN headroom CSV after the first fetch", async () => {
    mockFetchOk(MOCK_CSV);

    await getDistributionHeadroom({ lat: 51.5, lon: -0.1, operator: "SSEN" });
    await getDistributionHeadroom({ lat: 51.52, lon: -0.12, operator: "SSEN" });

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it("returns no matches when no SSEN site is within the search radius", async () => {
    mockFetchOk(MOCK_CSV);

    const result = await getDistributionHeadroom({
      lat: 55.0,
      lon: -3.0,
      operator: "SSEN",
      radius_km: 5,
    });

    expect(result.nearest_site).toBeNull();
    expect(result.matches).toEqual([]);
    expect(result.confidence_notes).toContain("No SSEN headroom site found within search radius");
  });

  it("returns no matches when no NPG site is within the search radius", async () => {
    mockFetchNpgOk(MOCK_NPG_RESPONSE);

    const result = await getDistributionHeadroom({
      lat: 51.0,
      lon: 0.0,
      operator: "NPG",
      radius_km: 5,
    });

    expect(result.nearest_site).toBeNull();
    expect(result.matches).toEqual([]);
    expect(result.confidence_notes).toContain("No NPG headroom site found within search radius");
  });

  it("rejects unsupported operators", async () => {
    mockFetchOk(MOCK_CSV);

    await expect(
      getDistributionHeadroom({
        lat: 51.5,
        lon: -0.1,
        operator: "UKPN" as "SSEN",
      }),
    ).rejects.toThrow('Only operators "SSEN" and "NPG" are currently supported.');
  });

  it("handles fetch failure", async () => {
    mockFetchFail(503);

    await expect(
      getDistributionHeadroom({
        lat: 51.5,
        lon: -0.1,
        operator: "SSEN",
      }),
    ).rejects.toThrow("SSEN headroom CSV fetch failed: HTTP 503");
  });
});
