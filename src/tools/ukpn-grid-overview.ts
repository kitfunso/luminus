import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";
import { guardJsonFields } from "../lib/schema-guard.js";
import { resolveApiKey, ConfigurationError } from "../lib/auth.js";

const cache = new TtlCache();

const GSP_OVERVIEW_URL =
  "https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/ukpn-grid-supply-points-overview/records";
const HV_FLEX_ZONES_URL =
  "https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/ukpn-hv-flex-zones/records";
const LIVE_FAULTS_URL =
  "https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/ukpn-live-faults/records";

const GSP_CACHE_KEY = "ukpn-gsp-overview:all";
const FLEX_CACHE_KEY = "ukpn-flex-zones:all";
const FAULTS_CACHE_KEY = "ukpn-live-faults:all";

const DEFAULT_RADIUS_KM = 50;
const MAX_RADIUS_KM = 100;
const ODS_PAGE_LIMIT = 100;

const GSP_SELECT_FIELDS = [
  "dno",
  "gsp",
  "minimum_observed_power_flow",
  "maximum_observed_power_flow",
  "asset_import_limit",
  "asset_export_limit",
  "technical_limit_import_summer",
  "technical_limit_import_winter",
  "technical_limit_export",
  "export_capacity_utilisation",
  "import_capacity_utilisation",
  "geo_point_2d",
].join(",");

const FLEX_SELECT_FIELDS = [
  "dno",
  "tender_round",
  "flexbility_zone",
  "constraint_type",
  "geo_point_2d",
].join(",");

const FAULT_SELECT_FIELDS = [
  "incidentreference",
  "powercuttype",
  "nocustomeraffected",
  "incidentdescription",
  "incidentcategory",
  "statusid",
  "geopoint",
  "estimatedrestorationdate",
  "operatingzone",
].join(",");

// ---------- Schema ----------

export const ukpnGridOverviewSchema = z.object({
  lat: z.number().optional().describe("Latitude for proximity search. If omitted, returns all GSPs."),
  lon: z.number().optional().describe("Longitude for proximity search."),
  radius_km: z.number().optional().describe("Search radius (default 50, max 100). Only applies when lat/lon provided."),
  include_faults: z.boolean().optional().describe("Include live fault data (default true)."),
});

// ---------- Raw record interfaces ----------

interface GspRawRecord {
  dno?: string | null;
  gsp?: string | null;
  minimum_observed_power_flow?: number | null;
  maximum_observed_power_flow?: number | null;
  asset_import_limit?: string | null;
  asset_export_limit?: number | null;
  technical_limit_import_summer?: string | null;
  technical_limit_import_winter?: string | null;
  technical_limit_export?: string | null;
  export_capacity_utilisation?: number | null;
  import_capacity_utilisation?: number | null;
  geo_point_2d?: { lat?: number | null; lon?: number | null } | null;
}

interface FlexRawRecord {
  dno?: string | null;
  tender_round?: string | null;
  flexbility_zone?: string | null;
  constraint_type?: string | null;
  geo_point_2d?: { lat?: number | null; lon?: number | null } | null;
}

interface FaultRawRecord {
  incidentreference?: string | null;
  powercuttype?: string | null;
  nocustomeraffected?: number | null;
  incidentdescription?: string | null;
  incidentcategory?: string | null;
  statusid?: number | null;
  geopoint?: { lat?: number | null; lon?: number | null } | null;
  estimatedrestorationdate?: string | null;
  operatingzone?: string | null;
}

// ---------- Result interfaces ----------

interface GspOverviewEntry {
  gsp: string;
  dno: string;
  lat: number | null;
  lon: number | null;
  distance_km: number | null;
  max_observed_flow_mw: number | null;
  min_observed_flow_mw: number | null;
  asset_import_limit: string | null;
  asset_export_limit: number | null;
  tech_limit_import_summer: string | null;
  tech_limit_import_winter: string | null;
  tech_limit_export: string | null;
  export_utilisation_pct: number | null;
  import_utilisation_pct: number | null;
}

interface FlexZoneEntry {
  zone: string;
  dno: string;
  constraint_type: string;
  tender_round: string | null;
  lat: number | null;
  lon: number | null;
  distance_km: number | null;
}

interface LiveFaultEntry {
  reference: string;
  type: string;
  category: string | null;
  description: string | null;
  customers_affected: number;
  status: number;
  estimated_restoration: string | null;
  operating_zone: string | null;
  lat: number | null;
  lon: number | null;
  distance_km: number | null;
}

interface UkpnGridOverviewResult {
  lat: number | null;
  lon: number | null;
  radius_km: number | null;
  gsps: GspOverviewEntry[];
  flex_zones: FlexZoneEntry[];
  live_faults: LiveFaultEntry[];
  source_metadata: {
    gsp_overview: GisSourceMetadata;
    flex_zones: GisSourceMetadata;
    live_faults: GisSourceMetadata;
  };
  disclaimer: string;
}

// ---------- Helpers ----------

export function resetUkpnGridOverviewCacheForTests(): void {
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

async function resolveOdsApiKey(): Promise<string> {
  try {
    return await resolveApiKey("UKPN_ODS_API_KEY");
  } catch (err) {
    if (err instanceof ConfigurationError) {
      throw new Error(
        "UKPN Open Data Portal requires a free API key. Register at the portal, then set UKPN_ODS_API_KEY in ~/.luminus/keys.json or as an environment variable.",
      );
    }
    throw err;
  }
}

// ---------- Fetch GSP Overview ----------

async function fetchGspOverview(apiKey: string): Promise<GspRawRecord[]> {
  const cached = cache.get<GspRawRecord[]>(GSP_CACHE_KEY);
  if (cached) return cached;

  const allRows: GspRawRecord[] = [];

  for (let offset = 0; ; offset += ODS_PAGE_LIMIT) {
    const params = new URLSearchParams({
      limit: String(ODS_PAGE_LIMIT),
      offset: String(offset),
      select: GSP_SELECT_FIELDS,
      apikey: apiKey,
    });
    const response = await fetch(`${GSP_OVERVIEW_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`UKPN GSP overview fetch failed: HTTP ${response.status}`);
    }

    const json = (await response.json()) as { results?: GspRawRecord[] };
    const page = Array.isArray(json.results) ? json.results : [];
    if (page.length === 0) break;

    guardJsonFields(
      page[0] as unknown as Record<string, unknown>,
      ["gsp", "maximum_observed_power_flow", "export_capacity_utilisation"],
      "UKPN GSP Overview",
    );

    allRows.push(...page);
    if (page.length < ODS_PAGE_LIMIT) break;
  }

  cache.set(GSP_CACHE_KEY, allRows, TTL.STATIC_DATA);
  return allRows;
}

// ---------- Fetch HV Flex Zones ----------

async function fetchFlexZones(apiKey: string): Promise<FlexRawRecord[]> {
  const cached = cache.get<FlexRawRecord[]>(FLEX_CACHE_KEY);
  if (cached) return cached;

  const allRows: FlexRawRecord[] = [];

  for (let offset = 0; ; offset += ODS_PAGE_LIMIT) {
    const params = new URLSearchParams({
      limit: String(ODS_PAGE_LIMIT),
      offset: String(offset),
      select: FLEX_SELECT_FIELDS,
      apikey: apiKey,
    });
    const response = await fetch(`${HV_FLEX_ZONES_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`UKPN HV Flex Zones fetch failed: HTTP ${response.status}`);
    }

    const json = (await response.json()) as { results?: FlexRawRecord[] };
    const page = Array.isArray(json.results) ? json.results : [];
    if (page.length === 0) break;

    guardJsonFields(
      page[0] as unknown as Record<string, unknown>,
      ["flexbility_zone", "constraint_type"],
      "UKPN HV Flex Zones",
    );

    allRows.push(...page);
    if (page.length < ODS_PAGE_LIMIT) break;
  }

  cache.set(FLEX_CACHE_KEY, allRows, TTL.STATIC_DATA);
  return allRows;
}

// ---------- Fetch Live Faults ----------

async function fetchLiveFaults(apiKey: string): Promise<FaultRawRecord[]> {
  const cached = cache.get<FaultRawRecord[]>(FAULTS_CACHE_KEY);
  if (cached) return cached;

  const allRows: FaultRawRecord[] = [];

  for (let offset = 0; ; offset += ODS_PAGE_LIMIT) {
    const params = new URLSearchParams({
      limit: String(ODS_PAGE_LIMIT),
      offset: String(offset),
      select: FAULT_SELECT_FIELDS,
      apikey: apiKey,
    });
    const response = await fetch(`${LIVE_FAULTS_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`UKPN Live Faults fetch failed: HTTP ${response.status}`);
    }

    const json = (await response.json()) as { results?: FaultRawRecord[] };
    const page = Array.isArray(json.results) ? json.results : [];
    if (page.length === 0) break;

    guardJsonFields(
      page[0] as unknown as Record<string, unknown>,
      ["incidentreference", "powercuttype"],
      "UKPN Live Faults",
    );

    allRows.push(...page);
    if (page.length < ODS_PAGE_LIMIT) break;
  }

  // Live faults: very short TTL (5 minutes)
  cache.set(FAULTS_CACHE_KEY, allRows, TTL.REALTIME);
  return allRows;
}

// ---------- Transform ----------

function toGspEntry(
  row: GspRawRecord,
  searchLat: number | null,
  searchLon: number | null,
): GspOverviewEntry {
  const lat = row.geo_point_2d?.lat ?? null;
  const lon = row.geo_point_2d?.lon ?? null;
  const distance =
    searchLat !== null && searchLon !== null && lat !== null && lon !== null
      ? Math.round(haversineKm(searchLat, searchLon, lat, lon) * 100) / 100
      : null;

  return {
    gsp: row.gsp?.trim() ?? "Unknown",
    dno: row.dno?.trim() ?? "Unknown",
    lat,
    lon,
    distance_km: distance,
    max_observed_flow_mw: row.maximum_observed_power_flow ?? null,
    min_observed_flow_mw: row.minimum_observed_power_flow ?? null,
    asset_import_limit: row.asset_import_limit ?? null,
    asset_export_limit: row.asset_export_limit ?? null,
    tech_limit_import_summer: row.technical_limit_import_summer ?? null,
    tech_limit_import_winter: row.technical_limit_import_winter ?? null,
    tech_limit_export: row.technical_limit_export ?? null,
    export_utilisation_pct: row.export_capacity_utilisation ?? null,
    import_utilisation_pct: row.import_capacity_utilisation ?? null,
  };
}

function toFlexEntry(
  row: FlexRawRecord,
  searchLat: number | null,
  searchLon: number | null,
): FlexZoneEntry {
  const lat = row.geo_point_2d?.lat ?? null;
  const lon = row.geo_point_2d?.lon ?? null;
  const distance =
    searchLat !== null && searchLon !== null && lat !== null && lon !== null
      ? Math.round(haversineKm(searchLat, searchLon, lat, lon) * 100) / 100
      : null;

  return {
    zone: row.flexbility_zone?.trim() ?? "Unknown",
    dno: row.dno?.trim() ?? "Unknown",
    constraint_type: row.constraint_type?.trim() ?? "Unknown",
    tender_round: row.tender_round?.trim() ?? null,
    lat,
    lon,
    distance_km: distance,
  };
}

function toFaultEntry(
  row: FaultRawRecord,
  searchLat: number | null,
  searchLon: number | null,
): LiveFaultEntry {
  const lat = row.geopoint?.lat ?? null;
  const lon = row.geopoint?.lon ?? null;
  const distance =
    searchLat !== null && searchLon !== null && lat !== null && lon !== null
      ? Math.round(haversineKm(searchLat, searchLon, lat, lon) * 100) / 100
      : null;

  return {
    reference: row.incidentreference?.trim() ?? "Unknown",
    type: row.powercuttype?.trim() ?? "Unknown",
    category: row.incidentcategory?.trim() ?? null,
    description: row.incidentdescription?.trim() ?? null,
    customers_affected: row.nocustomeraffected ?? 0,
    status: row.statusid ?? 0,
    estimated_restoration: row.estimatedrestorationdate ?? null,
    operating_zone: row.operatingzone?.trim() ?? null,
    lat,
    lon,
    distance_km: distance,
  };
}

// ---------- Main ----------

export async function getUkpnGridOverview(
  input: z.infer<typeof ukpnGridOverviewSchema>,
): Promise<UkpnGridOverviewResult> {
  const searchLat = input.lat ?? null;
  const searchLon = input.lon ?? null;
  const hasSpatial = searchLat !== null && searchLon !== null;
  const radiusKm = hasSpatial
    ? Math.min(input.radius_km ?? DEFAULT_RADIUS_KM, MAX_RADIUS_KM)
    : null;
  const includeFaults = input.include_faults ?? true;

  const apiKey = await resolveOdsApiKey();

  // Fetch all three datasets in parallel
  const [gspRaw, flexRaw, faultRaw] = await Promise.all([
    fetchGspOverview(apiKey),
    fetchFlexZones(apiKey),
    includeFaults ? fetchLiveFaults(apiKey) : Promise.resolve([]),
  ]);

  // Transform
  let gsps = gspRaw.map((row) => toGspEntry(row, searchLat, searchLon));
  let flexZones = flexRaw.map((row) => toFlexEntry(row, searchLat, searchLon));
  let faults = faultRaw.map((row) => toFaultEntry(row, searchLat, searchLon));

  // Filter by radius and sort by distance when spatial search is active
  if (hasSpatial && radiusKm !== null) {
    gsps = gsps
      .filter((entry) => entry.distance_km !== null && entry.distance_km <= radiusKm)
      .sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));

    flexZones = flexZones
      .filter((entry) => entry.distance_km !== null && entry.distance_km <= radiusKm)
      .sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));

    faults = faults
      .filter((entry) => entry.distance_km !== null && entry.distance_km <= radiusKm)
      .sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
  }

  return {
    lat: searchLat,
    lon: searchLon,
    radius_km: radiusKm,
    gsps,
    flex_zones: flexZones,
    live_faults: faults,
    source_metadata: {
      gsp_overview: GIS_SOURCES["ukpn-gsp-overview"] ?? buildPlaceholderMetadata("ukpn-gsp-overview", "UKPN GSP Overview"),
      flex_zones: GIS_SOURCES["ukpn-flex-zones"] ?? buildPlaceholderMetadata("ukpn-flex-zones", "UKPN HV Flex Zones"),
      live_faults: GIS_SOURCES["ukpn-live-faults"] ?? buildPlaceholderMetadata("ukpn-live-faults", "UKPN Live Faults"),
    },
    disclaimer:
      "GSP capacity limits and utilisation are published planning signals, not guaranteed connection capacity. " +
      "Live faults are real-time snapshots and may change rapidly. " +
      "Contains data from UK Power Networks.",
  };
}

function buildPlaceholderMetadata(id: string, name: string): GisSourceMetadata {
  return {
    id,
    name,
    provider: "UK Power Networks",
    licence: "Open Data (free registration required for API access)",
    url: "https://ukpowernetworks.opendatasoft.com/",
    api_key_required: true,
    coverage: "UKPN licence areas: EPN, LPN, SPN",
    update_frequency: id.includes("fault") ? "Real-time" : "Published periodically",
    reliability: "medium",
    caveats: [
      "Coverage is limited to UKPN licence areas",
      "Data is for screening purposes only, not a substitute for formal connection assessment",
    ],
    attribution: "Contains data from UK Power Networks.",
  };
}

export { ukpnGridOverviewSchema as schema, getUkpnGridOverview as handler };
