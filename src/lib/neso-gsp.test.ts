import JSZip from "jszip";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { lookupGspRegion, resetGspCacheForTests } from "./neso-gsp.js";

const MOCK_CSV = [
  "gsp_id,gsp_name,gsp_lat,gsp_lon,region_id,region_name,gnode_id,gnode_name",
  "GSP_1,BERKSWELL,52.3939,-1.6419,R1,West Midlands,GN1,BERKSWEL1",
  "GSP_2,EAST_CLAYDON,51.9036,-0.9344,R2,Southeast,GN2,ECLAYD1",
  "GSP_3,BRAMLEY,51.3391,-1.0603,R3,Southern,GN3,BRAMLEY1",
  "GSP_1,BERKSWELL,52.3939,-1.6419,R1,West Midlands,GN4,BERKSWEL2",
].join("\n");

const POLYGON_TEST_CSV = [
  "gsp_id,gsp_name,gsp_lat,gsp_lon,region_id,region_name,gnode_id,gnode_name",
  "GSP_A,ALPHA_1,0.9,0.9,RA,Alpha,GN1,ALPHA_NODE",
  "GSP_B,BRAVO_1,0.11,0.11,RB,Bravo,GN2,BRAVO_NODE",
].join("\n");

const EMPTY_GEOJSON = {
  type: "FeatureCollection",
  features: [],
};

const POLYGON_PRIORITY_GEOJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { GSPs: "ALPHA_1", GSPGroup: "Alpha Group" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { GSPs: "BRAVO_1", GSPGroup: "Bravo Group" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [2, 2],
            [3, 2],
            [3, 3],
            [2, 3],
            [2, 2],
          ],
        ],
      },
    },
  ],
};

const CLOSED_RING_GEOJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { GSPs: "ALPHA_1", GSPGroup: "Alpha Group" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { GSPs: "BRAVO_1", GSPGroup: "Bravo Group" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [10, 10],
            [11, 10],
            [11, 11],
            [10, 11],
            [10, 10],
          ],
        ],
      },
    },
  ],
};

async function createBoundaryZip(geojson: unknown): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "Proj_4326/GSP_regions_4326_20251204.geojson",
    JSON.stringify(geojson),
  );
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function mockFetchOk(
  csvText: string,
  geojson: unknown = EMPTY_GEOJSON,
): Promise<void> {
  const zipBuffer = await createBoundaryZip(geojson);

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("gsp_gnode")) {
        return {
          ok: true,
          status: 200,
          text: async () => csvText,
        };
      }

      if (url.includes("gsp_regions")) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => zipBuffer,
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
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
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
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
    await mockFetchOk(MOCK_CSV);

    const result = await lookupGspRegion(52.39, -1.64);

    expect(result).not.toBeNull();
    expect(result!.gsp_id).toBe("GSP_1");
    expect(result!.gsp_name).toBe("BERKSWELL");
    expect(result!.region_id).toBe("R1");
    expect(result!.region_name).toBe("West Midlands");
    expect(result!.distance_km).toBeLessThan(1);
  });

  it("returns null when no GSP within radius", async () => {
    await mockFetchOk(MOCK_CSV);

    const result = await lookupGspRegion(57.0, -4.0, 10);

    expect(result).toBeNull();
  });

  it("prefers polygon containment over a misleading nearest reference point", async () => {
    await mockFetchOk(POLYGON_TEST_CSV, POLYGON_PRIORITY_GEOJSON);

    const result = await lookupGspRegion(0.1, 0.1, 200);

    expect(result).not.toBeNull();
    expect(result!.gsp_id).toBe("GSP_A");
    expect(result!.gsp_name).toBe("ALPHA_1");
    expect(result!.region_name).toBe("Alpha");
  });

  it("returns a polygon-contained GSP even when the reference point is outside the radius cutoff", async () => {
    await mockFetchOk(POLYGON_TEST_CSV, POLYGON_PRIORITY_GEOJSON);

    const result = await lookupGspRegion(0.1, 0.1, 10);

    expect(result).not.toBeNull();
    expect(result!.gsp_id).toBe("GSP_A");
    expect(result!.gsp_name).toBe("ALPHA_1");
    expect(result!.region_name).toBe("Alpha");
  });

  it("falls back to nearest-point lookup when no polygon contains the site", async () => {
    await mockFetchOk(POLYGON_TEST_CSV, POLYGON_PRIORITY_GEOJSON);

    const result = await lookupGspRegion(1.2, 1.2, 200);

    expect(result).not.toBeNull();
    expect(result!.gsp_id).toBe("GSP_A");
    expect(result!.gsp_name).toBe("ALPHA_1");
  });

  it("caches CSV and polygon data after first fetch", async () => {
    await mockFetchOk(MOCK_CSV);

    await lookupGspRegion(52.39, -1.64);
    await lookupGspRegion(51.9, -0.93);

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it("handles fetch failure", async () => {
    mockFetchFail(500);

    await expect(lookupGspRegion(52.39, -1.64)).rejects.toThrow(
      "NESO GSP lookup CSV fetch failed: HTTP 500",
    );
  });

  it("respects custom radius", async () => {
    await mockFetchOk(MOCK_CSV);

    const result = await lookupGspRegion(52.3939, -1.6419, 1);

    expect(result).not.toBeNull();
    expect(result!.gsp_id).toBe("GSP_1");

    const resultFar = await lookupGspRegion(53.0, -2.0, 1);
    expect(resultFar).toBeNull();
  });

  it("deduplicates GSP records from multiple gnode rows", async () => {
    await mockFetchOk(MOCK_CSV);

    const result = await lookupGspRegion(52.39, -1.64);

    expect(result).not.toBeNull();
    expect(result!.gsp_id).toBe("GSP_1");
  });

  it("surfaces a warning when the polygon ZIP fetch fails and falls back to nearest-point", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        if (url.includes("gsp_gnode")) {
          return { ok: true, status: 200, text: async () => MOCK_CSV };
        }
        if (url.includes("gsp_regions")) {
          return {
            ok: false,
            status: 500,
            text: async () => "upstream error",
            arrayBuffer: async () => new ArrayBuffer(0),
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      }),
    );

    const result = await lookupGspRegion(52.39, -1.64);

    expect(result).not.toBeNull();
    expect(result!.gsp_name).toBe("BERKSWELL");
    expect(result!.warnings).toBeDefined();
    expect(result!.warnings!.some((w) => w.includes("polygon fetch failed"))).toBe(true);
    expect(result!.warnings!.some((w) => w.includes("HTTP 500"))).toBe(true);
  });

  it("surfaces a warning when a polygon contains the point but its GSP codes do not match any CSV record", async () => {
    const UNMATCHED_CODE_GEOJSON = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { GSPs: "GHOST_1", GSPGroup: "Ghost Group" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };
    await mockFetchOk(POLYGON_TEST_CSV, UNMATCHED_CODE_GEOJSON);

    const result = await lookupGspRegion(0.5, 0.5, 200);

    expect(result).not.toBeNull();
    expect(["ALPHA_1", "BRAVO_1"]).toContain(result!.gsp_name);
    expect(result!.warnings).toBeDefined();
    expect(
      result!.warnings!.some(
        (w) => w.includes("do not match any CSV record") && w.includes("GHOST_1"),
      ),
    ).toBe(true);
  });

  it("does not attach warnings when both the polygon path and code match succeed", async () => {
    await mockFetchOk(POLYGON_TEST_CSV, POLYGON_PRIORITY_GEOJSON);

    const result = await lookupGspRegion(0.1, 0.1, 200);

    expect(result).not.toBeNull();
    expect(result!.warnings).toBeUndefined();
  });

  it("does not falsely contain a point far outside a closed-ring polygon", async () => {
    await mockFetchOk(POLYGON_TEST_CSV, CLOSED_RING_GEOJSON);

    const result = await lookupGspRegion(-5, -5, 10_000);

    expect(result).not.toBeNull();
    expect(result!.gsp_name).toBe("BRAVO_1");
  });
});
