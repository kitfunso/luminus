import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/neso-gsp.js", () => ({
  lookupGspRegion: vi.fn(),
}));

import { lookupGspRegion } from "../lib/neso-gsp.js";
import {
  getNgedConnectionSignal,
  resetNgedConnectionSignalCacheForTests,
} from "./nged-connection-signal.js";

const mockLookupGspRegion = vi.mocked(lookupGspRegion);
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const MOCK_GSP_RESULT = {
  gsp_id: "GSP_1",
  gsp_name: "BERKSWELL",
  region_id: "R1",
  region_name: "Berkswell",
  distance_km: 2.5,
};

function mockFetchSuccess(): void {
  fetchMock.mockImplementation(async (input: string | URL | Request) => {
    const url = String(input);

    if (url.includes("package_show?id=connection-queue")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          result: {
            resources: [
              { name: "Berkswell", id: "queue-berkswell-id", datastore_active: true },
            ],
          },
        }),
      };
    }

    if (url.includes("package_show?id=asset-limits-pre-event-transmission-distribution-limits")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          result: {
            resources: [
              { name: "Berkswell Td Limits", id: "td-berkswell-id", datastore_active: true },
            ],
          },
        }),
      };
    }

    if (url.includes("datastore_search?resource_id=queue-berkswell-id")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          result: {
            records: [
              {
                "Licence Area": "East Midlands",
                GSP: "BERKSWELL 132kV S STN",
                TANM: "False",
                DANM: "False",
                Status: "Recently Connected",
                "Bus Number": 33050,
                "Bus Name": "EASS3_MAIN1",
                "Site ID": 19,
                "Application ID": 1,
                "Site Export Capacity (MW)": 25.0,
                "Site Import Capacity (MW)": 0.0,
                "Machine Export Capacity (MW)": 25.0,
                "Machine Import Capacity (MW)": "",
                "Fuel type": "Solar",
                "Machine ID": "P1",
                Position: 0,
              },
              {
                "Licence Area": "East Midlands",
                GSP: "BERKSWELL 132kV S STN",
                TANM: "True",
                DANM: "False",
                Status: "Accepted",
                "Bus Number": 331800,
                "Bus Name": "HARB3_MAIN1",
                "Site ID": 338,
                "Application ID": 7,
                "Site Export Capacity (MW)": 16.8,
                "Site Import Capacity (MW)": 2.5,
                "Machine Export Capacity (MW)": 16.8,
                "Machine Import Capacity (MW)": 1.2,
                "Fuel type": "Battery",
                "Machine ID": "PA",
                Position: 3,
              },
            ],
          },
        }),
      };
    }

    if (url.includes("datastore_search?resource_id=td-berkswell-id")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          result: {
            records: [
              {
                "GSP Name": "Berkswell",
                "From Bus Number": 419700,
                "To Bus Number": 320538,
                "Tertiary Bus Number": 32170,
                "From Bus Name": "BESW2_#H10",
                "To Bus Name": "BESW1_SGT1",
                "Tertiary Bus Name": "BESW8G1",
                "Circuit ID": "S1",
                Season: "Winter",
                "Import TL MW": -302.6,
                "Export TL MW": 63.9,
                "Import CAFPL MVA": "",
                "Export CARPL MVA": 240,
              },
              {
                "GSP Name": "Berkswell",
                "From Bus Number": 419700,
                "To Bus Number": 320538,
                "Tertiary Bus Number": 32170,
                "From Bus Name": "BESW2_#H10",
                "To Bus Name": "BESW1_SGT1",
                "Tertiary Bus Name": "BESW8G1",
                "Circuit ID": "S1",
                Season: "Summer",
                "Import TL MW": -213.1,
                "Export TL MW": 63.9,
                "Import CAFPL MVA": "",
                "Export CARPL MVA": 240,
              },
            ],
          },
        }),
      };
    }

    throw new Error(`Unexpected URL: ${url}`);
  });
}

function mockFetchQueueFailure(): void {
  fetchMock.mockImplementation(async (input: string | URL | Request) => {
    const url = String(input);

    if (url.includes("package_show?id=connection-queue")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          result: {
            resources: [
              { name: "Berkswell", id: "queue-berkswell-id", datastore_active: true },
            ],
          },
        }),
      };
    }

    if (url.includes("package_show?id=asset-limits-pre-event-transmission-distribution-limits")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          result: {
            resources: [
              { name: "Berkswell Td Limits", id: "td-berkswell-id", datastore_active: true },
            ],
          },
        }),
      };
    }

    if (url.includes("datastore_search?resource_id=queue-berkswell-id")) {
      return {
        ok: false,
        status: 503,
        json: async () => ({}),
      };
    }

    if (url.includes("datastore_search?resource_id=td-berkswell-id")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          result: {
            records: [
              {
                "GSP Name": "Berkswell",
                "From Bus Number": 419700,
                "To Bus Number": 320538,
                "Tertiary Bus Number": 32170,
                "From Bus Name": "BESW2_#H10",
                "To Bus Name": "BESW1_SGT1",
                "Tertiary Bus Name": "BESW8G1",
                "Circuit ID": "S1",
                Season: "Winter",
                "Import TL MW": -302.6,
                "Export TL MW": 63.9,
                "Import CAFPL MVA": "",
                "Export CARPL MVA": 240,
              },
            ],
          },
        }),
      };
    }

    throw new Error(`Unexpected URL: ${url}`);
  });
}

describe("getNgedConnectionSignal", () => {
  beforeEach(() => {
    resetNgedConnectionSignalCacheForTests();
    fetchMock.mockReset();
    mockLookupGspRegion.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns NGED queue and TD-limit data for the matched GSP", async () => {
    mockLookupGspRegion.mockResolvedValue(MOCK_GSP_RESULT);
    mockFetchSuccess();

    const result = await getNgedConnectionSignal({
      lat: 52.39,
      lon: -1.64,
      country: "GB",
    });

    expect(result.nearest_gsp?.region_name).toBe("Berkswell");
    expect(result.queue_signal).not.toBeNull();
    expect(result.queue_signal?.resource_name).toBe("Berkswell");
    expect(result.queue_signal?.summary.matched_projects).toBe(2);
    expect(result.queue_signal?.summary.total_site_export_capacity_mw).toBe(41.8);
    expect(result.queue_signal?.summary.status_breakdown).toEqual({
      Accepted: 1,
      "Recently Connected": 1,
    });
    expect(result.queue_signal?.projects[1].tanm).toBe(true);
    expect(result.queue_signal?.projects[1].site_import_capacity_mw).toBe(2.5);

    expect(result.td_limits).not.toBeNull();
    expect(result.td_limits?.resource_name).toBe("Berkswell Td Limits");
    expect(result.td_limits?.summary.matched_rows).toBe(2);
    expect(result.td_limits?.summary.seasons).toEqual(["Summer", "Winter"]);
    expect(result.td_limits?.summary.min_import_tl_mw).toBe(-302.6);
    expect(result.td_limits?.rows[0].season).toBe("Winter");

    expect(result.source_metadata.gsp_lookup.id).toBe("neso-gsp-lookup");
    expect(result.source_metadata.queue_signal.id).toBe("nged-connection-queue");
    expect(result.source_metadata.td_limits.id).toBe("nged-asset-limits");
  });

  it("returns no NGED data when no GSP is found within radius", async () => {
    mockLookupGspRegion.mockResolvedValue(null);

    const result = await getNgedConnectionSignal({
      lat: 57.0,
      lon: -4.0,
      country: "GB",
    });

    expect(result.nearest_gsp).toBeNull();
    expect(result.queue_signal).toBeNull();
    expect(result.td_limits).toBeNull();
    expect(result.confidence_notes).toContain("No GSP found within search radius");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null NGED sections when the matched GSP is outside NGED public coverage", async () => {
    mockLookupGspRegion.mockResolvedValue({
      ...MOCK_GSP_RESULT,
      region_name: "Bramley",
    });
    mockFetchSuccess();

    const result = await getNgedConnectionSignal({
      lat: 51.34,
      lon: -0.74,
      country: "GB",
    });

    expect(result.nearest_gsp?.region_name).toBe("Bramley");
    expect(result.queue_signal).toBeNull();
    expect(result.td_limits).toBeNull();
    expect(result.confidence_notes).toContain(
      "Matched GSP is not covered by the current NGED public queue or TD-limit resources.",
    );
  });

  it("handles one NGED upstream failure without dropping the other public dataset", async () => {
    mockLookupGspRegion.mockResolvedValue(MOCK_GSP_RESULT);
    mockFetchQueueFailure();

    const result = await getNgedConnectionSignal({
      lat: 52.39,
      lon: -1.64,
      country: "GB",
    });

    expect(result.queue_signal).toBeNull();
    expect(result.td_limits?.summary.matched_rows).toBe(1);
    expect(result.confidence_notes).toContain(
      "NGED queue data can fail independently of NGED TD-limit data; null sections indicate upstream fetch or schema issues.",
    );
  });

  it("rejects non-GB country", async () => {
    await expect(
      getNgedConnectionSignal({
        lat: 48.85,
        lon: 2.35,
        country: "FR",
      }),
    ).rejects.toThrow('Only country "GB" is supported');
  });
});
