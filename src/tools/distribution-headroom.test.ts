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

  it("rejects unsupported operators", async () => {
    mockFetchOk(MOCK_CSV);

    await expect(
      getDistributionHeadroom({
        lat: 51.5,
        lon: -0.1,
        operator: "UKPN" as "SSEN",
      }),
    ).rejects.toThrow('Only operator "SSEN" is currently supported.');
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
