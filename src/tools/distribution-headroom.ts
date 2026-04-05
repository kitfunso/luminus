import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";
import { guardJsonFields } from "../lib/schema-guard.js";
import { resolveApiKey, ConfigurationError } from "../lib/auth.js";

const cache = new TtlCache();

const SSEN_PACKAGE_SHOW_URL =
  "https://data-api.ssen.co.uk/api/3/action/package_show?id=generation-availability-and-network-capacity";
const NPG_DATASET_URL =
  "https://northernpowergrid.opendatasoft.com/api/explore/v2.1/catalog/datasets/heatmapsubstationareas/records";
const UKPN_DATASET_URL =
  "https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/dfes-network-headroom-report/records";
const SPEN_SPM_DATASET_URL =
  "https://spenergynetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/spm-nshr-data-workbook/records";
const SPEN_SPD_DATASET_URL =
  "https://spenergynetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/spd-nshr-data-workbook/records";
const ENWL_DATASET_URL =
  "https://electricitynorthwest.opendatasoft.com/api/explore/v2.1/catalog/datasets/enwl-pry-heatmap/records";
const SSEN_CACHE_KEY = "ssen-distribution-headroom:all";
const NPG_CACHE_KEY = "npg-distribution-headroom:all";
const UKPN_CACHE_KEY = "ukpn-distribution-headroom:all";
const SPEN_CACHE_KEY = "spen-distribution-headroom:all";
const ENWL_CACHE_KEY = "enwl-distribution-headroom:all";
const DEFAULT_RADIUS_KM = 25;
const DEFAULT_LIMIT = 5;
const ODS_PAGE_LIMIT = 100;
const NPG_PAGE_LIMIT = ODS_PAGE_LIMIT;
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
const UKPN_SELECT_FIELDS = [
  "substation_name",
  "voltage_kv",
  "licencearea",
  "bulksupplypoint",
  "gridsupplypoint",
  "category",
  "scenario",
  "year",
  "headroom_mw",
  "spatial_coordinates",
].join(",");
const SPEN_SELECT_FIELDS = [
  "substation_group",
  "voltage_kv",
  "grid_gsp_group",
  "headroom_type",
  "scenario",
  "year",
  "headroom_mw",
].join(",");
const ENWL_SELECT_FIELDS = [
  "pry_number",
  "bsp_number",
  "gsp_number",
  "class",
  "voltage_mw",
  "dem_hr_firm_mw",
  "dem_hr_non_firm_mw",
  "gen_hr_inverter_mw",
  "gen_hr_lv_synchronous_mw",
  "gen_hr_hv_synchronous_mw",
  "batt_storage_hr_mw",
  "geo_point_2d",
].join(",");

export const distributionHeadroomSchema = z.object({
  lat: z.number().describe("Latitude (-90 to 90). WGS84."),
  lon: z.number().describe("Longitude (-180 to 180). WGS84."),
  operator: z
    .string()
    .describe('Distribution operator. Supported: "SSEN", "NPG", "UKPN", "SPEN", "ENWL".'),
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

interface UkpnHeadroomRawRecord {
  substation_name?: string | null;
  voltage_kv?: number | null;
  licencearea?: string | null;
  bulksupplypoint?: string | null;
  gridsupplypoint?: string | null;
  category?: string | null;
  scenario?: string | null;
  year?: string | null;
  headroom_mw?: number | null;
  spatial_coordinates?: {
    lat?: number | null;
    lon?: number | null;
  } | null;
}

interface SpenHeadroomRawRecord {
  substation_group?: string | null;
  voltage_kv?: number | null;
  grid_gsp_group?: string | null;
  headroom_type?: string | null;
  scenario?: string | null;
  year?: string | null;
  headroom_mw?: number | null;
}

interface EnwlHeadroomRawRecord {
  pry_number?: string | null;
  bsp_number?: string | null;
  gsp_number?: string | null;
  class?: string | null;
  voltage_mw?: string | null;
  dem_hr_firm_mw?: number | null;
  dem_hr_non_firm_mw?: number | null;
  gen_hr_inverter_mw?: number | null;
  gen_hr_lv_synchronous_mw?: number | null;
  gen_hr_hv_synchronous_mw?: number | null;
  batt_storage_hr_mw?: number | null;
  geo_point_2d?: {
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

type SupportedOperator = "SSEN" | "NPG" | "UKPN" | "SPEN" | "ENWL";

function normalizeOperator(operator: string): SupportedOperator | null {
  const normalized = operator.trim().toUpperCase();

  if (normalized === "SSEN") return "SSEN";
  if (normalized === "NPG" || normalized === "NORTHERN POWERGRID" || normalized === "NORTHERN_POWERGRID") {
    return "NPG";
  }
  if (normalized === "UKPN" || normalized === "UK POWER NETWORKS" || normalized === "UK_POWER_NETWORKS") {
    return "UKPN";
  }
  if (normalized === "SPEN" || normalized === "SP ENERGY NETWORKS" || normalized === "SP_ENERGY_NETWORKS" || normalized === "SCOTTISH POWER") {
    return "SPEN";
  }
  if (normalized === "ENWL" || normalized === "ELECTRICITY NORTH WEST" || normalized === "ENW") {
    return "ENWL";
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

async function resolveOdsApiKey(keyName: string, portalName: string): Promise<string> {
  try {
    return await resolveApiKey(keyName);
  } catch (err) {
    if (err instanceof ConfigurationError) {
      throw new Error(
        `${portalName} requires a free API key. Register at the portal, then set ${keyName} in ~/.luminus/keys.json or as an environment variable.`,
      );
    }
    throw err;
  }
}

async function fetchUkpnHeadroomRecords(): Promise<DistributionHeadroomRecord[]> {
  const cached = cache.get<DistributionHeadroomRecord[]>(UKPN_CACHE_KEY);
  if (cached) return cached;

  const apiKey = await resolveOdsApiKey("UKPN_ODS_API_KEY", "UKPN Open Data Portal");

  // UKPN DFES scenarios: Counterfactual, Electric Engagement, Holistic Transition, Hydrogen Evolution.
  // "Counterfactual" is the closest to current-state (no policy acceleration).
  // Categories: "Demand Headroom", "Gen inverter headroom", "Gen synch headroom".
  // year is a date field — ODS requires date'YYYY-MM-DD' syntax for date comparisons.
  // Fetch only the current year to stay under ODS 10K offset limit (~3K records per year).
  const currentYear = new Date().getFullYear();
  const baselineWhere = `scenario = 'Counterfactual' AND year >= date'${currentYear}-01-01' AND year < date'${currentYear + 1}-01-01'`;

  const allRows: UkpnHeadroomRawRecord[] = [];

  for (let offset = 0; ; offset += ODS_PAGE_LIMIT) {
    const params = new URLSearchParams({
      limit: String(ODS_PAGE_LIMIT),
      offset: String(offset),
      select: UKPN_SELECT_FIELDS,
      where: baselineWhere,
      order_by: "year ASC",
      apikey: apiKey,
    });
    const response = await fetch(`${UKPN_DATASET_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`UKPN DFES headroom dataset fetch failed: HTTP ${response.status}`);
    }

    const json = (await response.json()) as { results?: UkpnHeadroomRawRecord[] };
    const page = Array.isArray(json.results) ? json.results : [];
    if (page.length === 0) break;

    guardJsonFields(
      page[0] as unknown as Record<string, unknown>,
      ["substation_name", "voltage_kv", "headroom_mw", "spatial_coordinates", "category"],
      "UKPN DFES Network Headroom Report",
    );

    allRows.push(...page);
    if (page.length < ODS_PAGE_LIMIT) break;
  }

  // Aggregate by substation: take the nearest year's Baseline row per category,
  // fold demand and generation headroom into one record per substation.
  const substationMap = new Map<string, {
    substation: string;
    licence_area: string;
    gsp: string | null;
    bsp: string | null;
    voltage_kv: string | null;
    lat: number;
    lon: number;
    demand_headroom_mw: number | null;
    generation_headroom_mw: number | null;
  }>();

  for (const row of allRows) {
    const substation = row.substation_name?.trim();
    const lat = row.spatial_coordinates?.lat ?? null;
    const lon = row.spatial_coordinates?.lon ?? null;
    if (!substation || lat === null || lon === null) continue;

    const key = `${substation}::${lat}::${lon}`;
    const existing = substationMap.get(key);
    const category = (row.category ?? "").toLowerCase();
    const headroom = typeof row.headroom_mw === "number" && Number.isFinite(row.headroom_mw) ? row.headroom_mw : null;

    // Actual categories: "Demand Headroom", "Gen inverter headroom", "Gen synch headroom".
    // For generation, take the lower (more constrained) of inverter and synchronous.
    const isDemand = category.includes("demand");
    const isGeneration = category.includes("gen ");

    if (!existing) {
      substationMap.set(key, {
        substation,
        licence_area: row.licencearea?.trim() ?? "UKPN",
        gsp: row.gridsupplypoint?.trim() ?? null,
        bsp: row.bulksupplypoint?.trim() ?? null,
        voltage_kv: row.voltage_kv !== null && row.voltage_kv !== undefined ? String(row.voltage_kv) : null,
        lat,
        lon,
        demand_headroom_mw: isDemand ? headroom : null,
        generation_headroom_mw: isGeneration ? headroom : null,
      });
    } else {
      if (isDemand && existing.demand_headroom_mw === null) {
        existing.demand_headroom_mw = headroom;
      }
      if (isGeneration) {
        // Take min of inverter and synchronous headroom (binding constraint)
        existing.generation_headroom_mw = pickMinHeadroom(existing.generation_headroom_mw, headroom);
      }
    }
  }

  const records: DistributionHeadroomRecord[] = [];
  for (const [, entry] of substationMap) {
    records.push({
      asset_id: `UKPN:${entry.licence_area}:${entry.substation}`,
      licence_area: entry.licence_area,
      substation: entry.substation,
      upstream_gsp: entry.gsp,
      upstream_bsp: entry.bsp,
      substation_type: null,
      voltage_kv: entry.voltage_kv,
      lat: entry.lat,
      lon: entry.lon,
      estimated_demand_headroom_mva: entry.demand_headroom_mw,
      demand_rag_status: null,
      demand_constraint: null,
      connected_generation_mw: null,
      contracted_generation_mw: null,
      estimated_generation_headroom_mw: entry.generation_headroom_mw,
      generation_rag_status: null,
      generation_constraint: null,
      upstream_reinforcement_works: null,
      upstream_reinforcement_completion_date: null,
      substation_reinforcement_works: null,
      substation_reinforcement_completion_date: null,
    });
  }

  if (records.length === 0) {
    throw new Error("UKPN DFES headroom dataset returned no valid records");
  }

  cache.set(UKPN_CACHE_KEY, records, TTL.STATIC_DATA);
  return records;
}

async function fetchSpenHeadroomRecords(): Promise<DistributionHeadroomRecord[]> {
  const cached = cache.get<DistributionHeadroomRecord[]>(SPEN_CACHE_KEY);
  if (cached) return cached;

  const apiKey = await resolveOdsApiKey("SPEN_ODS_API_KEY", "SP Energy Networks Open Data Portal");

  // SPEN publishes NSHR data for SPM (Manweb) and SPD (Distribution) as separate datasets.
  // SPM uses financial-year text ("2026/27"), SPD uses plain year text ("2026").
  // SPM uses grid_gsp_group, SPD uses grid_grid_group + gsp fields.
  // SPEN scenarios: "BV" (best view / baseline), "high", "low".
  const currentYear = new Date().getFullYear();

  const datasets = [
    { url: SPEN_SPM_DATASET_URL, yearValue: `${currentYear}/${String(currentYear + 1).slice(2)}`, gspField: "grid_gsp_group" as const },
    { url: SPEN_SPD_DATASET_URL, yearValue: String(currentYear), gspField: "gsp" as const },
  ];

  const allRows: SpenHeadroomRawRecord[] = [];

  for (const dataset of datasets) {
    const where = `scenario = 'BV' AND year = '${dataset.yearValue}'`;

    for (let offset = 0; ; offset += ODS_PAGE_LIMIT) {
      const params = new URLSearchParams({
        limit: String(ODS_PAGE_LIMIT),
        offset: String(offset),
        select: `substation_group,voltage_kv,${dataset.gspField},headroom_type,scenario,year,headroom_mw`,
        where,
        order_by: "year ASC",
        apikey: apiKey,
      });

      let response: Response;
      try {
        response = await fetch(`${dataset.url}?${params.toString()}`);
      } catch {
        // Dataset might not be reachable; skip gracefully
        break;
      }

      if (!response.ok) {
        // Dataset may not be published or the year value doesn't match; skip
        if (response.status === 404 || response.status === 400) break;
        throw new Error(`SPEN NSHR dataset fetch failed: HTTP ${response.status}`);
      }

      const json = (await response.json()) as { results?: Record<string, unknown>[] };
      const page = Array.isArray(json.results) ? json.results : [];
      if (page.length === 0) break;

      guardJsonFields(
        page[0] as unknown as Record<string, unknown>,
        ["substation_group", "headroom_mw", "headroom_type"],
        "SPEN NSHR Data Workbook",
      );

      // Normalize SPD's different field names to match our internal shape
      for (const raw of page) {
        allRows.push({
          substation_group: raw.substation_group as string | null,
          voltage_kv: raw.voltage_kv as number | null,
          grid_gsp_group: (raw[dataset.gspField] ?? raw.grid_gsp_group ?? null) as string | null,
          headroom_type: raw.headroom_type as string | null,
          scenario: raw.scenario as string | null,
          year: raw.year as string | null,
          headroom_mw: raw.headroom_mw as number | null,
        });
      }

      if (page.length < ODS_PAGE_LIMIT) break;
    }
  }

  // Aggregate by substation_group: fold demand/generation headroom types into one record.
  // SPEN does not publish lat/lon in the NSHR dataset, so we cannot do spatial matching.
  // Year filtering is already done at the API level per dataset.
  const substationMap = new Map<string, {
    substation: string;
    gsp_group: string | null;
    voltage_kv: string | null;
    demand_headroom_mw: number | null;
    generation_sync_headroom_mw: number | null;
    generation_inverter_headroom_mw: number | null;
  }>();

  for (const row of allRows) {
    const substation = row.substation_group?.trim();
    if (!substation) continue;

    const key = substation;
    const headroomType = (row.headroom_type ?? "").toLowerCase();
    const headroom = typeof row.headroom_mw === "number" && Number.isFinite(row.headroom_mw) ? row.headroom_mw : null;

    const existing = substationMap.get(key);
    if (!existing) {
      substationMap.set(key, {
        substation,
        gsp_group: row.grid_gsp_group?.trim() ?? null,
        voltage_kv: row.voltage_kv !== null && row.voltage_kv !== undefined ? String(row.voltage_kv) : null,
        demand_headroom_mw: headroomType === "demand" ? headroom : null,
        generation_sync_headroom_mw: headroomType.includes("synchronous") ? headroom : null,
        generation_inverter_headroom_mw: headroomType.includes("converter") ? headroom : null,
      });
    } else {
      if (headroomType === "demand" && existing.demand_headroom_mw === null) {
        existing.demand_headroom_mw = headroom;
      }
      if (headroomType.includes("synchronous") && existing.generation_sync_headroom_mw === null) {
        existing.generation_sync_headroom_mw = headroom;
      }
      if (headroomType.includes("converter") && existing.generation_inverter_headroom_mw === null) {
        existing.generation_inverter_headroom_mw = headroom;
      }
    }
  }

  // SPEN NSHR doesn't have coordinates. We'll store records without lat/lon
  // and use name-based matching. For spatial queries, records without coordinates
  // will be excluded from distance filtering.
  const records: DistributionHeadroomRecord[] = [];
  for (const [, entry] of substationMap) {
    // Use the lower (more constrained) of sync and inverter generation headroom
    const genHeadroom = pickMinHeadroom(entry.generation_sync_headroom_mw, entry.generation_inverter_headroom_mw);

    records.push({
      asset_id: `SPEN:${entry.substation}`,
      licence_area: "SP Energy Networks",
      substation: entry.substation,
      upstream_gsp: entry.gsp_group,
      upstream_bsp: null,
      substation_type: null,
      voltage_kv: entry.voltage_kv,
      lat: 0,
      lon: 0,
      estimated_demand_headroom_mva: entry.demand_headroom_mw,
      demand_rag_status: null,
      demand_constraint: null,
      connected_generation_mw: null,
      contracted_generation_mw: null,
      estimated_generation_headroom_mw: genHeadroom,
      generation_rag_status: null,
      generation_constraint: null,
      upstream_reinforcement_works: null,
      upstream_reinforcement_completion_date: null,
      substation_reinforcement_works: null,
      substation_reinforcement_completion_date: null,
    });
  }

  if (records.length === 0) {
    throw new Error("SPEN NSHR dataset returned no valid records");
  }

  cache.set(SPEN_CACHE_KEY, records, TTL.STATIC_DATA);
  return records;
}

async function fetchEnwlHeadroomRecords(): Promise<DistributionHeadroomRecord[]> {
  const cached = cache.get<DistributionHeadroomRecord[]>(ENWL_CACHE_KEY);
  if (cached) return cached;

  const apiKey = await resolveOdsApiKey("ENWL_ODS_API_KEY", "Electricity North West Open Data Portal");
  const records: DistributionHeadroomRecord[] = [];

  for (let offset = 0; ; offset += ODS_PAGE_LIMIT) {
    const params = new URLSearchParams({
      limit: String(ODS_PAGE_LIMIT),
      offset: String(offset),
      select: ENWL_SELECT_FIELDS,
      apikey: apiKey,
    });

    const response = await fetch(`${ENWL_DATASET_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`ENWL PRY Heatmap dataset fetch failed: HTTP ${response.status}`);
    }

    const json = (await response.json()) as { results?: EnwlHeadroomRawRecord[] };
    const page = Array.isArray(json.results) ? json.results : [];
    if (page.length === 0) break;

    guardJsonFields(
      page[0] as unknown as Record<string, unknown>,
      ["pry_number", "dem_hr_firm_mw", "gen_hr_inverter_mw", "geo_point_2d"],
      "ENWL PRY Heatmap",
    );

    for (const row of page) {
      const pryNumber = parseText(row.pry_number ?? undefined);
      const lat = row.geo_point_2d?.lat ?? null;
      const lon = row.geo_point_2d?.lon ?? null;

      if (!pryNumber || lat === null || lon === null) {
        continue;
      }

      const genHeadroom = pickMinHeadroom(
        parseNumericValue(row.gen_hr_inverter_mw),
        pickMinHeadroom(
          parseNumericValue(row.gen_hr_lv_synchronous_mw),
          parseNumericValue(row.gen_hr_hv_synchronous_mw),
        ),
      );

      records.push({
        asset_id: `ENWL:${pryNumber}`,
        licence_area: "Electricity North West",
        substation: pryNumber,
        upstream_gsp: parseText(row.gsp_number ?? undefined),
        upstream_bsp: parseText(row.bsp_number ?? undefined),
        substation_type: parseText(row.class ?? undefined),
        voltage_kv: parseText(row.voltage_mw ?? undefined),
        lat,
        lon,
        estimated_demand_headroom_mva: parseNumericValue(row.dem_hr_firm_mw),
        demand_rag_status: null,
        demand_constraint: null,
        connected_generation_mw: null,
        contracted_generation_mw: null,
        estimated_generation_headroom_mw: genHeadroom,
        generation_rag_status: null,
        generation_constraint: null,
        upstream_reinforcement_works: null,
        upstream_reinforcement_completion_date: null,
        substation_reinforcement_works: null,
        substation_reinforcement_completion_date: null,
      });
    }

    if (page.length < ODS_PAGE_LIMIT) break;
  }

  if (records.length === 0) {
    throw new Error("ENWL PRY Heatmap dataset returned no valid records");
  }

  cache.set(ENWL_CACHE_KEY, records, TTL.STATIC_DATA);
  return records;
}

function pickMinHeadroom(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

function buildConfidenceNotes(
  operator: SupportedOperator,
  matchesFound: boolean,
): string[] {
  const operatorNotes: Record<SupportedOperator, string[]> = {
    SSEN: [
      "Uses SSEN public headroom dashboard data only; other DNOs are not inferred by this source",
      "Headroom values are planning signals, not firm connection rights or a formal offer",
      "Nearest-site matching is distance-based and does not infer SSEN licence-area boundaries outside the published site list",
    ],
    NPG: [
      "Uses Northern Powergrid's public Heat Map Data - Substation Areas dataset only; other DNOs are not inferred",
      "NPG generation headroom is published in MW and demand headroom in MVA as planning signals, not firm connection rights or a formal offer",
      "Nearest-site matching is distance-based to the published NPG site location; the dataset's service-area polygons are not yet used by this tool",
    ],
    UKPN: [
      "Uses UKPN's public DFES Network Scenario Headroom Report (Counterfactual scenario, nearest year); other DNOs are not inferred",
      "UKPN headroom is scenario-projected, not a live operational reading — actual available capacity may differ",
      "Demand headroom is reported in MW (not MVA) for this source",
      "Nearest-site matching is distance-based to the published UKPN substation coordinates",
    ],
    SPEN: [
      "Uses SP Energy Networks' public NDP Network Scenario Headroom Report (BV/best view scenario, nearest financial year); other DNOs are not inferred",
      "SPEN NSHR does not publish substation coordinates — results are returned alphabetically, not by proximity to the queried location",
      "Generation headroom uses the lower of synchronous and fully-rated converter values as the binding constraint",
      "SPEN headroom is scenario-projected, not a live operational reading",
      "Demand headroom is reported in MW (not MVA) for this source",
    ],
    ENWL: [
      "Uses ENWL's public PRY Heatmap dataset (current snapshot, monthly refresh); other DNOs are not inferred",
      "Headroom values are firm capacity signals at primary substations, not guaranteed connection availability",
      "Demand headroom is reported in MW (not MVA) for this source",
      "Battery storage headroom is published separately but not yet surfaced by this tool",
      "Nearest-site matching is distance-based to the published ENWL primary substation coordinates",
    ],
  };

  const notes = [...operatorNotes[operator]];

  if (!matchesFound) {
    notes.push(`No ${operator} headroom site found within search radius`);
  }

  return notes;
}

const SOURCE_METADATA_MAP: Record<SupportedOperator, string> = {
  SSEN: "ssen-distribution-headroom",
  NPG: "npg-heatmap-substation-areas",
  UKPN: "ukpn-dfes-headroom",
  SPEN: "spen-nshr-headroom",
  ENWL: "enwl-pry-heatmap",
};

function getSourceMetadata(operator: SupportedOperator): GisSourceMetadata {
  return GIS_SOURCES[SOURCE_METADATA_MAP[operator]];
}

const DISCLAIMERS: Record<SupportedOperator, string> = {
  SSEN:
    "This uses SSEN's public distribution headroom dashboard data as a planning signal for SSEN licence areas only. " +
    "It is not a connection offer, a firm capacity reservation, or a substitute for a formal DNO application.",
  NPG:
    "This uses Northern Powergrid's public Heat Map Data - Substation Areas dataset as a planning signal for Northern Powergrid licence areas only. " +
    "It is not a connection offer, a firm capacity reservation, or a substitute for a formal DNO application.",
  UKPN:
    "This uses UKPN's public DFES Network Scenario Headroom Report (Counterfactual scenario) as a planning signal for UKPN licence areas (EPN, LPN, SPN) only. " +
    "Headroom values are scenario projections, not real-time operational readings. " +
    "It is not a connection offer, a firm capacity reservation, or a substitute for a formal DNO application.",
  SPEN:
    "This uses SP Energy Networks' public NDP Network Scenario Headroom Report (BV scenario) as a planning signal for SPEN licence areas (SPD, SPM) only. " +
    "Headroom values are scenario projections and substation coordinates are not published. " +
    "It is not a connection offer, a firm capacity reservation, or a substitute for a formal DNO application.",
  ENWL:
    "This uses ENWL's public PRY Heatmap dataset as a planning signal for ENWL licence areas (North West England) only. " +
    "It is not a connection offer, a firm capacity reservation, or a substitute for a formal DNO application.",
};

function getDisclaimer(operator: SupportedOperator): string {
  return DISCLAIMERS[operator];
}

export async function getDistributionHeadroom(
  params: z.infer<typeof distributionHeadroomSchema>,
): Promise<DistributionHeadroomResult> {
  const operator = normalizeOperator(params.operator);
  const radiusKm = params.radius_km ?? DEFAULT_RADIUS_KM;
  const limit = params.limit ?? DEFAULT_LIMIT;

  if (!operator) {
    throw new Error('Supported operators: "SSEN", "NPG", "UKPN", "SPEN", "ENWL".');
  }
  if (params.lat < -90 || params.lat > 90) throw new Error("Latitude must be between -90 and 90.");
  if (params.lon < -180 || params.lon > 180) throw new Error("Longitude must be between -180 and 180.");
  if (radiusKm <= 0 || radiusKm > 50) throw new Error("radius_km must be between 0 and 50.");
  if (limit <= 0 || limit > 10) throw new Error("limit must be between 1 and 10.");

  const fetchMap: Record<SupportedOperator, () => Promise<DistributionHeadroomRecord[]>> = {
    SSEN: fetchHeadroomRecords,
    NPG: fetchNpgHeadroomRecords,
    UKPN: fetchUkpnHeadroomRecords,
    SPEN: fetchSpenHeadroomRecords,
    ENWL: fetchEnwlHeadroomRecords,
  };

  const records = await fetchMap[operator]();

  // SPEN has no coordinates — return all records sorted alphabetically (no spatial filter).
  // All other operators use distance-based matching.
  const matches = operator === "SPEN"
    ? records
        .slice()
        .sort((a, b) => a.substation.localeCompare(b.substation))
        .slice(0, limit)
        .map((record) => toHeadroomSite(record, 0))
    : records
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
