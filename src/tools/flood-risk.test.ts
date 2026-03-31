import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFloodRisk } from "./flood-risk.js";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function makeArcGisResponse(features: unknown[]) {
  return {
    ok: true,
    json: async () => ({ features }),
  };
}

describe("getFloodRisk", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects non-GB countries with a clear error", async () => {
    await expect(
      getFloodRisk({ lat: 48.85, lon: 2.35, country: "FR" }),
    ).rejects.toThrow('Country "FR" is not supported');
  });

  it("rejects invalid latitude", async () => {
    await expect(
      getFloodRisk({ lat: 95, lon: 0, country: "GB" }),
    ).rejects.toThrow("Latitude must be between -90 and 90");
  });

  it("rejects invalid longitude", async () => {
    await expect(
      getFloodRisk({ lat: 51, lon: 200, country: "GB" }),
    ).rejects.toThrow("Longitude must be between -180 and 180");
  });

  it("returns low risk and Flood Zone 1 when all layers are clear", async () => {
    fetchMock.mockImplementation(async () => makeArcGisResponse([]));

    const result = await getFloodRisk({ lat: 52.0, lon: 0.5, country: "GB" });

    expect(result.country).toBe("GB");
    expect(result.flood_zone).toBe("1");
    expect(result.planning_risk).toBe("low");
    expect(result.flood_storage_area).toBe(false);
    expect(result.flood_zone_2).toHaveLength(0);
    expect(result.flood_zone_3).toHaveLength(0);
    expect(result.flood_storage_areas).toHaveLength(0);
  });

  it("returns high risk for Flood Zone 3", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/1/query")) {
        return makeArcGisResponse([
          {
            attributes: {
              layer: "Flood Zone 3",
              type: "Tidal Models",
              Shape__Area: 103646942.1548,
            },
          },
        ]);
      }
      if (url.includes("/2/query")) {
        return makeArcGisResponse([
          {
            attributes: {
              layer: "Flood Zone 2",
              type: "Tidal Models",
              Shape__Area: 104646942.1548,
            },
          },
        ]);
      }
      return makeArcGisResponse([]);
    });

    const result = await getFloodRisk({ lat: 51.5, lon: -0.1, country: "GB" });

    expect(result.flood_zone).toBe("3");
    expect(result.planning_risk).toBe("high");
    expect(result.flood_zone_3).toHaveLength(1);
    expect(result.flood_zone_3[0].type).toBe("Tidal Models");
    expect(result.flood_zone_3[0].area_ha).toBe(10364.69);
  });

  it("returns medium risk for Flood Zone 2 without Flood Zone 3", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/2/query")) {
        return makeArcGisResponse([
          {
            attributes: {
              layer: "Flood Zone 2",
              type: "Rivers and Sea",
              Shape__Area: 250000,
            },
          },
        ]);
      }
      return makeArcGisResponse([]);
    });

    const result = await getFloodRisk({ lat: 52.1, lon: 0.6, country: "GB" });

    expect(result.flood_zone).toBe("2");
    expect(result.planning_risk).toBe("medium");
    expect(result.flood_zone_2).toHaveLength(1);
    expect(result.flood_zone_3).toHaveLength(0);
  });

  it("treats flood storage areas as high risk", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/0/query")) {
        return makeArcGisResponse([
          {
            attributes: {
              layer: "Flood Storage Areas",
              Shape__Area: 500000,
            },
          },
        ]);
      }
      return makeArcGisResponse([]);
    });

    const result = await getFloodRisk({ lat: 52.2, lon: 0.7, country: "GB" });

    expect(result.flood_storage_area).toBe(true);
    expect(result.planning_risk).toBe("high");
    expect(result.flood_storage_areas).toHaveLength(1);
  });

  it("returns unknown classification when a key layer fails and no positive hit is found", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/1/query")) {
        return { ok: false, status: 503, text: async () => "Upstream down" };
      }
      return makeArcGisResponse([]);
    });

    const result = await getFloodRisk({ lat: 52.3, lon: 0.8, country: "GB" });

    expect(result.flood_zone).toBe("unknown");
    expect(result.planning_risk).toBe("unknown");
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some((w) => w.includes("flood_zone_3"))).toBe(true);
  });

  it("still returns a positive result when one layer fails but another shows real risk", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/0/query")) {
        return { ok: false, status: 500, text: async () => "Server error" };
      }
      if (url.includes("/1/query")) {
        return makeArcGisResponse([
          {
            attributes: {
              layer: "Flood Zone 3",
              type: "Fluvial Models",
              Shape__Area: 12345,
            },
          },
        ]);
      }
      return makeArcGisResponse([]);
    });

    const result = await getFloodRisk({ lat: 52.4, lon: 0.9, country: "GB" });

    expect(result.flood_zone).toBe("3");
    expect(result.planning_risk).toBe("high");
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some((w) => w.includes("flood_storage_area"))).toBe(true);
  });

  it("throws when all flood layers fail", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 500,
      text: async () => "Server error",
    }));

    await expect(
      getFloodRisk({ lat: 52.5, lon: 1.0, country: "GB" }),
    ).rejects.toThrow("All Environment Agency flood queries failed");
  });

  it("returns cached result on second call", async () => {
    fetchMock.mockImplementation(async () => makeArcGisResponse([]));

    await getFloodRisk({ lat: 52.6, lon: 1.1, country: "GB" });
    const callsAfterFirst = fetchMock.mock.calls.length;

    const second = await getFloodRisk({ lat: 52.6, lon: 1.1, country: "GB" });

    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
    expect(second.flood_zone).toBe("1");
  });

  it("includes source_metadata with provenance fields", async () => {
    fetchMock.mockImplementation(async () => makeArcGisResponse([]));

    const result = await getFloodRisk({ lat: 52.7, lon: 1.2, country: "GB" });

    expect(result.source_metadata).toBeDefined();
    expect(result.source_metadata.id).toBe("ea-flood-map");
    expect(result.source_metadata.provider).toContain("Environment Agency");
    expect(result.source_metadata.licence).toContain("Open Government Licence");
    expect(result.source_metadata.reliability).toBe("medium");
    expect(result.source_metadata.caveats.length).toBeGreaterThan(0);
    expect(result.source_metadata.attribution).toBeDefined();
  });

  it("accepts lowercase country code", async () => {
    fetchMock.mockImplementation(async () => makeArcGisResponse([]));

    const result = await getFloodRisk({ lat: 52.8, lon: 1.3, country: "gb" });

    expect(result.country).toBe("GB");
  });
});
