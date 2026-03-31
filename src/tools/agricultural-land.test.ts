import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAgriculturalLand } from "./agricultural-land.js";

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

const POST_1988_GRADE_3A = {
  attributes: {
    ALC_GRADE: "Grade 3a",
    HECTARES: 12.34,
    RPT: "Leeds",
  },
};

const POST_1988_GRADE_4 = {
  attributes: {
    ALC_GRADE: "Grade 4",
    HECTARES: 7.1,
    RPT: "York",
  },
};

const PROVISIONAL_GRADE_3 = {
  attributes: {
    ALC_GRADE: "Grade 3",
    AREA: 98.76,
    GEOGEXT: "TG2",
  },
};

const PROVISIONAL_GRADE_2 = {
  attributes: {
    ALC_GRADE: "Grade 2",
    AREA: 88.12,
    GEOGEXT: "SP1",
  },
};

describe("getAgriculturalLand", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects non-GB countries with a clear error", async () => {
    await expect(
      getAgriculturalLand({ lat: 48.85, lon: 2.35, country: "FR" }),
    ).rejects.toThrow('Country "FR" is not supported');
  });

  it("rejects invalid latitude", async () => {
    await expect(
      getAgriculturalLand({ lat: 95, lon: 0, country: "GB" }),
    ).rejects.toThrow("Latitude must be between -90 and 90");
  });

  it("rejects invalid longitude", async () => {
    await expect(
      getAgriculturalLand({ lat: 51, lon: 200, country: "GB" }),
    ).rejects.toThrow("Longitude must be between -180 and 180");
  });

  it("prefers detailed post-1988 classification when available", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("Agricultural_Land_Classification_Post_1988")) {
        return makeArcGisResponse([POST_1988_GRADE_3A]);
      }
      return makeArcGisResponse([PROVISIONAL_GRADE_2]);
    });

    const result = await getAgriculturalLand({
      lat: 53.8,
      lon: -1.55,
      country: "GB",
    });

    expect(result.classification_basis).toBe("post_1988");
    expect(result.effective_grade).toBe("Grade 3a");
    expect(result.bmv_status).toBe("yes");
    expect(result.post_1988?.survey_ref).toBe("Leeds");
  });

  it("falls back to provisional classification when no detailed survey matches", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("Agricultural_Land_Classification_Post_1988")) {
        return makeEmptyResponse();
      }
      return makeArcGisResponse([PROVISIONAL_GRADE_2]);
    });

    const result = await getAgriculturalLand({
      lat: 52.1,
      lon: 0.4,
      country: "GB",
    });

    expect(result.classification_basis).toBe("provisional");
    expect(result.effective_grade).toBe("Grade 2");
    expect(result.bmv_status).toBe("yes");
    expect(result.provisional?.survey_ref).toBe("SP1");
  });

  it("marks provisional Grade 3 as uncertain BMV status", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("Agricultural_Land_Classification_Post_1988")) {
        return makeEmptyResponse();
      }
      return makeArcGisResponse([PROVISIONAL_GRADE_3]);
    });

    const result = await getAgriculturalLand({
      lat: 52.2,
      lon: 0.5,
      country: "GB",
    });

    expect(result.classification_basis).toBe("provisional");
    expect(result.effective_grade).toBe("Grade 3");
    expect(result.bmv_status).toBe("uncertain");
    expect(result.explanation).toContain("cannot distinguish 3a from 3b");
  });

  it("marks detailed Grade 4 as not BMV", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("Agricultural_Land_Classification_Post_1988")) {
        return makeArcGisResponse([POST_1988_GRADE_4]);
      }
      return makeEmptyResponse();
    });

    const result = await getAgriculturalLand({
      lat: 53.9,
      lon: -1.4,
      country: "GB",
    });

    expect(result.classification_basis).toBe("post_1988");
    expect(result.bmv_status).toBe("no");
    expect(result.explanation).toContain("not Best and Most Versatile");
  });

  it("returns unknown when no ALC polygon matches", async () => {
    fetchMock.mockImplementation(async () => makeEmptyResponse());

    const result = await getAgriculturalLand({
      lat: 57.1,
      lon: -4.2,
      country: "GB",
    });

    expect(result.classification_basis).toBe("none");
    expect(result.effective_grade).toBeNull();
    expect(result.bmv_status).toBe("unknown");
    expect(result.explanation).toContain("England-only");
  });

  it("returns warnings when one dataset fails but the other succeeds", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("Agricultural_Land_Classification_Post_1988")) {
        return { ok: false, status: 500, text: async () => "Server error" };
      }
      return makeArcGisResponse([PROVISIONAL_GRADE_2]);
    });

    const result = await getAgriculturalLand({
      lat: 52.3,
      lon: 0.6,
      country: "GB",
    });

    expect(result.classification_basis).toBe("provisional");
    expect(result.warnings).toBeDefined();
    expect(result.warnings![0]).toContain("post_1988");
  });

  it("throws when both ALC datasets fail", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 500,
      text: async () => "Server error",
    }));

    await expect(
      getAgriculturalLand({ lat: 52.4, lon: 0.7, country: "GB" }),
    ).rejects.toThrow("All Natural England ALC queries failed");
  });

  it("handles ArcGIS JSON error bodies", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        error: { code: 400, message: "Invalid query parameters" },
      }),
    }));

    await expect(
      getAgriculturalLand({ lat: 52.45, lon: 0.75, country: "GB" }),
    ).rejects.toThrow("All Natural England ALC queries failed");
  });

  it("returns cached result on second call", async () => {
    fetchMock.mockImplementation(async () => makeEmptyResponse());

    await getAgriculturalLand({ lat: 52.5, lon: 0.8, country: "GB" });
    const callsAfterFirst = fetchMock.mock.calls.length;

    const second = await getAgriculturalLand({ lat: 52.5, lon: 0.8, country: "GB" });

    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
    expect(second.classification_basis).toBe("none");
  });

  it("includes source metadata with provenance fields", async () => {
    fetchMock.mockImplementation(async () => makeEmptyResponse());

    const result = await getAgriculturalLand({
      lat: 52.55,
      lon: 0.85,
      country: "GB",
    });

    expect(result.source_metadata.id).toBe("natural-england-alc");
    expect(result.source_metadata.provider).toContain("Natural England");
    expect(result.source_metadata.licence).toContain("OGL");
    expect(result.source_metadata.caveats.length).toBeGreaterThan(0);
    expect(result.disclaimer.length).toBeGreaterThan(0);
  });

  it("accepts lowercase country code", async () => {
    fetchMock.mockImplementation(async () => makeEmptyResponse());

    const result = await getAgriculturalLand({
      lat: 52.6,
      lon: 0.9,
      country: "gb",
    });

    expect(result.country).toBe("GB");
  });
});
