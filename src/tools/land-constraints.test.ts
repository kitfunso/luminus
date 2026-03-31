import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLandConstraints } from "./land-constraints.js";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function makeArcGisResponse(features: unknown[]) {
  return {
    ok: true,
    json: async () => ({ features }),
  };
}

function makeEmptyResponse() {
  return makeArcGisResponse([]);
}

const SSSI_FEATURE = {
  attributes: {
    NAME: "Epping Forest",
    MEASURE: 1605.73,
  },
};

const SAC_FEATURE = {
  attributes: {
    SAC_NAME: "Epping Forest SAC",
    SAC_AREA: 1605.73,
  },
};

const NATIONAL_PARK_FEATURE = {
  attributes: {
    NAME: "Dartmoor",
    HECTARES: 95350,
  },
};

describe("getLandConstraints", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects non-GB countries with a clear error", async () => {
    await expect(
      getLandConstraints({ lat: 48.85, lon: 2.35, country: "FR" }),
    ).rejects.toThrow('Country "FR" is not supported');
  });

  it("rejects invalid latitude", async () => {
    await expect(
      getLandConstraints({ lat: 95, lon: 0, country: "GB" }),
    ).rejects.toThrow("Latitude must be between -90 and 90");
  });

  it("rejects invalid longitude", async () => {
    await expect(
      getLandConstraints({ lat: 51, lon: 200, country: "GB" }),
    ).rejects.toThrow("Longitude must be between -180 and 180");
  });

  it("rejects radius_km > 10", async () => {
    await expect(
      getLandConstraints({ lat: 51, lon: -1, radius_km: 15, country: "GB" }),
    ).rejects.toThrow("radius_km must be between 0 and 10");
  });

  it("returns constraints from NE API response", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("SSSI")) {
        return makeArcGisResponse([SSSI_FEATURE]);
      }
      return makeEmptyResponse();
    });

    const result = await getLandConstraints({
      lat: 51.65,
      lon: 0.05,
      country: "GB",
    });

    expect(result.country).toBe("GB");
    expect(result.constraints).toHaveLength(1);
    expect(result.constraints[0].name).toBe("Epping Forest");
    expect(result.constraints[0].type).toBe("sssi");
    expect(result.constraints[0].area_ha).toBe(1605.73);
    expect(result.constraints[0].source).toBe("natural-england");
  });

  it("returns empty constraints for a clear area", async () => {
    fetchMock.mockImplementation(async () => makeEmptyResponse());

    const result = await getLandConstraints({
      lat: 52.0,
      lon: -1.0,
      country: "GB",
    });

    expect(result.constraints).toHaveLength(0);
    expect(result.summary.has_hard_constraint).toBe(false);
    expect(result.summary.constraint_count).toBe(0);
  });

  it("sets has_hard_constraint for SSSI and SAC hits", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("SSSI")) {
        return makeArcGisResponse([SSSI_FEATURE]);
      }
      if (typeof url === "string" && url.includes("Special_Areas_of_Conservation")) {
        return makeArcGisResponse([SAC_FEATURE]);
      }
      return makeEmptyResponse();
    });

    const result = await getLandConstraints({
      lat: 51.66,
      lon: 0.06,
      country: "GB",
    });

    expect(result.summary.has_hard_constraint).toBe(true);
    expect(result.summary.constraint_count).toBe(2);
  });

  it("treats national_park as a hard constraint", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("National_Parks")) {
        return makeArcGisResponse([NATIONAL_PARK_FEATURE]);
      }
      return makeEmptyResponse();
    });

    const result = await getLandConstraints({
      lat: 50.57,
      lon: -3.92,
      country: "GB",
    });

    expect(result.summary.has_hard_constraint).toBe(true);
    expect(result.constraints[0].name).toBe("Dartmoor");
    expect(result.constraints[0].type).toBe("national_park");
  });

  it("handles partial layer failures with warnings", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("SSSI")) {
        return makeArcGisResponse([SSSI_FEATURE]);
      }
      if (typeof url === "string" && url.includes("Special_Areas_of_Conservation")) {
        return { ok: false, status: 500, text: async () => "Internal error" };
      }
      return makeEmptyResponse();
    });

    const result = await getLandConstraints({
      lat: 51.67,
      lon: 0.07,
      country: "GB",
    });

    expect(result.constraints.some((c) => c.type === "sssi")).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.length).toBeGreaterThan(0);
  });

  it("throws when all layers fail", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 500,
      text: async () => "Server error",
    }));

    await expect(
      getLandConstraints({ lat: 51.68, lon: 0.08, country: "GB" }),
    ).rejects.toThrow("All Natural England API queries failed");
  });

  it("handles NE API JSON error body", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        error: { code: 400, message: "Invalid query parameters" },
      }),
    }));

    await expect(
      getLandConstraints({ lat: 51.72, lon: 0.12, country: "GB" }),
    ).rejects.toThrow("All Natural England API queries failed");
  });

  it("returns cached result on second call", async () => {
    fetchMock.mockImplementation(async () => makeEmptyResponse());

    await getLandConstraints({ lat: 51.69, lon: 0.09, country: "GB" });
    const callsAfterFirst = fetchMock.mock.calls.length;

    const second = await getLandConstraints({ lat: 51.69, lon: 0.09, country: "GB" });

    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
    expect(second.constraints).toHaveLength(0);
  });

  it("uses default radius_km of 2", async () => {
    fetchMock.mockImplementation(async () => makeEmptyResponse());

    const result = await getLandConstraints({
      lat: 51.7,
      lon: 0.1,
      country: "GB",
    });

    expect(result.radius_km).toBe(2);
  });

  it("includes source_metadata with provenance fields", async () => {
    fetchMock.mockImplementation(async () => makeEmptyResponse());

    const result = await getLandConstraints({
      lat: 51.73,
      lon: 0.13,
      country: "GB",
    });

    expect(result.source_metadata).toBeDefined();
    expect(result.source_metadata.id).toBe("natural-england");
    expect(result.source_metadata.provider).toContain("Natural England");
    expect(result.source_metadata.licence).toContain("OGL");
    expect(result.source_metadata.reliability).toBe("medium");
    expect(result.source_metadata.caveats.length).toBeGreaterThan(0);
    expect(result.source_metadata.attribution).toBeDefined();
  });

  it("accepts lowercase country code", async () => {
    fetchMock.mockImplementation(async () => makeEmptyResponse());

    const result = await getLandConstraints({
      lat: 51.71,
      lon: 0.11,
      country: "gb",
    });

    expect(result.country).toBe("GB");
  });
});
