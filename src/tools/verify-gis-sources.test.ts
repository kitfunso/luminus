import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyGisSources } from "./verify-gis-sources.js";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function makeOkResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  };
}

function makeErrorResponse(status: number) {
  return {
    ok: false,
    status,
    text: async () => `Error ${status}`,
  };
}

describe("verifyGisSources", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unknown source_id", async () => {
    await expect(
      verifyGisSources({ source_id: "nonexistent" }),
    ).rejects.toThrow('Unknown source ID "nonexistent"');
  });

  it("checks all sources when no source_id given", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("open-meteo.com")) {
        return makeOkResponse({ elevation: [11.2] });
      }
      if (url.includes("overpass-api.de")) {
        return makeOkResponse({ elements: [] });
      }
      if (url.includes("api.neso.energy") && url.includes("gsp_gnode")) {
        return { ok: true, status: 200, text: async () => "gsp_id,gsp_name,gsp_lat,gsp_lon\nGSP1,TEST,51.5,-0.1" };
      }
      if (url.includes("api.neso.energy")) {
        return makeOkResponse({ success: true, result: { records: [{}] } });
      }
      if (url.includes("data-api.ssen.co.uk")) {
        return makeOkResponse({
          result: {
            resources: [{ name: "Headroom Dashboard Data - March 2026", format: "CSV" }],
          },
        });
      }
      if (url.includes("connecteddata.nationalgrid.co.uk")) {
        return makeOkResponse({
          success: true,
          result: {
            resources: [{ id: "nged-resource", name: "Berkswell", datastore_active: true }],
          },
        });
      }
      if (url.includes("northernpowergrid.opendatasoft.com")) {
        return makeOkResponse({
          results: [{ name: "Armouries Drive", type: "Primary", substation_location: { lat: 53.79, lon: -1.53 } }],
        });
      }
      if (url.includes("arcgis.com") || url.includes("environment.data.gov.uk") || url.includes("bio.discomap.eea.europa.eu")) {
        return makeOkResponse({ features: [{ attributes: { NAME: "Test" } }] });
      }
      if (url.includes("image.discomap.eea.europa.eu")) {
        return makeOkResponse({ features: [{ attributes: { Code_18: "211" } }] });
      }
      if (url.includes("jrc.ec.europa.eu")) {
        return makeOkResponse({ outputs: { totals: {} } });
      }
      return makeErrorResponse(404);
    });

    const result = await verifyGisSources({});

    expect(result.checked_at).toBeDefined();
    expect(result.sources.length).toBe(14);
    expect(result.summary.total).toBe(14);
    expect(result.summary.ok).toBe(14);
    expect(result.summary.degraded).toBe(0);
    expect(result.summary.unreachable).toBe(0);
  });

  it("checks a single source when source_id is given", async () => {
    fetchMock.mockResolvedValue(
      makeOkResponse({ elevation: [25.0] }),
    );

    const result = await verifyGisSources({
      source_id: "open-meteo-elevation",
    });

    expect(result.sources.length).toBe(1);
    expect(result.sources[0].source_id).toBe("open-meteo-elevation");
    expect(result.sources[0].status).toBe("ok");
    expect(result.sources[0].response_time_ms).toBeGreaterThanOrEqual(0);
    expect(result.sources[0].error).toBeNull();
    expect(result.sources[0].metadata.id).toBe("open-meteo-elevation");
  });

  it("reports degraded for non-200 response", async () => {
    fetchMock.mockResolvedValue(makeErrorResponse(503));

    const result = await verifyGisSources({
      source_id: "open-meteo-elevation",
    });

    expect(result.sources[0].status).toBe("degraded");
    expect(result.sources[0].error).toContain("HTTP 503");
  });

  it("reports degraded when response body is invalid", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "not json",
    });

    const result = await verifyGisSources({
      source_id: "open-meteo-elevation",
    });

    expect(result.sources[0].status).toBe("degraded");
    expect(result.sources[0].error).toContain("not valid JSON");
  });

  it("reports unreachable on network error", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await verifyGisSources({
      source_id: "open-meteo-elevation",
    });

    expect(result.sources[0].status).toBe("unreachable");
    expect(result.sources[0].error).toContain("ECONNREFUSED");
  });

  it("reports unreachable on timeout (abort)", async () => {
    fetchMock.mockRejectedValue(new Error("The operation was aborted"));

    const result = await verifyGisSources({
      source_id: "open-meteo-elevation",
    });

    expect(result.sources[0].status).toBe("unreachable");
    expect(result.sources[0].error).toContain("Timed out");
  });

  it("includes metadata in each source result", async () => {
    fetchMock.mockResolvedValue(
      makeOkResponse({ features: [{ attributes: { NAME: "Test" } }] }),
    );

    const result = await verifyGisSources({
      source_id: "natural-england",
    });

    const meta = result.sources[0].metadata;
    expect(meta.id).toBe("natural-england");
    expect(meta.provider).toContain("Natural England");
    expect(meta.licence).toContain("OGL");
    expect(meta.caveats.length).toBeGreaterThan(0);
  });

  it("handles mixed results across sources", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("open-meteo.com")) {
        return makeOkResponse({ elevation: [11.2] });
      }
      if (url.includes("overpass-api.de")) {
        return makeErrorResponse(429);
      }
      if (url.includes("api.neso.energy") && url.includes("gsp_gnode")) {
        return { ok: true, status: 200, text: async () => "gsp_id,gsp_name,gsp_lat,gsp_lon\nGSP1,TEST,51.5,-0.1" };
      }
      if (url.includes("api.neso.energy")) {
        return makeOkResponse({ success: true, result: { records: [{}] } });
      }
      if (url.includes("data-api.ssen.co.uk")) {
        return makeOkResponse({
          result: {
            resources: [{ name: "Headroom Dashboard Data - March 2026", format: "CSV" }],
          },
        });
      }
      if (url.includes("northernpowergrid.opendatasoft.com")) {
        return makeOkResponse({
          results: [{ name: "Armouries Drive", type: "Primary", substation_location: { lat: 53.79, lon: -1.53 } }],
        });
      }
      if (url.includes("arcgis.com")) {
        throw new Error("Network failure");
      }
      if (url.includes("bio.discomap.eea.europa.eu")) {
        return makeOkResponse({ features: [{ attributes: { SITECODE: "FR0001" } }] });
      }
      if (url.includes("image.discomap.eea.europa.eu")) {
        return makeOkResponse({ features: [{ attributes: { Code_18: "211" } }] });
      }
      if (url.includes("environment.data.gov.uk")) {
        return makeErrorResponse(500);
      }
      if (url.includes("jrc.ec.europa.eu")) {
        return makeOkResponse({ outputs: { totals: {} } });
      }
      return makeErrorResponse(500);
    });

    const result = await verifyGisSources({});

    // ok: open-meteo, neso-gsp-lookup, neso-tec, ssen-headroom, npg-heatmap, eea-natura2000, corine, pvgis = 8
    // degraded: overpass (429), ea-flood-map (500), plus the two NGED source checks = 4
    // unreachable: natural-england, natural-england-alc (arcgis.com network failure) = 2
    expect(result.summary.ok).toBe(8);
    expect(result.summary.degraded).toBe(4);
    expect(result.summary.unreachable).toBe(2);
  });

  it("reports degraded when Overpass response lacks elements array", async () => {
    fetchMock.mockResolvedValue(
      makeOkResponse({ remark: "ok but no elements" }),
    );

    const result = await verifyGisSources({
      source_id: "overpass-osm",
    });

    expect(result.sources[0].status).toBe("degraded");
    expect(result.sources[0].error).toContain("missing elements array");
  });

  it("reports NE ArcGIS error in response body as degraded", async () => {
    fetchMock.mockResolvedValue(
      makeOkResponse({ error: { code: 400, message: "Invalid query" } }),
    );

    const result = await verifyGisSources({
      source_id: "natural-england",
    });

    expect(result.sources[0].status).toBe("degraded");
    expect(result.sources[0].error).toContain("ArcGIS error");
  });
});
