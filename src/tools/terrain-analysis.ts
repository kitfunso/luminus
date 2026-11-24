import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";

const ELEVATION_URL = "https://api.open-meteo.com/v1/elevation";
const cache = new TtlCache();

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
  source_metadata: GisSourceMetadata;
}

function toCardinal(deg: number): string {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(deg / 45) % 8;
  return directions[index];
}

function computeSlopeAspect(
  grid: number[],
  cellSizeXM: number,
  cellSizeYM: number,
): { slope_deg: number; aspect_deg: number; aspect_cardinal: string; flatness_score: number } {
  const [nw, n, ne, w, , e, sw, s, se] = grid;

  const dzdx = ((ne + 2 * e + se) - (nw + 2 * w + sw)) / (8 * cellSizeXM);
  const dzdy = ((nw + 2 * n + ne) - (sw + 2 * s + se)) / (8 * cellSizeYM);

  const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
  const slopeDeg = slopeRad * (180 / Math.PI);

  let aspectDeg: number;
  if (dzdx === 0 && dzdy === 0) {
    aspectDeg = 0;
  } else {
    let aspectRad = Math.atan2(-dzdy, -dzdx);
    aspectDeg = aspectRad * (180 / Math.PI);
    aspectDeg = (90 - aspectDeg + 360) % 360;
  }

  const flatness = 1 - slopeDeg / 90;

  return {
    slope_deg: Math.round(slopeDeg * 100) / 100,
    aspect_deg: Math.round(aspectDeg * 100) / 100,
    aspect_cardinal: toCardinal(aspectDeg),
    flatness_score: Math.round(flatness * 100) / 100,
  };
}

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

  const cellSizeXM = GRID_STEP_DEG * metresPerDegreeLon(lat);
  const cellSizeYM = GRID_STEP_DEG * METRES_PER_DEGREE_LAT;
  const { slope_deg, aspect_deg, aspect_cardinal, flatness_score } = computeSlopeAspect(
    elevations,
    cellSizeXM,
    cellSizeYM,
  );

  const result: TerrainResult = {
    lat,
    lon,
    elevation_m: elevations[4], // centre point
    slope_deg,
    aspect_deg,
    aspect_cardinal,
    flatness_score,
    source: "open-meteo-elevation",
    source_metadata: GIS_SOURCES["open-meteo-elevation"],
  };

  cache.set(cacheKey, result, TTL.STATIC_DATA);
  return result;
}
