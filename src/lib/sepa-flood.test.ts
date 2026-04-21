import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SEPA_FLOOD_SERVICES,
  resolveExtentLayerId,
  queryFloodAtPoint,
  querySepaFloodAtPoint,
  _resetSepaFloodCache,
} from "./sepa-flood.js";

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

interface MockResponseSpec {
  ok?: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}

function makeMockResponse(spec: MockResponseSpec): Response {
  const status = spec.status ?? 200;
  const ok = spec.ok ?? (status >= 200 && status < 300);
  return {
    ok,
    status,
    json: () => Promise.resolve(spec.json ?? {}),
    text: () => Promise.resolve(spec.text ?? JSON.stringify(spec.json ?? {})),
  } as unknown as Response;
}

/**
 * URL-matcher based fetch mock. Accepts a list of {match, response} pairs
 * and returns the first matching response for each call. Matching is a
 * substring check on the URL string.
 */
function mockFetchByUrl(
  rules: Array<{ match: string; response: MockResponseSpec }>,
): ReturnType<typeof vi.fn> {
  const fn = vi.fn((input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    const rule = rules.find((r) => url.includes(r.match));
    if (!rule) {
      return Promise.reject(new Error(`No mock rule matched URL: ${url}`));
    }
    return Promise.resolve(makeMockResponse(rule.response));
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  _resetSepaFloodCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Layer-id discovery
// ---------------------------------------------------------------------------

describe("resolveExtentLayerId", () => {
  it("returns the id of the first layer whose name contains 'extent'", async () => {
    mockFetchByUrl([
      {
        match: "River_Flooding_Medium_Likelihood/FeatureServer/layers",
        response: {
          json: {
            layers: [
              { id: 0, name: "River Flooding Medium Likelihood Depth", geometryType: "esriGeometryPolygon" },
              { id: 1, name: "River Flooding Medium Likelihood Extent", geometryType: "esriGeometryPolygon" },
              { id: 2, name: "River Flooding Medium Likelihood Velocity", geometryType: "esriGeometryPolygon" },
            ],
          },
        },
      },
    ]);

    const layerId = await resolveExtentLayerId("River_Flooding_Medium_Likelihood");
    expect(layerId).toBe(1);
  });

  it("falls back to the first polygon-geometry layer when no name contains 'extent'", async () => {
    mockFetchByUrl([
      {
        match: "Coastal_Flooding_High_Likelihood/FeatureServer/layers",
        response: {
          json: {
            layers: [
              { id: 5, name: "Some metadata layer", geometryType: "esriGeometryPoint" },
              { id: 7, name: "Coastal flood outline", geometryType: "esriGeometryPolygon" },
              { id: 9, name: "Another polygon", geometryType: "esriGeometryPolygon" },
            ],
          },
        },
      },
    ]);

    const layerId = await resolveExtentLayerId("Coastal_Flooding_High_Likelihood");
    expect(layerId).toBe(7);
  });

  it("caches the layer id across calls for the same slug", async () => {
    const fn = mockFetchByUrl([
      {
        match: "River_Flooding_Low_Likelihood/FeatureServer/layers",
        response: {
          json: {
            layers: [
              { id: 3, name: "River Flooding Low Likelihood Extent", geometryType: "esriGeometryPolygon" },
            ],
          },
        },
      },
    ]);

    const first = await resolveExtentLayerId("River_Flooding_Low_Likelihood");
    const second = await resolveExtentLayerId("River_Flooding_Low_Likelihood");

    expect(first).toBe(3);
    expect(second).toBe(3);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Point query
// ---------------------------------------------------------------------------

describe("queryFloodAtPoint", () => {
  it("returns true when returnCountOnly response has count > 0", async () => {
    mockFetchByUrl([
      {
        match: "Surface_Water_and_Small_Watercourses_Flooding_Medium_Likelihood/FeatureServer/layers",
        response: {
          json: {
            layers: [
              { id: 2, name: "Surface Water Medium Extent", geometryType: "esriGeometryPolygon" },
            ],
          },
        },
      },
      {
        match: "Surface_Water_and_Small_Watercourses_Flooding_Medium_Likelihood/FeatureServer/2/query",
        response: { json: { count: 1 } },
      },
    ]);

    const hit = await queryFloodAtPoint(
      "Surface_Water_and_Small_Watercourses_Flooding_Medium_Likelihood",
      55.9533,
      -3.1883,
    );
    expect(hit).toBe(true);
  });

  it("returns false when count is 0", async () => {
    mockFetchByUrl([
      {
        match: "River_Flooding_High_Likelihood/FeatureServer/layers",
        response: {
          json: {
            layers: [
              { id: 1, name: "River Flooding High Likelihood Extent", geometryType: "esriGeometryPolygon" },
            ],
          },
        },
      },
      {
        match: "River_Flooding_High_Likelihood/FeatureServer/1/query",
        response: { json: { count: 0 } },
      },
    ]);

    const hit = await queryFloodAtPoint("River_Flooding_High_Likelihood", 55.9533, -3.1883);
    expect(hit).toBe(false);
  });

  it("throws a 'SEPA flood query failed' error on HTTP 500", async () => {
    mockFetchByUrl([
      {
        match: "River_Flooding_Medium_Likelihood/FeatureServer/layers",
        response: {
          json: {
            layers: [
              { id: 1, name: "River Flooding Medium Likelihood Extent", geometryType: "esriGeometryPolygon" },
            ],
          },
        },
      },
      {
        match: "River_Flooding_Medium_Likelihood/FeatureServer/1/query",
        response: { ok: false, status: 500, text: "internal error" },
      },
    ]);

    await expect(
      queryFloodAtPoint("River_Flooding_Medium_Likelihood", 55.9533, -3.1883),
    ).rejects.toThrow(/SEPA flood query failed/);
  });
});

// ---------------------------------------------------------------------------
// Aggregate query
// ---------------------------------------------------------------------------

describe("querySepaFloodAtPoint", () => {
  it("returns only matching services and captures errors for the rest", async () => {
    // Give every service a working /layers response at id 0, then selectively
    // return hits, misses, or errors on the point-query endpoints.
    const rules: Array<{ match: string; response: MockResponseSpec }> = [];

    // Layers responses for all 9 services
    for (const service of SEPA_FLOOD_SERVICES) {
      rules.push({
        match: `${service.slug}/FeatureServer/layers`,
        response: {
          json: {
            layers: [
              { id: 0, name: `${service.slug} Extent`, geometryType: "esriGeometryPolygon" },
            ],
          },
        },
      });
    }

    // One hit (river medium), one miss (coastal high), one error (surface water low);
    // everything else misses.
    for (const service of SEPA_FLOOD_SERVICES) {
      if (service.source === "river" && service.likelihood === "medium") {
        rules.push({
          match: `${service.slug}/FeatureServer/0/query`,
          response: { json: { count: 1 } },
        });
      } else if (service.source === "surface_water" && service.likelihood === "low") {
        rules.push({
          match: `${service.slug}/FeatureServer/0/query`,
          response: { ok: false, status: 503, text: "service unavailable" },
        });
      } else {
        rules.push({
          match: `${service.slug}/FeatureServer/0/query`,
          response: { json: { count: 0 } },
        });
      }
    }

    mockFetchByUrl(rules);

    const { matches, errors } = await querySepaFloodAtPoint(55.9533, -3.1883);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      source: "river",
      likelihood: "medium",
      slug: "River_Flooding_Medium_Likelihood",
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(
      "Surface_Water_and_Small_Watercourses_Flooding_Low_Likelihood",
    );
    expect(errors[0]).toMatch(/SEPA flood query failed/);
  });
});
