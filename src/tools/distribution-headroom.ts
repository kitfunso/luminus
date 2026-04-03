import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";
import { guardJsonFields } from "../lib/schema-guard.js";

const cache = new TtlCache();

const SSEN_PACKAGE_SHOW_URL =
  "https://data-api.ssen.co.uk/api/3/action/package_show?id=generation-availability-and-network-capacity";
const NPG_DATASET_URL =
  "https://northernpowergrid.opendatasoft.com/api/explore/v2.1/catalog/datasets/heatmapsubstationareas/records";
const SSEN_CACHE_KEY = "ssen-distribution-headroom:all";
const NPG_CACHE_KEY = "npg-distribution-headroom:all";
const DEFAULT_RADIUS_KM = 25;
const DEFAULT_LIMIT = 5;
const NPG_PAGE_LIMIT = 100;
const NPG_SELECT_FIELDS = [
  "name",
  "type",
  "pvoltage",
  "genhr",
  "demhr",
  "gentot",
  "genconstraint",
  "demconstraint",
  "upstreamname",
  "gsp_name",
  "substation_location",
  "worst_case_constraint_gen_colour",
  "worst_case_constraint_dem_colour",
].join(",");

export const distributionHeadroomSchema = z.object({
  lat: z.number().describe("Latitude (-90 to 90). WGS84."),
  lon: z.number().describe("Longitude (-180 to 180). WGS84."),
  operator: z
    .string()
    .describe('Distribution operator. Currently "SSEN" and "NPG" are supported.'),
  radius_km: z
    .number()
    .optional()
    .describe("Search radius in km (default 25, max 50)."),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of nearby published sites to return (default 5, max 10)."),
});

interface SsenResource {
  name?: string;
  format?: string;
  url?: string;
  last_modified?: string;
  created?: string;
}

interface DistributionHeadroomRecord {
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

interface NpgHeadroomRawRecord {
  name?: string;
  type?: string;
  pvoltage?: number | string | null;
  genhr?: number | string | null;
  demhr?: number | string | null;
  gentot?: number | string | null;
  genconstraint?: string[] | string | null;
  demconstraint?: string[] | string | null;
  upstreamname?: string | null;
  gsp_name?: string | null;
  worst_case_constraint_gen_colour?: string | null;
  worst_case_constraint_dem_colour?: string | null;
  substation_location?: {
    lat?: number | null;
    lon?: number | null;
  } | null;
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

function parseTextOrList(value: string[] | string | null | undefined): string | null {
  if (Array.isArray(value)) {
    const values = value.map((item) => String(item).trim()).filter(Boolean);
    return values.length > 0 ? values.join("; ") : null;
  }

  return parseText(typeof value === "string" ? value : undefined);
}

function parseNumericValue(value: number | string | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  return parseNumber(typeof value === "string" ? value : undefined);
}

function parseHeadroomCsv(csv: string): DistributionHeadroomRecord[] {
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

  const records: DistributionHeadroomRecord[] = [];

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

async function fetchHeadroomRecords(): Promise<DistributionHeadroomRecord[]> {
  const cached = cache.get<DistributionHeadroomRecord[]>(SSEN_CACHE_KEY);
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

  cache.set(SSEN_CACHE_KEY, records, TTL.STATIC_DATA);
  return records;
}

function toHeadroomSite(
  record: DistributionHeadroomRecord,
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

function normalizeOperator(operator: string): "SSEN" | "NPG" | null {
  const normalized = operator.trim().toUpperCase();

  if (normalized === "SSEN") return "SSEN";
  if (normalized === "NPG" || normalized === "NORTHERN POWERGRID" || normalized === "NORTHERN_POWERGRID") {
    return "NPG";
  }

  return null;
}

async function fetchNpgHeadroomRecords(): Promise<DistributionHeadroomRecord[]> {
  const cached = cache.get<DistributionHeadroomRecord[]>(NPG_CACHE_KEY);
  if (cached) return cached;

  const records: DistributionHeadroomRecord[] = [];

  for (let offset = 0; ; offset += NPG_PAGE_LIMIT) {
    const params = new URLSearchParams({
      limit: String(NPG_PAGE_LIMIT),
      offset: String(offset),
      select: NPG_SELECT_FIELDS,
    });
    const response = await fetch(`${NPG_DATASET_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`NPG heat map dataset fetch failed: HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
      results?: NpgHeadroomRawRecord[];
    };

    const page = Array.isArray(json.results) ? json.results : [];
    if (page.length === 0) break;

    guardJsonFields(
      page[0] as unknown as Record<string, unknown>,
      [
        "name",
        "type",
        "pvoltage",
        "genhr",
        "demhr",
        "gsp_name",
        "substation_location",
      ],
      "Northern Powergrid Heat Map Data - Substation Areas",
    );

    for (const row of page) {
      const substation = parseText(row.name ?? undefined);
      const substationType = parseText(row.type ?? undefined);
      const lat = row.substation_location?.lat ?? null;
      const lon = row.substation_location?.lon ?? null;

      if (!substation || lat === null || lon === null) {
        continue;
      }

      records.push({
        asset_id: `NPG:${substationType ?? "Unknown"}:${substation}`,
        licence_area: "Northern Powergrid",
        substation,
        upstream_gsp: parseText(row.gsp_name ?? undefined),
        upstream_bsp: parseText(row.upstreamname ?? undefined),
        substation_type: substationType,
        voltage_kv: row.pvoltage === null || row.pvoltage === undefined ? null : String(row.pvoltage),
        lat,
        lon,
        estimated_demand_headroom_mva: parseNumericValue(row.demhr),
        demand_rag_status: parseText(row.worst_case_constraint_dem_colour ?? undefined),
        demand_constraint: parseTextOrList(row.demconstraint),
        connected_generation_mw: null,
        contracted_generation_mw: parseNumericValue(row.gentot),
        estimated_generation_headroom_mw: parseNumericValue(row.genhr),
        generation_rag_status: parseText(row.worst_case_constraint_gen_colour ?? undefined),
        generation_constraint: parseTextOrList(row.genconstraint),
        upstream_reinforcement_works: null,
        upstream_reinforcement_completion_date: null,
        substation_reinforcement_works: null,
        substation_reinforcement_completion_date: null,
      });
    }

    if (page.length < NPG_PAGE_LIMIT) break;
  }

  if (records.length === 0) {
    throw new Error("NPG heat map dataset returned no valid records");
  }

  cache.set(NPG_CACHE_KEY, records, TTL.STATIC_DATA);
  return records;
}

function buildConfidenceNotes(
  operator: "SSEN" | "NPG",
  matchesFound: boolean,
): string[] {
  if (operator === "SSEN") {
    const notes = [
      "Uses SSEN public headroom dashboard data only; UKPN and other DNOs are not inferred by this source",
      "Headroom values are planning signals, not firm connection rights or a formal offer",
      "Nearest-site matching is distance-based and does not infer SSEN licence-area boundaries outside the published site list",
    ];

    if (!matchesFound) {
      notes.push("No SSEN headroom site found within search radius");
    }

    return notes;
  }

  const notes = [
    "Uses Northern Powergrid's public Heat Map Data - Substation Areas dataset only; it does not infer UKPN, SPEN, or ENWL coverage",
    "NPG generation headroom is published in MW and demand headroom in MVA as planning signals, not firm connection rights or a formal offer",
    "Nearest-site matching is distance-based to the published NPG site location; the dataset's service-area polygons are not yet used by this tool",
  ];

  if (!matchesFound) {
    notes.push("No NPG headroom site found within search radius");
  }

  return notes;
}

function getSourceMetadata(operator: "SSEN" | "NPG"): GisSourceMetadata {
  return operator === "SSEN"
    ? GIS_SOURCES["ssen-distribution-headroom"]
    : GIS_SOURCES["npg-heatmap-substation-areas"];
}

function getDisclaimer(operator: "SSEN" | "NPG"): string {
  if (operator === "SSEN") {
    return (
      "This uses SSEN's public distribution headroom dashboard data as a planning signal for SSEN licence areas only. " +
      "It is not a connection offer, a firm capacity reservation, or a substitute for a formal DNO application."
    );
  }

  return (
    "This uses Northern Powergrid's public Heat Map Data - Substation Areas dataset as a planning signal for Northern Powergrid licence areas only. " +
    "It is not a connection offer, a firm capacity reservation, or a substitute for a formal DNO application."
  );
}

export async function getDistributionHeadroom(
  params: z.infer<typeof distributionHeadroomSchema>,
): Promise<DistributionHeadroomResult> {
  const operator = normalizeOperator(params.operator);
  const radiusKm = params.radius_km ?? DEFAULT_RADIUS_KM;
  const limit = params.limit ?? DEFAULT_LIMIT;

  if (!operator) {
    throw new Error('Only operators "SSEN" and "NPG" are currently supported.');
  }
  if (params.lat < -90 || params.lat > 90) throw new Error("Latitude must be between -90 and 90.");
  if (params.lon < -180 || params.lon > 180) throw new Error("Longitude must be between -180 and 180.");
  if (radiusKm <= 0 || radiusKm > 50) throw new Error("radius_km must be between 0 and 50.");
  if (limit <= 0 || limit > 10) throw new Error("limit must be between 1 and 10.");

  const records = operator === "SSEN"
    ? await fetchHeadroomRecords()
    : await fetchNpgHeadroomRecords();
  const matches = records
    .map((record) => ({
      record,
      distanceKm: haversineKm(params.lat, params.lon, record.lat, record.lon),
    }))
    .filter((match) => match.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit)
    .map((match) => toHeadroomSite(match.record, match.distanceKm));

  const confidenceNotes = buildConfidenceNotes(operator, matches.length > 0);

  return {
    lat: params.lat,
    lon: params.lon,
    operator,
    radius_km: radiusKm,
    nearest_site: matches[0] ?? null,
    matches,
    confidence_notes: confidenceNotes,
    source_metadata: getSourceMetadata(operator),
    disclaimer: getDisclaimer(operator),
  };
}
