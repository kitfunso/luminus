import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";

const cache = new TtlCache();

const SSEN_PACKAGE_SHOW_URL =
  "https://data-api.ssen.co.uk/api/3/action/package_show?id=generation-availability-and-network-capacity";
const CACHE_KEY = "ssen-distribution-headroom:all";
const DEFAULT_RADIUS_KM = 25;
const DEFAULT_LIMIT = 5;

export const distributionHeadroomSchema = z.object({
  lat: z.number().describe("Latitude (-90 to 90). WGS84."),
  lon: z.number().describe("Longitude (-180 to 180). WGS84."),
  operator: z.string().describe('Distribution operator. Currently only "SSEN" is supported.'),
  radius_km: z
    .number()
    .optional()
    .describe("Search radius in km (default 25, max 50)."),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of nearby SSEN sites to return (default 5, max 10)."),
});

interface SsenResource {
  name?: string;
  format?: string;
  url?: string;
  last_modified?: string;
  created?: string;
}

interface SsenHeadroomRecord {
  asset_id: string;
  licence_area: string;
  substation: string;
  upstream_gsp: string | null;
  upstream_bsp: string | null;
  substation_type: string | null;
  voltage_kv: string | null;
  lat: number;
  lon: number;
  estimated_demand_headroom_mva: number | null;
  demand_rag_status: string | null;
  demand_constraint: string | null;
  connected_generation_mw: number | null;
  contracted_generation_mw: number | null;
  estimated_generation_headroom_mw: number | null;
  generation_rag_status: string | null;
  generation_constraint: string | null;
  upstream_reinforcement_works: string | null;
  upstream_reinforcement_completion_date: string | null;
  substation_reinforcement_works: string | null;
  substation_reinforcement_completion_date: string | null;
}

interface DistributionHeadroomSite {
  asset_id: string;
  licence_area: string;
  substation: string;
  substation_type: string | null;
  voltage_kv: string | null;
  upstream_gsp: string | null;
  upstream_bsp: string | null;
  distance_km: number;
  estimated_demand_headroom_mva: number | null;
  demand_rag_status: string | null;
  demand_constraint: string | null;
  connected_generation_mw: number | null;
  contracted_generation_mw: number | null;
  estimated_generation_headroom_mw: number | null;
  generation_rag_status: string | null;
  generation_constraint: string | null;
  upstream_reinforcement_works: string | null;
  upstream_reinforcement_completion_date: string | null;
  substation_reinforcement_works: string | null;
  substation_reinforcement_completion_date: string | null;
}

interface DistributionHeadroomResult {
  lat: number;
  lon: number;
  operator: string;
  radius_km: number;
  nearest_site: DistributionHeadroomSite | null;
  matches: DistributionHeadroomSite[];
  confidence_notes: string[];
  source_metadata: GisSourceMetadata;
  disclaimer: string;
}

const DISCLAIMER =
  "This uses SSEN's public distribution headroom dashboard data as a planning signal for SSEN licence areas only. " +
  "It is not a connection offer, a firm capacity reservation, or a substitute for a formal DNO application.";

export function resetDistributionHeadroomCacheForTests(): void {
  cache.clear();
}

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

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];

    if (char === '"') {
      if (inQuotes && csv[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(current.trim());
      current = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && csv[i + 1] === "\n") {
        i++;
      }
      row.push(current.trim());
      current = "";
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current.trim());
    if (row.some((value) => value.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function parseNumber(value: string | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed === "N/A" || trimmed === "No") return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseText(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseHeadroomCsv(csv: string): SsenHeadroomRecord[] {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) return [];

  const headerRow = rows[0][0]?.toLowerCase().startsWith("sep=") ? rows[1] : rows[0];
  const dataRows = rows[0][0]?.toLowerCase().startsWith("sep=") ? rows.slice(2) : rows.slice(1);
  const headers = headerRow.map((value) => value.trim());
  const indexOf = (name: string) => headers.indexOf(name);

  const required = [
    "AssetID",
    "Map / License Area",
    "Substation",
    "Location Latitude",
    "Location Longitude",
  ];

  for (const field of required) {
    if (indexOf(field) === -1) {
      throw new Error(`SSEN headroom CSV missing required column: ${field}`);
    }
  }

  const records: SsenHeadroomRecord[] = [];

  for (const values of dataRows) {
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = values[i] ?? "";
    }

    const lat = parseNumber(row["Location Latitude"]);
    const lon = parseNumber(row["Location Longitude"]);
    const assetId = row.AssetID?.trim() ?? "";
    const substation = row.Substation?.trim() ?? "";

    if (!assetId || !substation || lat === null || lon === null) {
      continue;
    }

    records.push({
      asset_id: assetId,
      licence_area: row["Map / License Area"]?.trim() ?? "Unknown area",
      substation,
      upstream_gsp: parseText(row["Upstream GSP"]),
      upstream_bsp: parseText(row["Upstream BSP"]),
      substation_type: parseText(row["Substation Type"]),
      voltage_kv: parseText(row["Voltage (kV)"]),
      lat,
      lon,
      estimated_demand_headroom_mva: parseNumber(row["Estimated Demand Headroom (MVA)"]),
      demand_rag_status: parseText(row["Substation Demand RAG Status"]),
      demand_constraint: parseText(row["Demand Constraint"]),
      connected_generation_mw: parseNumber(row["Connected Generation (MW)"]),
      contracted_generation_mw: parseNumber(row["Contracted Generation (MW)"]),
      estimated_generation_headroom_mw: parseNumber(row["Estimated Generation Headroom (MW)"]),
      generation_rag_status: parseText(row["Substation Generation RAG Status"]),
      generation_constraint: parseText(row["Generation Constraint"]),
      upstream_reinforcement_works: parseText(row["Upstream Reinforcement Works"]),
      upstream_reinforcement_completion_date: parseText(row["Upstream Reinforcement Completion Date"]),
      substation_reinforcement_works: parseText(row["Substation Reinforcement Works"]),
      substation_reinforcement_completion_date: parseText(row["Substation Reinforcement Completion Date"]),
    });
  }

  return records;
}

async function resolveHeadroomCsvUrl(): Promise<string> {
  const response = await fetch(SSEN_PACKAGE_SHOW_URL);
  if (!response.ok) {
    throw new Error(`SSEN package lookup failed: HTTP ${response.status}`);
  }

  const json = await response.json() as {
    success?: boolean;
    result?: { resources?: SsenResource[] };
  };

  const resources = Array.isArray(json.result?.resources) ? json.result.resources : [];
  const candidates = resources
    .filter((resource) =>
      resource.format?.toUpperCase() === "CSV" &&
      resource.name?.startsWith("Headroom Dashboard Data"),
    )
    .sort((a, b) =>
      String(b.last_modified ?? b.created ?? "").localeCompare(
        String(a.last_modified ?? a.created ?? ""),
      ),
    );

  const url = candidates[0]?.url;
  if (!url) {
    throw new Error("SSEN package metadata did not include a headroom CSV resource");
  }

  return url;
}

async function fetchHeadroomRecords(): Promise<SsenHeadroomRecord[]> {
  const cached = cache.get<SsenHeadroomRecord[]>(CACHE_KEY);
  if (cached) return cached;

  const csvUrl = await resolveHeadroomCsvUrl();
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`SSEN headroom CSV fetch failed: HTTP ${response.status}`);
  }

  const records = parseHeadroomCsv(await response.text());
  if (records.length === 0) {
    throw new Error("SSEN headroom CSV returned no valid records");
  }

  cache.set(CACHE_KEY, records, TTL.STATIC_DATA);
  return records;
}

function toHeadroomSite(
  record: SsenHeadroomRecord,
  distanceKm: number,
): DistributionHeadroomSite {
  return {
    asset_id: record.asset_id,
    licence_area: record.licence_area,
    substation: record.substation,
    substation_type: record.substation_type,
    voltage_kv: record.voltage_kv,
    upstream_gsp: record.upstream_gsp,
    upstream_bsp: record.upstream_bsp,
    distance_km: Math.round(distanceKm * 100) / 100,
    estimated_demand_headroom_mva: record.estimated_demand_headroom_mva,
    demand_rag_status: record.demand_rag_status,
    demand_constraint: record.demand_constraint,
    connected_generation_mw: record.connected_generation_mw,
    contracted_generation_mw: record.contracted_generation_mw,
    estimated_generation_headroom_mw: record.estimated_generation_headroom_mw,
    generation_rag_status: record.generation_rag_status,
    generation_constraint: record.generation_constraint,
    upstream_reinforcement_works: record.upstream_reinforcement_works,
    upstream_reinforcement_completion_date: record.upstream_reinforcement_completion_date,
    substation_reinforcement_works: record.substation_reinforcement_works,
    substation_reinforcement_completion_date: record.substation_reinforcement_completion_date,
  };
}

export async function getDistributionHeadroom(
  params: z.infer<typeof distributionHeadroomSchema>,
): Promise<DistributionHeadroomResult> {
  const operator = params.operator.trim().toUpperCase();
  const radiusKm = params.radius_km ?? DEFAULT_RADIUS_KM;
  const limit = params.limit ?? DEFAULT_LIMIT;

  if (operator !== "SSEN") {
    throw new Error('Only operator "SSEN" is currently supported.');
  }
  if (params.lat < -90 || params.lat > 90) throw new Error("Latitude must be between -90 and 90.");
  if (params.lon < -180 || params.lon > 180) throw new Error("Longitude must be between -180 and 180.");
  if (radiusKm <= 0 || radiusKm > 50) throw new Error("radius_km must be between 0 and 50.");
  if (limit <= 0 || limit > 10) throw new Error("limit must be between 1 and 10.");

  const records = await fetchHeadroomRecords();
  const matches = records
    .map((record) => ({
      record,
      distanceKm: haversineKm(params.lat, params.lon, record.lat, record.lon),
    }))
    .filter((match) => match.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit)
    .map((match) => toHeadroomSite(match.record, match.distanceKm));

  const confidenceNotes = [
    "Uses SSEN public headroom dashboard data only; UKPN and NGED are not currently covered by this tool",
    "Headroom values are planning signals, not firm connection rights or a formal offer",
    "Nearest-site matching is distance-based and does not infer SSEN licence-area boundaries outside the published site list",
  ];

  if (matches.length === 0) {
    confidenceNotes.push("No SSEN headroom site found within search radius");
  }

  return {
    lat: params.lat,
    lon: params.lon,
    operator,
    radius_km: radiusKm,
    nearest_site: matches[0] ?? null,
    matches,
    confidence_notes: confidenceNotes,
    source_metadata: GIS_SOURCES["ssen-distribution-headroom"],
    disclaimer: DISCLAIMER,
  };
}
