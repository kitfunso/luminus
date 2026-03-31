import { TtlCache, TTL } from "./cache.js";

const cache = new TtlCache();

const NESO_GSP_CSV_URL =
  "https://api.neso.energy/dataset/2810092e-d4b2-472f-b955-d8bea01f9ec0/resource/bbe2cc72-a6c6-46e6-8f4e-48b879467368/download/gsp_gnode_directconnect_region_lookup.csv";

const CACHE_KEY = "neso-gsp-lookup:csv";
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

    // Deduplicate by gsp_id (multiple gnodes can map to the same GSP)
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

async function fetchGspRecords(): Promise<GspRecord[]> {
  const cached = cache.get<GspRecord[]>(CACHE_KEY);
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

  cache.set(CACHE_KEY, records, TTL.STATIC_DATA);
  return records;
}

export interface GspLookupResult extends GspRegion {
  distance_km: number;
}

/**
 * Find the nearest GSP to a given lat/lon using haversine distance.
 * Returns the nearest GSP within `radiusKm` (default 50), or null if none found.
 *
 * This is a nearest-GSP approximation, not polygon containment.
 */
export async function lookupGspRegion(
  lat: number,
  lon: number,
  radiusKm: number = DEFAULT_RADIUS_KM,
): Promise<GspLookupResult | null> {
  const records = await fetchGspRecords();

  let nearest: GspRecord | null = null;
  let nearestDist = Infinity;

  for (const record of records) {
    const dist = haversineKm(lat, lon, record.lat, record.lon);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = record;
    }
  }

  if (!nearest || nearestDist > radiusKm) {
    return null;
  }

  return {
    gsp_id: nearest.gsp_id,
    gsp_name: nearest.gsp_name,
    region_id: nearest.region_id,
    region_name: nearest.region_name,
    distance_km: Math.round(nearestDist * 100) / 100,
  };
}

/** Reset cache — exposed for tests. */
export function resetGspCacheForTests(): void {
  cache.clear();
}
