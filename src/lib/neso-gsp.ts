import JSZip from "jszip";
import { TtlCache, TTL } from "./cache.js";

const cache = new TtlCache();

const NESO_GSP_CSV_URL =
  "https://api.neso.energy/dataset/2810092e-d4b2-472f-b955-d8bea01f9ec0/resource/bbe2cc72-a6c6-46e6-8f4e-48b879467368/download/gsp_gnode_directconnect_region_lookup.csv";
const NESO_GSP_BOUNDARIES_URL =
  "https://api.neso.energy/dataset/2810092e-d4b2-472f-b955-d8bea01f9ec0/resource/c5647312-afab-4a58-8158-2f1efed1d7fc/download/gsp_regions_20251204.zip";

const CSV_CACHE_KEY = "neso-gsp-lookup:csv";
const BOUNDARY_CACHE_KEY = "neso-gsp-lookup:boundaries";
const DEFAULT_RADIUS_KM = 50;

export interface GspRegion {
  gsp_id: string;
  gsp_name: string;
  region_id: string;
  region_name: string;
}

interface GspRecord extends GspRegion {
  lat: number;
  lon: number;
}

type Coordinate = [number, number];
type Ring = Coordinate[];
type Polygon = Ring[];

interface GspBoundary {
  gsp_codes: string[];
  polygons: Polygon[];
}

interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features?: GeoJsonFeature[];
}

interface GeoJsonFeature {
  type: "Feature";
  properties?: Record<string, unknown>;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  } | null;
}

/** Haversine distance in km between two WGS84 points. */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeGspCode(value: string): string {
  return value.trim().toUpperCase();
}

function isCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function isRing(value: unknown): value is Ring {
  return Array.isArray(value) && value.length >= 4 && value.every(isCoordinate);
}

function isPolygon(value: unknown): value is Polygon {
  return Array.isArray(value) && value.length > 0 && value.every(isRing);
}

function parsePolygons(geometry: GeoJsonFeature["geometry"]): Polygon[] {
  if (!geometry?.type || !geometry.coordinates) return [];

  if (geometry.type === "Polygon" && isPolygon(geometry.coordinates)) {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.filter(isPolygon);
  }

  return [];
}

/**
 * Parse the NESO GSP-Gnode lookup CSV into structured records.
 * Expects columns including: gsp_id, gsp_name, gsp_lat, gsp_lon, region_id, region_name.
 * Column order is detected from the header row.
 */
function parseCsv(csvText: string): GspRecord[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  const colIndex = (name: string): number => {
    const idx = headers.indexOf(name);
    return idx;
  };

  const iGspId = colIndex("gsp_id");
  const iGspName = colIndex("gsp_name");
  const iGspLat = colIndex("gsp_lat");
  const iGspLon = colIndex("gsp_lon");
  const iRegionId = colIndex("region_id");
  const iRegionName = colIndex("region_name");

  if (iGspId === -1 || iGspName === -1 || iGspLat === -1 || iGspLon === -1) {
    throw new Error(
      "NESO GSP CSV missing required columns. Expected: gsp_id, gsp_name, gsp_lat, gsp_lon. " +
        `Found headers: ${headers.join(", ")}`,
    );
  }

  const records: GspRecord[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const gspId = cols[iGspId] ?? "";
    const gspName = cols[iGspName] ?? "";
    const lat = parseFloat(cols[iGspLat] ?? "");
    const lon = parseFloat(cols[iGspLon] ?? "");

    if (!gspId || Number.isNaN(lat) || Number.isNaN(lon)) continue;

    if (seen.has(gspId)) continue;
    seen.add(gspId);

    records.push({
      gsp_id: gspId,
      gsp_name: gspName,
      lat,
      lon,
      region_id: iRegionId !== -1 ? (cols[iRegionId] ?? "") : "",
      region_name: iRegionName !== -1 ? (cols[iRegionName] ?? "") : "",
    });
  }

  return records;
}

function parseBoundaryFeatureCollection(rawText: string): GspBoundary[] {
  const parsed = JSON.parse(rawText) as GeoJsonFeatureCollection;
  const features = parsed.features ?? [];

  return features
    .map((feature) => {
      const gspCodes = String(feature.properties?.GSPs ?? "")
        .split("|")
        .map(normalizeGspCode)
        .filter(Boolean);
      const polygons = parsePolygons(feature.geometry);

      if (gspCodes.length === 0 || polygons.length === 0) {
        return null;
      }

      return {
        gsp_codes: gspCodes,
        polygons,
      } satisfies GspBoundary;
    })
    .filter((value): value is GspBoundary => value !== null);
}

function pointOnSegment(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  const cross = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1);
  if (Math.abs(cross) > 1e-9) return false;

  const dot = (x - x1) * (x2 - x1) + (y - y1) * (y2 - y1);
  if (dot < 0) return false;

  const squaredLength = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  return dot <= squaredLength;
}

function pointInRing(lat: number, lon: number, ring: Ring): boolean {
  let inside = false;
  const x = lon;
  const y = lat;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    if (pointOnSegment(x, y, xi, yi, xj, yj)) {
      return true;
    }

    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInPolygon(lat: number, lon: number, polygon: Polygon): boolean {
  if (!pointInRing(lat, lon, polygon[0])) return false;

  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(lat, lon, polygon[i])) {
      return false;
    }
  }

  return true;
}

function findContainingBoundary(
  boundaries: GspBoundary[],
  lat: number,
  lon: number,
): GspBoundary | null {
  for (const boundary of boundaries) {
    if (boundary.polygons.some((polygon) => pointInPolygon(lat, lon, polygon))) {
      return boundary;
    }
  }

  return null;
}

async function fetchGspRecords(): Promise<GspRecord[]> {
  const cached = cache.get<GspRecord[]>(CSV_CACHE_KEY);
  if (cached) return cached;

  const response = await fetch(NESO_GSP_CSV_URL);
  if (!response.ok) {
    throw new Error(`NESO GSP lookup CSV fetch failed: HTTP ${response.status}`);
  }

  const csvText = await response.text();
  const records = parseCsv(csvText);

  if (records.length === 0) {
    throw new Error("NESO GSP lookup CSV returned no valid records");
  }

  cache.set(CSV_CACHE_KEY, records, TTL.STATIC_DATA);
  return records;
}

async function readBoundaryGeoJsonFromZip(): Promise<string> {
  const response = await fetch(NESO_GSP_BOUNDARIES_URL);
  if (!response.ok) {
    throw new Error(`NESO GSP boundary ZIP fetch failed: HTTP ${response.status}`);
  }

  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const geoJsonFile = Object.values(zip.files).find(
    (file) => !file.dir && file.name.toLowerCase().endsWith(".geojson"),
  );

  if (!geoJsonFile) {
    throw new Error("NESO GSP boundary ZIP did not contain a GeoJSON file");
  }

  return geoJsonFile.async("text");
}

async function fetchGspBoundaries(): Promise<GspBoundary[]> {
  const cached = cache.get<GspBoundary[]>(BOUNDARY_CACHE_KEY);
  if (cached) return cached;

  try {
    const geoJsonText = await readBoundaryGeoJsonFromZip();
    const boundaries = parseBoundaryFeatureCollection(geoJsonText);
    cache.set(BOUNDARY_CACHE_KEY, boundaries, TTL.STATIC_DATA);
    return boundaries;
  } catch {
    return [];
  }
}

function findNearestRecord(
  records: GspRecord[],
  lat: number,
  lon: number,
): { record: GspRecord; distanceKm: number } | null {
  let nearest: GspRecord | null = null;
  let nearestDist = Infinity;

  for (const record of records) {
    const dist = haversineKm(lat, lon, record.lat, record.lon);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = record;
    }
  }

  return nearest ? { record: nearest, distanceKm: nearestDist } : null;
}

function findContainedRecord(
  records: GspRecord[],
  boundaries: GspBoundary[],
  lat: number,
  lon: number,
): { record: GspRecord; distanceKm: number } | null {
  const boundary = findContainingBoundary(boundaries, lat, lon);
  if (!boundary) return null;

  const recordByCode = new Map(
    records.map((record) => [normalizeGspCode(record.gsp_name), record]),
  );
  const candidates = boundary.gsp_codes
    .map((code) => recordByCode.get(code))
    .filter((record): record is GspRecord => record !== undefined);

  if (candidates.length === 0) return null;

  let bestRecord = candidates[0];
  let bestDistance = haversineKm(lat, lon, bestRecord.lat, bestRecord.lon);

  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i];
    const candidateDistance = haversineKm(lat, lon, candidate.lat, candidate.lon);
    if (candidateDistance < bestDistance) {
      bestRecord = candidate;
      bestDistance = candidateDistance;
    }
  }

  return { record: bestRecord, distanceKm: bestDistance };
}

function toLookupResult(
  match: { record: GspRecord; distanceKm: number },
  radiusKm: number,
): GspLookupResult | null {
  if (match.distanceKm > radiusKm) {
    return null;
  }

  return {
    gsp_id: match.record.gsp_id,
    gsp_name: match.record.gsp_name,
    region_id: match.record.region_id,
    region_name: match.record.region_name,
    distance_km: Math.round(match.distanceKm * 100) / 100,
  };
}

export interface GspLookupResult extends GspRegion {
  distance_km: number;
}

/**
 * Find the GSP region for a given lat/lon using polygon containment when available.
 * Falls back to the nearest GSP reference point within `radiusKm` (default 50).
 */
export async function lookupGspRegion(
  lat: number,
  lon: number,
  radiusKm: number = DEFAULT_RADIUS_KM,
): Promise<GspLookupResult | null> {
  const records = await fetchGspRecords();
  const boundaries = await fetchGspBoundaries();

  const contained = findContainedRecord(records, boundaries, lat, lon);
  if (contained) {
    return toLookupResult(contained, radiusKm);
  }

  const nearest = findNearestRecord(records, lat, lon);
  return nearest ? toLookupResult(nearest, radiusKm) : null;
}

/** Reset cache — exposed for tests. */
export function resetGspCacheForTests(): void {
  cache.clear();
}
