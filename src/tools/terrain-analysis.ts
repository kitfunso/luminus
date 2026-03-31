import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const ELEVATION_URL = "https://api.open-meteo.com/v1/elevation";
const cache = new TtlCache();

/** Spacing between grid points in degrees (~30m at mid-latitudes). */
const GRID_STEP_DEG = 0.0003;

export const terrainAnalysisSchema = z.object({
  lat: z
    .number()
    .describe("Latitude (-90 to 90). WGS84."),
  lon: z
    .number()
    .describe("Longitude (-180 to 180). WGS84."),
});

interface TerrainResult {
  lat: number;
  lon: number;
  elevation_m: number;
  slope_deg: number;
  aspect_deg: number;
  aspect_cardinal: string;
  flatness_score: number;
  source: string;
}

/**
 * Convert aspect angle (radians, math convention) to cardinal direction.
 * 0° = North, 90° = East, 180° = South, 270° = West.
 */
function toCardinal(deg: number): string {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(deg / 45) % 8;
  return directions[index];
}

/**
 * Compute slope and aspect from a 3x3 elevation grid using Horn's method.
 *
 * Grid layout (row-major):
 *   NW  N  NE     [0] [1] [2]
 *    W  C   E     [3] [4] [5]
 *   SW  S  SE     [6] [7] [8]
 *
 * cellSize is the distance between adjacent cells in metres.
 */
function computeSlopeAspect(
  grid: number[],
  cellSizeM: number,
): { slope_deg: number; aspect_deg: number; aspect_cardinal: string; flatness_score: number } {
  const [nw, n, ne, w, , e, sw, s, se] = grid;

  // Horn's method partial derivatives
  const dzdx = ((ne + 2 * e + se) - (nw + 2 * w + sw)) / (8 * cellSizeM);
  const dzdy = ((nw + 2 * n + ne) - (sw + 2 * s + se)) / (8 * cellSizeM);

  const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
  const slopeDeg = slopeRad * (180 / Math.PI);

  let aspectDeg: number;
  if (dzdx === 0 && dzdy === 0) {
    aspectDeg = 0; // flat — aspect undefined, default to north
  } else {
    // atan2(-dzdy, -dzdx) gives angle from east; convert to compass bearing
    let aspectRad = Math.atan2(-dzdy, -dzdx);
    aspectDeg = aspectRad * (180 / Math.PI);
    // Convert from math angle (E=0, CCW) to compass (N=0, CW)
    aspectDeg = (90 - aspectDeg + 360) % 360;
  }

  // Flatness: 1.0 = perfectly flat, 0.0 = vertical (90° slope)
  const flatness = 1 - slopeDeg / 90;

  return {
    slope_deg: Math.round(slopeDeg * 100) / 100,
    aspect_deg: Math.round(aspectDeg * 100) / 100,
    aspect_cardinal: toCardinal(aspectDeg),
    flatness_score: Math.round(flatness * 100) / 100,
  };
}

/**
 * Approximate metres per degree of longitude at a given latitude.
 */
function metresPerDegreeLon(lat: number): number {
  return 111_320 * Math.cos(lat * (Math.PI / 180));
}

const METRES_PER_DEGREE_LAT = 111_320;

export async function getTerrainAnalysis(
  params: z.infer<typeof terrainAnalysisSchema>,
): Promise<TerrainResult> {
  const { lat, lon } = params;

  if (lat < -90 || lat > 90) throw new Error("Latitude must be between -90 and 90.");
  if (lon < -180 || lon > 180) throw new Error("Longitude must be between -180 and 180.");

  const cacheKey = `terrain:${lat}:${lon}`;
  const cached = cache.get<TerrainResult>(cacheKey);
  if (cached) return cached;

  // Build 3x3 grid coordinates around the target point.
  // Row order: north to south (dy: +1, 0, -1) so indices match
  // the NW/N/NE, W/C/E, SW/S/SE layout expected by computeSlopeAspect.
  const lats: number[] = [];
  const lons: number[] = [];
  for (let dy = 1; dy >= -1; dy--) {
    for (let dx = -1; dx <= 1; dx++) {
      lats.push(lat + dy * GRID_STEP_DEG);
      lons.push(lon + dx * GRID_STEP_DEG);
    }
  }

  const url = new URL(ELEVATION_URL);
  url.searchParams.set("latitude", lats.join(","));
  url.searchParams.set("longitude", lons.join(","));

  const response = await fetch(url.toString());

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Open-Meteo Elevation API returned ${response.status}: ${body.slice(0, 300)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();
  const elevations: number[] = json.elevation;

  if (!Array.isArray(elevations) || elevations.length !== 9) {
    throw new Error("Unexpected response from Open-Meteo Elevation API: expected 9 elevation values.");
  }

  const cellSizeM = GRID_STEP_DEG * METRES_PER_DEGREE_LAT;
  const { slope_deg, aspect_deg, aspect_cardinal, flatness_score } = computeSlopeAspect(elevations, cellSizeM);

  const result: TerrainResult = {
    lat,
    lon,
    elevation_m: elevations[4], // centre point
    slope_deg,
    aspect_deg,
    aspect_cardinal,
    flatness_score,
    source: "open-meteo-elevation",
  };

  cache.set(cacheKey, result, TTL.STATIC_DATA);
  return result;
}
