import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { COUNTRY_BBOXES } from "../lib/zone-codes.js";
import { fetchOverpassJson } from "../lib/overpass.js";

const cache = new TtlCache();

export const transmissionSchema = z.object({
  country: z
    .string()
    .optional()
    .describe(
      `Country code to look up bounding box. Available: ${Object.keys(COUNTRY_BBOXES).join(", ")}. ` +
        "Use this OR provide lat/lon bounds directly."
    ),
  lat_min: z.number().optional().describe("Southern latitude bound."),
  lon_min: z.number().optional().describe("Western longitude bound."),
  lat_max: z.number().optional().describe("Northern latitude bound."),
  lon_max: z.number().optional().describe("Eastern longitude bound."),
  min_voltage_kv: z
    .number()
    .optional()
    .describe("Minimum voltage in kV to filter lines. Defaults to 220 (high-voltage only)."),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of lines to return. Defaults to 100."),
});

interface TransmissionLine {
  id: number;
  voltage_kv: number;
  operator: string | null;
  cables: number | null;
  coordinates: Array<{ lat: number; lon: number }>;
}

type Bbox = [number, number, number, number]; // [lat_min, lon_min, lat_max, lon_max]

// ---------------------------------------------------------------------------
// Tiling helpers
// ---------------------------------------------------------------------------

/** Area threshold in square degrees above which we split into tiles. */
const TILE_AREA_THRESHOLD = 25;

/** Target tile size in degrees per side. */
const TILE_SIZE_DEG = 5;

/** Max concurrent tile queries to avoid Overpass rate limiting. */
const TILE_CONCURRENCY = 2;

/** Split a bbox into smaller tiles of approximately TILE_SIZE_DEG x TILE_SIZE_DEG. */
export function generateTiles(bbox: Bbox): Bbox[] {
  const [latMin, lonMin, latMax, lonMax] = bbox;
  const latRange = latMax - latMin;
  const lonRange = lonMax - lonMin;

  const latSteps = Math.ceil(latRange / TILE_SIZE_DEG);
  const lonSteps = Math.ceil(lonRange / TILE_SIZE_DEG);

  const latStep = latRange / latSteps;
  const lonStep = lonRange / lonSteps;

  const tiles: Bbox[] = [];
  for (let i = 0; i < latSteps; i++) {
    for (let j = 0; j < lonSteps; j++) {
      tiles.push([
        latMin + i * latStep,
        lonMin + j * lonStep,
        latMin + (i + 1) * latStep,
        lonMin + (j + 1) * lonStep,
      ]);
    }
  }
  return tiles;
}

/** Returns true if the bbox area exceeds the tiling threshold. */
function shouldTile(bbox: Bbox): boolean {
  const latRange = bbox[2] - bbox[0];
  const lonRange = bbox[3] - bbox[1];
  return latRange * lonRange > TILE_AREA_THRESHOLD;
}

interface OverpassElement {
  id: number;
  tags?: { voltage?: string; operator?: string; cables?: string };
  geometry?: Array<{ lat: number; lon: number }>;
}

/** Query a single bbox tile and return raw Overpass elements. */
async function queryTile(bbox: Bbox): Promise<OverpassElement[]> {
  const bboxStr = `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`;
  const query = `[out:json][timeout:30];way["power"="line"]["voltage"](${bboxStr});out geom;`;
  const json = await fetchOverpassJson<{ elements?: OverpassElement[] }>(query);
  return Array.isArray(json.elements) ? json.elements : [];
}

/**
 * Query multiple tiles with bounded concurrency.
 * Runs at most `concurrency` queries in parallel.
 */
async function queryTilesWithConcurrency(
  tiles: Bbox[],
  concurrency: number,
): Promise<OverpassElement[]> {
  const allElements: OverpassElement[] = [];
  const remaining = [...tiles];

  while (remaining.length > 0) {
    const batch = remaining.splice(0, concurrency);
    const results = await Promise.all(batch.map(queryTile));
    for (const elements of results) {
      allElements.push(...elements);
    }
  }

  return allElements;
}

/** Parse raw Overpass elements into TransmissionLine[], filtering by voltage. */
function parseElements(
  elements: OverpassElement[],
  minVoltageV: number,
): TransmissionLine[] {
  const lines: TransmissionLine[] = [];

  for (const el of elements) {
    const voltageStr = el.tags?.voltage ?? "0";
    const voltageV = Number(voltageStr.split(";")[0]);
    if (voltageV < minVoltageV) continue;

    const coords = Array.isArray(el.geometry)
      ? el.geometry.map((g) => ({ lat: g.lat, lon: g.lon }))
      : [];

    lines.push({
      id: el.id,
      voltage_kv: Math.round(voltageV / 1000),
      operator: el.tags?.operator ?? null,
      cables: el.tags?.cables ? Number(el.tags.cables) : null,
      coordinates: coords,
    });
  }

  return lines;
}

/** Deduplicate lines by OSM way ID (tiles may overlap at boundaries). */
function deduplicateById(lines: TransmissionLine[]): TransmissionLine[] {
  const seen = new Map<number, TransmissionLine>();
  for (const line of lines) {
    if (!seen.has(line.id)) {
      seen.set(line.id, line);
    }
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getTransmissionLines(
  params: z.infer<typeof transmissionSchema>,
): Promise<{
  bbox: Bbox;
  line_count: number;
  lines: TransmissionLine[];
}> {
  let bbox: Bbox;

  if (params.country) {
    const upper = params.country.toUpperCase();
    const countryBbox = COUNTRY_BBOXES[upper];
    if (!countryBbox) {
      throw new Error(
        `No bounding box for "${upper}". Available: ${Object.keys(COUNTRY_BBOXES).join(", ")}`,
      );
    }
    bbox = countryBbox;
  } else if (
    params.lat_min != null &&
    params.lon_min != null &&
    params.lat_max != null &&
    params.lon_max != null
  ) {
    bbox = [params.lat_min, params.lon_min, params.lat_max, params.lon_max];
  } else {
    throw new Error("Provide either 'country' or all four bounding box parameters.");
  }

  const minVoltageV = (params.min_voltage_kv ?? 220) * 1000;
  const maxResults = params.limit ?? 100;

  const cacheKey = `overpass:${bbox.join(",")}:${minVoltageV}:${maxResults}`;
  const cached = cache.get<{ bbox: Bbox; line_count: number; lines: TransmissionLine[] }>(cacheKey);
  if (cached) return cached;

  let rawElements: OverpassElement[];

  if (shouldTile(bbox)) {
    const tiles = generateTiles(bbox);
    rawElements = await queryTilesWithConcurrency(tiles, TILE_CONCURRENCY);
  } else {
    rawElements = await queryTile(bbox);
  }

  let lines = parseElements(rawElements, minVoltageV);
  lines = deduplicateById(lines);
  lines.sort((a, b) => b.voltage_kv - a.voltage_kv);
  lines = lines.slice(0, maxResults);

  const result = { bbox, line_count: lines.length, lines };
  cache.set(cacheKey, result, TTL.STATIC_DATA);
  return result;
}
