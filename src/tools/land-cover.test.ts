import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLandCover } from "./land-cover.js";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function makeArcGisResponse(features: unknown[]) {
  return {
    ok: true,
    json: async () => ({ features }),
  };
}

describe("getLandCover", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns CORINE classification for a supported EU country", async () => {
    fetchMock.mockResolvedValue(
      makeArcGisResponse([{ attributes: { Code_18: "211" } }]),
    );

    const result = await getLandCover({ lat: 48.85, lon: 2.35, country: "FR" });

    expect(result.country).toBe("FR");
    expect(result.land_cover?.code).toBe("211");
    expect(result.land_cover?.label).toBe("Non-irrigated arable land");
    expect(result.land_cover?.class_group).toBe("Agricultural areas");
    expect(result.land_cover?.is_planning_exclusion).toBe(false);
    expect(result.coverage_note).toBeNull();
    expect(result.source_metadata.id).toBe("corine-land-cover");
  });

  it("flags wetlands as planning exclusions", async () => {
    fetchMock.mockResolvedValue(
      makeArcGisResponse([{ attributes: { Code_18: "412" } }]),
    );

    const result = await getLandCover({ lat: 53.0, lon: 14.0, country: "PL" });

    expect(result.land_cover?.label).toBe("Peat bogs");
    expect(result.land_cover?.is_planning_exclusion).toBe(true);
  });

  it("returns a GB coverage note instead of querying CORINE", async () => {
    const result = await getLandCover({ lat: 52.0, lon: -1.0, country: "GB" });

    expect(result.country).toBe("GB");
    expect(result.land_cover).toBeNull();
    expect(result.coverage_note).toContain("Great Britain is not covered");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported countries outside CORINE coverage", async () => {
    await expect(
      getLandCover({ lat: 40.71, lon: -74.0, country: "US" }),
    ).rejects.toThrow('Country "US" is not supported by CORINE Land Cover 2018');
  });

  it("returns a coverage note when the point has no polygon hit", async () => {
    fetchMock.mockResolvedValue(makeArcGisResponse([]));

    const result = await getLandCover({ lat: 43.0, lon: 5.0, country: "FR" });

    expect(result.land_cover).toBeNull();
    expect(result.coverage_note).toContain("No CORINE polygon found");
  });

  it("wraps upstream errors with a clear CORINE message", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Service unavailable",
    });

    await expect(
      getLandCover({ lat: 48.86, lon: 2.36, country: "FR" }),
    ).rejects.toThrow("CORINE Land Cover query failed: CORINE API returned 503");
  });
});
