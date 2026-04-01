import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateTiles, getTransmissionLines } from "./transmission.js";
import { _resetOverpassState } from "../lib/overpass.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(data: unknown = { elements: [] }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    }),
  );
}

function makeElement(id: number, voltageV: number, operator?: string) {
  return {
    type: "way",
    id,
    tags: {
      power: "line",
      voltage: String(voltageV),
      ...(operator ? { operator } : {}),
    },
    geometry: [
      { lat: 50.0, lon: 8.0 },
      { lat: 50.1, lon: 8.1 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Unit: generateTiles
// ---------------------------------------------------------------------------

describe("generateTiles", () => {
  it("returns a single tile when bbox fits within TILE_SIZE_DEG", () => {
    const tiles = generateTiles([50, 8, 54, 12]);
    // 4x4 degrees => 1 lat step, 1 lon step => 1 tile
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toEqual([50, 8, 54, 12]);
  });

  it("splits a large bbox into multiple tiles", () => {
    // NO: 57.96,4.64 -> 71.19,31.07 => ~13.2 lat x ~26.4 lon
    const tiles = generateTiles([57.96, 4.64, 71.19, 31.07]);
    // latRange=13.23, lonRange=26.43
    // latSteps=ceil(13.23/5)=3, lonSteps=ceil(26.43/5)=6 => 18 tiles
    expect(tiles).toHaveLength(18);
  });

  it("tiles cover the full bbox without gaps", () => {
    const bbox: [number, number, number, number] = [36.0, -9.3, 43.79, 3.33];
    const tiles = generateTiles(bbox);

    // Verify coverage: min of all tile lat_mins = bbox lat_min, etc.
    const latMins = tiles.map((t) => t[0]);
    const lonMins = tiles.map((t) => t[1]);
    const latMaxs = tiles.map((t) => t[2]);
    const lonMaxs = tiles.map((t) => t[3]);

    expect(Math.min(...latMins)).toBeCloseTo(bbox[0], 5);
    expect(Math.min(...lonMins)).toBeCloseTo(bbox[1], 5);
    expect(Math.max(...latMaxs)).toBeCloseTo(bbox[2], 5);
    expect(Math.max(...lonMaxs)).toBeCloseTo(bbox[3], 5);
  });

  it("produces tiles of approximately equal size", () => {
    const tiles = generateTiles([47.27, 5.87, 55.06, 15.04]);
    for (const tile of tiles) {
      const latRange = tile[2] - tile[0];
      const lonRange = tile[3] - tile[1];
      expect(latRange).toBeLessThanOrEqual(5.01);
      expect(lonRange).toBeLessThanOrEqual(5.01);
    }
  });
});

// ---------------------------------------------------------------------------
// Integration: getTransmissionLines
// ---------------------------------------------------------------------------

describe("getTransmissionLines", () => {
  beforeEach(() => {
    _resetOverpassState();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("queries a small country without tiling", async () => {
    const elements = [makeElement(1, 380000), makeElement(2, 220000)];
    mockFetch({ elements });

    const result = await getTransmissionLines({ country: "BE" });

    // BE bbox area: ~2 * ~3.85 = ~7.7 sq deg => no tiling
    expect(result.line_count).toBe(2);
    expect(result.lines[0].voltage_kv).toBe(380);
    expect(result.lines[1].voltage_kv).toBe(220);

    // Single fetch call (no tiling)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("tiles large country queries and deduplicates by ID", async () => {
    // RO bbox area ~43.8 sq deg > 25, producing 2 tiles (fits within rate limit window)
    const sharedElement = makeElement(100, 400000, "Transelectrica");
    const uniqueElement = makeElement(200, 300000, "Transelectrica");

    // First tile returns both elements; second returns only the shared one.
    const fn = vi.fn();
    fn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ elements: [sharedElement, uniqueElement] }),
      text: () => Promise.resolve(""),
    });
    fn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ elements: [sharedElement] }),
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", fn);

    const result = await getTransmissionLines({ country: "RO" });

    // Should deduplicate: only 2 unique IDs (100 and 200)
    expect(result.lines.map((l) => l.id).sort()).toEqual([100, 200]);
    expect(result.line_count).toBe(2);

    // RO produces 2 tiles => 2 fetch calls
    expect(fn.mock.calls.length).toBe(2);
  });

  it("filters by min_voltage_kv", async () => {
    const elements = [
      makeElement(1, 380000),
      makeElement(2, 220000),
      makeElement(3, 110000),
    ];
    mockFetch({ elements });

    const result = await getTransmissionLines({
      country: "NL",
      min_voltage_kv: 300,
    });

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].voltage_kv).toBe(380);
  });

  it("respects the limit parameter on merged results", async () => {
    const elements = Array.from({ length: 50 }, (_, i) =>
      makeElement(i + 1, 380000),
    );
    mockFetch({ elements });

    const result = await getTransmissionLines({
      country: "NL",
      limit: 5,
    });

    expect(result.line_count).toBe(5);
    expect(result.lines).toHaveLength(5);
  });

  it("throws for unknown country", async () => {
    await expect(
      getTransmissionLines({ country: "XX" }),
    ).rejects.toThrow('No bounding box for "XX"');
  });

  it("throws when no country and incomplete bbox", async () => {
    await expect(
      getTransmissionLines({ lat_min: 50 }),
    ).rejects.toThrow("Provide either 'country' or all four bounding box parameters.");
  });

  it("uses manual bbox without tiling when area is small", async () => {
    mockFetch({ elements: [makeElement(1, 220000)] });

    const result = await getTransmissionLines({
      lat_min: 50,
      lon_min: 8,
      lat_max: 51,
      lon_max: 9,
    });

    expect(result.bbox).toEqual([50, 8, 51, 9]);
    expect(result.line_count).toBe(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
