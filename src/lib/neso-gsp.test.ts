import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { lookupGspRegion, resetGspCacheForTests } from "./neso-gsp.js";

const MOCK_CSV = [
  "gsp_id,gsp_name,gsp_lat,gsp_lon,region_id,region_name,gnode_id,gnode_name",
  "GSP_1,BERKSWELL,52.3939,-1.6419,R1,West Midlands,GN1,BERKSWEL1",
  "GSP_2,EAST_CLAYDON,51.9036,-0.9344,R2,Southeast,GN2,ECLAYD1",
  "GSP_3,BRAMLEY,51.3391,-1.0603,R3,Southern,GN3,BRAMLEY1",
  // Duplicate GSP_1 row (different gnode) should be deduplicated
  "GSP_1,BERKSWELL,52.3939,-1.6419,R1,West Midlands,GN4,BERKSWEL2",
].join("\n");

function mockFetchOk(body: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(body),
    }),
  );
}

function mockFetchFail(status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      text: () => Promise.resolve("error"),
    }),
  );
}

describe("lookupGspRegion", () => {
  beforeEach(() => {
    resetGspCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses CSV and returns nearest GSP", async () => {
    mockFetchOk(MOCK_CSV);

    // Query near Berkswell (52.39, -1.64)
    const result = await lookupGspRegion(52.39, -1.64);

    expect(result).not.toBeNull();
    expect(result!.gsp_id).toBe("GSP_1");
    expect(result!.gsp_name).toBe("BERKSWELL");
    expect(result!.region_id).toBe("R1");
    expect(result!.region_name).toBe("West Midlands");
    expect(result!.distance_km).toBeLessThan(1);
  });

  it("returns null when no GSP within radius", async () => {
    mockFetchOk(MOCK_CSV);

    // Query in Scotland — far from all mock GSPs
    const result = await lookupGspRegion(57.0, -4.0, 10);

    expect(result).toBeNull();
  });

  it("caches CSV after first fetch", async () => {
    mockFetchOk(MOCK_CSV);

    await lookupGspRegion(52.39, -1.64);
    await lookupGspRegion(51.9, -0.93);

    // fetch should only be called once
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("handles fetch failure", async () => {
    mockFetchFail(500);

    await expect(lookupGspRegion(52.39, -1.64)).rejects.toThrow(
      "NESO GSP lookup CSV fetch failed: HTTP 500",
    );
  });

  it("respects custom radius", async () => {
    mockFetchOk(MOCK_CSV);

    // Berkswell is at 52.3939, -1.6419. Query from exact coords with a 1km radius.
    const result = await lookupGspRegion(52.3939, -1.6419, 1);

    expect(result).not.toBeNull();
    expect(result!.gsp_id).toBe("GSP_1");

    // Now query from a point far enough away that 1km radius misses everything
    const resultFar = await lookupGspRegion(53.0, -2.0, 1);
    expect(resultFar).toBeNull();
  });

  it("deduplicates GSP records from multiple gnode rows", async () => {
    mockFetchOk(MOCK_CSV);

    // The mock CSV has GSP_1 listed twice (different gnodes).
    // We should still only get one result for GSP_1.
    const result = await lookupGspRegion(52.39, -1.64);

    expect(result).not.toBeNull();
    expect(result!.gsp_id).toBe("GSP_1");
  });
});
