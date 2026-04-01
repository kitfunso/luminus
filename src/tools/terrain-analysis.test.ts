import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTerrainAnalysis } from "./terrain-analysis.js";

// Mock global fetch
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function makeElevationResponse(elevations: number[]) {
  return {
    ok: true,
    json: async () => ({ elevation: elevations }),
  };
}

describe("getTerrainAnalysis", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns elevation, slope, aspect, and flatness for a flat area", async () => {
    // 3x3 grid all at 10m = perfectly flat
    fetchMock.mockResolvedValueOnce(
      makeElevationResponse([10, 10, 10, 10, 10, 10, 10, 10, 10]),
    );

    const result = await getTerrainAnalysis({ lat: 40.0, lon: 10.0 });

    expect(result.lat).toBe(40.0);
    expect(result.lon).toBe(10.0);
    expect(result.elevation_m).toBe(10);
    expect(result.slope_deg).toBe(0);
    expect(result.flatness_score).toBe(1.0);
    expect(result.source).toBe("open-meteo-elevation");
  });

  it("computes non-zero slope for sloped terrain", async () => {
    // Elevation increases to the east: west column=10, centre=20, east=30
    // Row order: NW, N, NE, W, C, E, SW, S, SE
    fetchMock.mockResolvedValueOnce(
      makeElevationResponse([10, 20, 30, 10, 20, 30, 10, 20, 30]),
    );

    const result = await getTerrainAnalysis({ lat: 41.0, lon: 11.0 });

    expect(result.slope_deg).toBeGreaterThan(0);
    expect(result.elevation_m).toBe(20); // centre point
  });

  it("adjusts east-west slope for longitude spacing by latitude", async () => {
    const eastWestGradient = [10, 20, 30, 10, 20, 30, 10, 20, 30];
    fetchMock
      .mockResolvedValueOnce(makeElevationResponse(eastWestGradient))
      .mockResolvedValueOnce(makeElevationResponse(eastWestGradient));

    const lowLatitude = await getTerrainAnalysis({ lat: 10.0, lon: 11.0 });
    const highLatitude = await getTerrainAnalysis({ lat: 60.0, lon: 11.0 });

    expect(highLatitude.slope_deg).toBeGreaterThan(lowLatitude.slope_deg);
  });

  it("computes south-facing aspect for north-to-south slope", async () => {
    // Elevation decreases north to south: top row=30, middle=20, bottom=10
    fetchMock.mockResolvedValueOnce(
      makeElevationResponse([30, 30, 30, 20, 20, 20, 10, 10, 10]),
    );

    const result = await getTerrainAnalysis({ lat: 42.0, lon: 12.0 });

    expect(result.aspect_cardinal).toBe("S");
    expect(result.aspect_deg).toBeGreaterThanOrEqual(135);
    expect(result.aspect_deg).toBeLessThanOrEqual(225);
  });

  it("rejects invalid latitude", async () => {
    await expect(
      getTerrainAnalysis({ lat: 95, lon: 0 }),
    ).rejects.toThrow("Latitude must be between -90 and 90");
  });

  it("rejects invalid longitude", async () => {
    await expect(
      getTerrainAnalysis({ lat: 0, lon: 200 }),
    ).rejects.toThrow("Longitude must be between -180 and 180");
  });

  it("throws on upstream API error", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal server error",
    });

    await expect(
      getTerrainAnalysis({ lat: 43.0, lon: 13.0 }),
    ).rejects.toThrow("Open-Meteo Elevation API returned 500");
  });

  it("returns cached result on second call", async () => {
    fetchMock.mockResolvedValueOnce(
      makeElevationResponse([10, 10, 10, 10, 10, 10, 10, 10, 10]),
    );

    await getTerrainAnalysis({ lat: 44.0, lon: 14.0 });
    const second = await getTerrainAnalysis({ lat: 44.0, lon: 14.0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.elevation_m).toBe(10);
  });

  it("sends correct coordinates to Open-Meteo API", async () => {
    fetchMock.mockResolvedValueOnce(
      makeElevationResponse([10, 10, 10, 10, 10, 10, 10, 10, 10]),
    );

    await getTerrainAnalysis({ lat: 45.0, lon: 15.0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("api.open-meteo.com/v1/elevation");
    expect(url).toContain("latitude=");
    expect(url).toContain("longitude=");
  });
});
