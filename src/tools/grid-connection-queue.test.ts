import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGridConnectionQueue, resetGridConnectionQueueCacheForTests } from "./grid-connection-queue.js";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function makeNesoResponse(records: unknown[]) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      result: {
        records,
      },
    }),
  };
}

const SAMPLE_RECORDS = [
  {
    "Project Name": "012 NEP Coventry West",
    "Customer Name": "NEW ENERGY PARTNERSHIP LIMITED",
    "Connection Site": "Berkswell GSP",
    "Stage": null,
    "MW Connected": 0,
    "MW Increase / Decrease": 92.4,
    "Cumulative Total Capacity (MW)": 92.4,
    "MW Effective From": "2034-10-31",
    "Project Status": "Scoping",
    "Agreement Type": "Embedded",
    "HOST TO": "NGET",
    "Plant Type": "Energy Storage System",
    "Project ID": "a0l8e000000f3zXAAQ",
    "Project Number": "PRO-003804",
    "Gate": null,
  },
  {
    "Project Name": "Berkswell Solar Park",
    "Customer Name": "Solar Dev Co",
    "Connection Site": "Berkswell GSP",
    "Stage": 1,
    "MW Connected": 0,
    "MW Increase / Decrease": 49.9,
    "Cumulative Total Capacity (MW)": 49.9,
    "MW Effective From": "2031-06-30",
    "Project Status": "Awaiting Consents",
    "Agreement Type": "Embedded",
    "HOST TO": "NGET",
    "Plant Type": "Solar",
    "Project ID": "a0l8e000000f3zYAAQ",
    "Project Number": "PRO-003805-1",
    "Gate": 1,
  },
  {
    "Project Name": "North Humber BESS",
    "Customer Name": "Storage Dev Co",
    "Connection Site": "North Humber Connection Node C 132kV Substation",
    "Stage": null,
    "MW Connected": 0,
    "MW Increase / Decrease": 40,
    "Cumulative Total Capacity (MW)": 40,
    "MW Effective From": "2035-10-30",
    "Project Status": "Scoping",
    "Agreement Type": "Embedded",
    "HOST TO": "NGET",
    "Plant Type": "Energy Storage System",
    "Project ID": "a0l8e000001HntMAAS",
    "Project Number": "PRO-004043",
    "Gate": null,
  },
];

describe("getGridConnectionQueue", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resetGridConnectionQueueCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns filtered NESO TEC register matches with summary", async () => {
    fetchMock.mockResolvedValueOnce(makeNesoResponse(SAMPLE_RECORDS));

    const result = await getGridConnectionQueue({ connection_site_query: "Berkswell" });

    expect(result.filters.connection_site_query).toBe("Berkswell");
    expect(result.summary.matched_projects).toBe(2);
    expect(result.summary.total_net_change_mw).toBe(142.3);
    expect(result.summary.earliest_effective_from).toBe("2031-06-30");
    expect(result.connection_sites).toHaveLength(1);
    expect(result.connection_sites[0].connection_site).toBe("Berkswell GSP");
    expect(result.projects).toHaveLength(2);
    expect(result.source_metadata.id).toBe("neso-tec-register");
  });

  it("supports additional plant type and status filters", async () => {
    fetchMock.mockResolvedValueOnce(makeNesoResponse(SAMPLE_RECORDS));

    const result = await getGridConnectionQueue({
      connection_site_query: "Berkswell",
      plant_type: "solar",
      project_status: "awaiting consents",
    });

    expect(result.summary.matched_projects).toBe(1);
    expect(result.projects[0].plant_type).toBe("Solar");
    expect(result.projects[0].project_status).toBe("Awaiting Consents");
  });

  it("returns no-match summary cleanly", async () => {
    fetchMock.mockResolvedValueOnce(makeNesoResponse(SAMPLE_RECORDS));

    const result = await getGridConnectionQueue({ connection_site_query: "Inverness" });

    expect(result.summary.matched_projects).toBe(0);
    expect(result.projects).toHaveLength(0);
    expect(result.connection_sites).toHaveLength(0);
    expect(result.summary.earliest_effective_from).toBeNull();
  });

  it("requires at least one filter", async () => {
    await expect(getGridConnectionQueue({})).rejects.toThrow(
      "At least one filter is required",
    );
  });

  it("wraps upstream failures with a clear NESO message", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "Service unavailable",
    });

    await expect(
      getGridConnectionQueue({ connection_site_query: "Error Case Site" }),
    ).rejects.toThrow("NESO TEC register query failed: NESO API returned 503");
  });

  it("returns cached results on repeated queries", async () => {
    fetchMock.mockResolvedValueOnce(makeNesoResponse(SAMPLE_RECORDS));

    await getGridConnectionQueue({ connection_site_query: "North Humber" });
    const second = await getGridConnectionQueue({ connection_site_query: "North Humber" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.summary.matched_projects).toBe(1);
  });
});
