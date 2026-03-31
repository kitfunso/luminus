import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGridProximity } from "./grid-proximity.js";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function makeOverpassResponse(elements: unknown[]) {
  return {
    ok: true,
    json: async () => ({ elements }),
  };
}

const SUBSTATION_NODE = {
  type: "node",
  id: 1001,
  lat: 51.51,
  lon: -0.09,
  tags: {
    power: "substation",
    name: "City Road 132kV",
    voltage: "132000",
    operator: "National Grid",
  },
};

const LINE_WAY = {
  type: "way",
  id: 2001,
  tags: {
    power: "line",
    voltage: "400000",
    operator: "National Grid",
    cables: "2",
  },
  geometry: [
    { lat: 51.505, lon: -0.095 },
    { lat: 51.506, lon: -0.096 },
  ],
};

const LOW_VOLTAGE_LINE = {
  type: "way",
  id: 2002,
  tags: {
    power: "line",
    voltage: "11000",
    operator: "UK Power Networks",
  },
  geometry: [{ lat: 51.501, lon: -0.1 }],
};

describe("getGridProximity", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns substations and lines with distances", async () => {
    fetchMock.mockResolvedValueOnce(makeOverpassResponse([SUBSTATION_NODE, LINE_WAY]));

    const result = await getGridProximity({ lat: 50.0, lon: 1.0 });

    expect(result.lat).toBe(50.0);
    expect(result.lon).toBe(1.0);
    expect(result.substations).toHaveLength(1);
    expect(result.substations[0].name).toBe("City Road 132kV");
    expect(result.substations[0].voltage_kv).toBe(132);
    expect(result.substations[0].distance_km).toBeGreaterThan(0);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].voltage_kv).toBe(400);
    expect(result.lines[0].distance_km).toBeGreaterThan(0);
  });

  it("filters lines below voltage_min_kv", async () => {
    fetchMock.mockResolvedValueOnce(makeOverpassResponse([LINE_WAY, LOW_VOLTAGE_LINE]));

    const result = await getGridProximity({
      lat: 50.1,
      lon: 1.1,
      voltage_min_kv: 33,
    });

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].voltage_kv).toBe(400);
  });

  it("computes summary with nearest distances", async () => {
    fetchMock.mockResolvedValueOnce(makeOverpassResponse([SUBSTATION_NODE, LINE_WAY]));

    const result = await getGridProximity({ lat: 50.2, lon: 1.2 });

    expect(result.summary.nearest_substation_km).toBeGreaterThan(0);
    expect(result.summary.nearest_line_km).toBeGreaterThan(0);
    expect(result.summary.max_nearby_voltage_kv).toBe(400);
  });

  it("handles empty Overpass response", async () => {
    fetchMock.mockResolvedValueOnce(makeOverpassResponse([]));

    const result = await getGridProximity({ lat: 50.3, lon: 1.3 });

    expect(result.substations).toHaveLength(0);
    expect(result.lines).toHaveLength(0);
    expect(result.summary.nearest_substation_km).toBeNull();
    expect(result.summary.nearest_line_km).toBeNull();
    expect(result.summary.max_nearby_voltage_kv).toBeNull();
  });

  it("rejects radius_km > 25", async () => {
    await expect(getGridProximity({ lat: 50.4, lon: 1.4, radius_km: 30 })).rejects.toThrow(
      "radius_km must be between 0 and 25",
    );
  });

  it("throws on non-retryable upstream API error", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Bad query",
    });

    await expect(getGridProximity({ lat: 50.5, lon: 1.5 })).rejects.toThrow(
      "Overpass API returned 400",
    );
  });

  it("falls back to a second endpoint after retryable upstream error", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 504,
        text: async () => "Gateway timeout",
      })
      .mockResolvedValueOnce(makeOverpassResponse([SUBSTATION_NODE]));

    const result = await getGridProximity({ lat: 50.55, lon: 1.55 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.substations).toHaveLength(1);
  });

  it("returns cached result on second call", async () => {
    fetchMock.mockResolvedValueOnce(makeOverpassResponse([SUBSTATION_NODE]));

    await getGridProximity({ lat: 50.6, lon: 1.6 });
    const second = await getGridProximity({ lat: 50.6, lon: 1.6 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.substations).toHaveLength(1);
  });

  it("uses default radius_km of 5 and voltage_min_kv of 33", async () => {
    fetchMock.mockResolvedValueOnce(makeOverpassResponse([]));

    const result = await getGridProximity({ lat: 50.7, lon: 1.7 });

    expect(result.radius_km).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = fetchMock.mock.calls[0][1]?.body as string;
    expect(decodeURIComponent(body)).toContain("around:5000");
  });
});
