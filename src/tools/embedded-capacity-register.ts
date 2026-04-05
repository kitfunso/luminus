import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";
import { guardJsonFields } from "../lib/schema-guard.js";
import { resolveApiKey, ConfigurationError } from "../lib/auth.js";

const cache = new TtlCache();

const UKPN_ECR_URL =
  "https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/ukpn-embedded-capacity-register/records";
const SPEN_ECR_URL =
  "https://spenergynetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/embedded-capacity-register/records";

const ENWL_ECR_URL =
  "https://electricitynorthwest.opendatasoft.com/api/explore/v2.1/catalog/datasets/enwl-embedded-capacity-register-2-1mw-and-above/records";

const UKPN_CACHE_KEY = "ukpn-ecr:all";
const SPEN_CACHE_KEY = "spen-ecr:all";
const ENWL_CACHE_KEY = "enwl-ecr:all";
const DEFAULT_RADIUS_KM = 25;
const DEFAULT_LIMIT = 20;
const ODS_PAGE_LIMIT = 100;

const UKPN_SELECT_FIELDS = [
  "customer_name",
  "energy_source_1",
  "energy_conversion_technology_1",
  "connection_status",
  "maximum_export_capacity_mw",
  "maximum_import_capacity_mw",
  "storage_capacity_1_mwh",
  "grid_supply_point",
  "bulk_supply_point",
  "primary",
  "licence_area",
  "point_of_connection_poc_voltage_kv",
  "latitude",
  "longitude",
].join(",");

const SPEN_SELECT_FIELDS = [
  "customer_name",
  "energy_source_1",
  "connection_status",
  "maximum_export_capacity_mw",
  "maximum_import_capacity_mw",
  "storage_capacity_1_mwh",
  "grid_supply_point",
  "licence_area",
  "point_of_connection_poc_voltage_kv",
].join(",");

const UKPN_GUARD_FIELDS = [
  "customer_name",
  "connection_status",
  "maximum_export_capacity_mw",
  "latitude",
  "longitude",
] as const;

const SPEN_GUARD_FIELDS = [
  "customer_name",
  "connection_status",
  "maximum_export_capacity_mw",
] as const;

const ENWL_SELECT_FIELDS = [
  "customer_name",
  "energy_source_1",
  "energy_conversion_technology_1",
  "connection_status",
  "maximum_export_capacity_mw",
  "maximum_import_capacity_mw",
  "storage_capacity_1_mwh",
  "grid_supply_point",
  "bulk_supply_point",
  "primary",
  "licence_area",
  "point_of_connection_poc_voltage_kv",
  "geopoint",
].join(",");

const ENWL_GUARD_FIELDS = [
  "customer_name",
  "connection_status",
  "maximum_export_capacity_mw",
  "geopoint",
] as const;

export const embeddedCapacityRegisterSchema = z.object({
  lat: z.number().describe("Latitude (-90 to 90). WGS84."),
  lon: z.number().describe("Longitude (-180 to 180). WGS84."),
  operator: z
    .string()
    .describe('Distribution operator. Supported: "UKPN", "SPEN", "ENWL", "all".'),
  radius_km: z
    .number()
    .optional()
    .describe(
      "Search radius in km (default 25, max 50). Only applies to UKPN and ENWL (SPEN has no coordinates).",
    ),
  limit: z
    .number()
    .optional()
    .describe("Maximum results (default 20, max 50)."),
  energy_source: z
    .string()
    .optional()
    .describe(
      'Filter by energy source, e.g. "Solar", "Battery Storage", "Wind".',
    ),
  connection_status: z
    .string()
    .optional()
    .describe(
      'Filter by status, e.g. "Connected", "Accepted to Connect".',
    ),
});

interface EcrRecord {
  customer_name: string;
  energy_source: string | null;
  technology: string | null;
  connection_status: string;
  export_capacity_mw: number | null;
  import_capacity_mw: number | null;
  storage_capacity_mwh: number | null;
  gsp: string | null;
  bsp: string | null;
  primary_substation: string | null;
  licence_area: string;
  voltage_kv: number | null;
  lat: number;
  lon: number;
  operator: "UKPN" | "SPEN" | "ENWL";
}

interface EcrEntry {
  customer_name: string;
  energy_source: string | null;
  technology: string | null;
  connection_status: string;
  export_capacity_mw: number | null;
  import_capacity_mw: number | null;
  storage_capacity_mwh: number | null;
  gsp: string | null;
  bsp: string | null;
  primary_substation: string | null;
  licence_area: string;
  voltage_kv: number | null;
  lat: number;
  lon: number;
  operator: "UKPN" | "SPEN" | "ENWL";
  distance_km: number;
}

interface EcrResult {
  lat: number;
  lon: number;
  operator: string;
  radius_km: number;
  total_matched: number;
  total_export_mw: number;
  total_import_mw: number;
  total_storage_mwh: number;
  energy_source_breakdown: Record<string, number>;
  status_breakdown: Record<string, number>;
  entries: EcrEntry[];
  source_metadata: GisSourceMetadata;
  disclaimer: string;
}

interface UkpnEcrRawRecord {
  customer_name?: string | null;
  energy_source_1?: string | null;
  energy_conversion_technology_1?: string | null;
  connection_status?: string | null;
  maximum_export_capacity_mw?: number | null;
  maximum_import_capacity_mw?: number | null;
  storage_capacity_1_mwh?: number | null;
  grid_supply_point?: string | null;
  bulk_supply_point?: string | null;
  primary?: string | null;
  licence_area?: string | null;
  point_of_connection_poc_voltage_kv?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface SpenEcrRawRecord {
  customer_name?: string | null;
  energy_source_1?: string | null;
  connection_status?: string | null;
  maximum_export_capacity_mw?: string | null;
  maximum_import_capacity_mw?: string | null;
  storage_capacity_1_mwh?: string | null;
  grid_supply_point?: string | null;
  licence_area?: string | null;
  point_of_connection_poc_voltage_kv?: string | null;
}

interface EnwlEcrRawRecord {
  customer_name?: string | null;
  energy_source_1?: string | null;
  energy_conversion_technology_1?: string | null;
  connection_status?: string | null;
  maximum_export_capacity_mw?: number | null;
  maximum_import_capacity_mw?: number | null;
  storage_capacity_1_mwh?: number | null;
  grid_supply_point?: string | null;
  bulk_supply_point?: string | null;
  primary?: string | null;
  licence_area?: string | null;
  point_of_connection_poc_voltage_kv?: number | null;
  geopoint?: {
    lat?: number | null;
    lon?: number | null;
  } | null;
}

export function resetEcrCacheForTests(): void {
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

function parseNumberFromString(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "N/A" || trimmed === "n/a") return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumericValue(value: number | string | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  return parseNumberFromString(typeof value === "string" ? value : null);
}

function parseText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

async function fetchUkpnEcrRecords(): Promise<EcrRecord[]> {
  const cached = cache.get<EcrRecord[]>(UKPN_CACHE_KEY);
  if (cached) return cached;

  const apiKey = await resolveOdsApiKey("UKPN_ODS_API_KEY", "UKPN Open Data Portal");
  const records: EcrRecord[] = [];

  for (let offset = 0; ; offset += ODS_PAGE_LIMIT) {
    const params = new URLSearchParams({
      limit: String(ODS_PAGE_LIMIT),
      offset: String(offset),
      select: UKPN_SELECT_FIELDS,
      apikey: apiKey,
    });

    const response = await fetch(`${UKPN_ECR_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`UKPN ECR dataset fetch failed: HTTP ${response.status}`);
    }

    const json = (await response.json()) as { results?: UkpnEcrRawRecord[] };
    const page = Array.isArray(json.results) ? json.results : [];
    if (page.length === 0) break;

    guardJsonFields(
      page[0] as unknown as Record<string, unknown>,
      UKPN_GUARD_FIELDS,
      "UKPN Embedded Capacity Register",
    );

    for (const row of page) {
      const customerName = parseText(row.customer_name ?? undefined);
      const connectionStatus = parseText(row.connection_status ?? undefined);
      const lat = typeof row.latitude === "number" && Number.isFinite(row.latitude) ? row.latitude : null;
      const lon = typeof row.longitude === "number" && Number.isFinite(row.longitude) ? row.longitude : null;

      if (!customerName || !connectionStatus || lat === null || lon === null) {
        continue;
      }

      records.push({
        customer_name: customerName,
        energy_source: parseText(row.energy_source_1 ?? undefined),
        technology: parseText(row.energy_conversion_technology_1 ?? undefined),
        connection_status: connectionStatus,
        export_capacity_mw: parseNumericValue(row.maximum_export_capacity_mw),
        import_capacity_mw: parseNumericValue(row.maximum_import_capacity_mw),
        storage_capacity_mwh: parseNumericValue(row.storage_capacity_1_mwh),
        gsp: parseText(row.grid_supply_point ?? undefined),
        bsp: parseText(row.bulk_supply_point ?? undefined),
        primary_substation: parseText(row.primary ?? undefined),
        licence_area: row.licence_area?.trim() ?? "UKPN",
        voltage_kv: parseNumericValue(row.point_of_connection_poc_voltage_kv),
        lat,
        lon,
        operator: "UKPN",
      });
    }

    if (page.length < ODS_PAGE_LIMIT) break;
  }

  if (records.length === 0) {
    throw new Error("UKPN ECR dataset returned no valid records");
  }

  cache.set(UKPN_CACHE_KEY, records, TTL.STATIC_DATA);
  return records;
}

async function fetchSpenEcrRecords(): Promise<EcrRecord[]> {
  const cached = cache.get<EcrRecord[]>(SPEN_CACHE_KEY);
  if (cached) return cached;

  const apiKey = await resolveOdsApiKey("SPEN_ODS_API_KEY", "SP Energy Networks Open Data Portal");
  const records: EcrRecord[] = [];

  for (let offset = 0; ; offset += ODS_PAGE_LIMIT) {
    const params = new URLSearchParams({
      limit: String(ODS_PAGE_LIMIT),
      offset: String(offset),
      select: SPEN_SELECT_FIELDS,
      apikey: apiKey,
    });

    const response = await fetch(`${SPEN_ECR_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`SPEN ECR dataset fetch failed: HTTP ${response.status}`);
    }

    const json = (await response.json()) as { results?: SpenEcrRawRecord[] };
    const page = Array.isArray(json.results) ? json.results : [];
    if (page.length === 0) break;

    guardJsonFields(
      page[0] as unknown as Record<string, unknown>,
      SPEN_GUARD_FIELDS,
      "SPEN Embedded Capacity Register",
    );

    for (const row of page) {
      const customerName = parseText(row.customer_name ?? undefined);
      const connectionStatus = parseText(row.connection_status ?? undefined);

      if (!customerName || !connectionStatus) {
        continue;
      }

      records.push({
        customer_name: customerName,
        energy_source: parseText(row.energy_source_1 ?? undefined),
        technology: null,
        connection_status: connectionStatus,
        export_capacity_mw: parseNumberFromString(row.maximum_export_capacity_mw),
        import_capacity_mw: parseNumberFromString(row.maximum_import_capacity_mw),
        storage_capacity_mwh: parseNumberFromString(row.storage_capacity_1_mwh),
        gsp: parseText(row.grid_supply_point ?? undefined),
        bsp: null,
        primary_substation: null,
        licence_area: row.licence_area?.trim() ?? "SP Energy Networks",
        voltage_kv: parseNumberFromString(row.point_of_connection_poc_voltage_kv),
        lat: 0,
        lon: 0,
        operator: "SPEN",
      });
    }

    if (page.length < ODS_PAGE_LIMIT) break;
  }

  if (records.length === 0) {
    throw new Error("SPEN ECR dataset returned no valid records");
  }

  cache.set(SPEN_CACHE_KEY, records, TTL.STATIC_DATA);
  return records;
}

async function fetchEnwlEcrRecords(): Promise<EcrRecord[]> {
  const cached = cache.get<EcrRecord[]>(ENWL_CACHE_KEY);
  if (cached) return cached;

  const apiKey = await resolveOdsApiKey("ENWL_ODS_API_KEY", "Electricity North West Open Data Portal");
  const records: EcrRecord[] = [];

  for (let offset = 0; ; offset += ODS_PAGE_LIMIT) {
    const params = new URLSearchParams({
      limit: String(ODS_PAGE_LIMIT),
      offset: String(offset),
      select: ENWL_SELECT_FIELDS,
      apikey: apiKey,
    });

    const response = await fetch(`${ENWL_ECR_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`ENWL ECR dataset fetch failed: HTTP ${response.status}`);
    }

    const json = (await response.json()) as { results?: EnwlEcrRawRecord[] };
    const page = Array.isArray(json.results) ? json.results : [];
    if (page.length === 0) break;

    guardJsonFields(
      page[0] as unknown as Record<string, unknown>,
      ENWL_GUARD_FIELDS,
      "ENWL Embedded Capacity Register",
    );

    for (const row of page) {
      const customerName = parseText(row.customer_name ?? undefined);
      const connectionStatus = parseText(row.connection_status ?? undefined);
      const lat = typeof row.geopoint?.lat === "number" && Number.isFinite(row.geopoint.lat) ? row.geopoint.lat : null;
      const lon = typeof row.geopoint?.lon === "number" && Number.isFinite(row.geopoint.lon) ? row.geopoint.lon : null;

      if (!customerName || !connectionStatus || lat === null || lon === null) {
        continue;
      }

      records.push({
        customer_name: customerName,
        energy_source: parseText(row.energy_source_1 ?? undefined),
        technology: parseText(row.energy_conversion_technology_1 ?? undefined),
        connection_status: connectionStatus,
        export_capacity_mw: parseNumericValue(row.maximum_export_capacity_mw),
        import_capacity_mw: parseNumericValue(row.maximum_import_capacity_mw),
        storage_capacity_mwh: parseNumericValue(row.storage_capacity_1_mwh),
        gsp: parseText(row.grid_supply_point ?? undefined),
        bsp: parseText(row.bulk_supply_point ?? undefined),
        primary_substation: parseText(row.primary ?? undefined),
        licence_area: row.licence_area?.trim() ?? "Electricity North West",
        voltage_kv: parseNumericValue(row.point_of_connection_poc_voltage_kv),
        lat,
        lon,
        operator: "ENWL",
      });
    }

    if (page.length < ODS_PAGE_LIMIT) break;
  }

  if (records.length === 0) {
    throw new Error("ENWL ECR dataset returned no valid records");
  }

  cache.set(ENWL_CACHE_KEY, records, TTL.STATIC_DATA);
  return records;
}

function toEcrEntry(record: EcrRecord, distanceKm: number): EcrEntry {
  return {
    customer_name: record.customer_name,
    energy_source: record.energy_source,
    technology: record.technology,
    connection_status: record.connection_status,
    export_capacity_mw: record.export_capacity_mw,
    import_capacity_mw: record.import_capacity_mw,
    storage_capacity_mwh: record.storage_capacity_mwh,
    gsp: record.gsp,
    bsp: record.bsp,
    primary_substation: record.primary_substation,
    licence_area: record.licence_area,
    voltage_kv: record.voltage_kv,
    lat: record.lat,
    lon: record.lon,
    operator: record.operator,
    distance_km: Math.round(distanceKm * 100) / 100,
  };
}

function applyFilters(
  records: EcrRecord[],
  energySource: string | undefined,
  connectionStatus: string | undefined,
): EcrRecord[] {
  let filtered = records;

  if (energySource) {
    const needle = energySource.toLowerCase();
    filtered = filtered.filter(
      (r) => r.energy_source !== null && r.energy_source.toLowerCase().includes(needle),
    );
  }

  if (connectionStatus) {
    const needle = connectionStatus.toLowerCase();
    filtered = filtered.filter(
      (r) => r.connection_status.toLowerCase().includes(needle),
    );
  }

  return filtered;
}

function buildBreakdowns(
  entries: EcrEntry[],
): { energy_source_breakdown: Record<string, number>; status_breakdown: Record<string, number> } {
  const energy_source_breakdown: Record<string, number> = {};
  const status_breakdown: Record<string, number> = {};

  for (const entry of entries) {
    const source = entry.energy_source ?? "Unknown";
    energy_source_breakdown[source] = (energy_source_breakdown[source] ?? 0) + 1;

    const status = entry.connection_status;
    status_breakdown[status] = (status_breakdown[status] ?? 0) + 1;
  }

  return { energy_source_breakdown, status_breakdown };
}

function computeTotals(entries: EcrEntry[]): {
  total_export_mw: number;
  total_import_mw: number;
  total_storage_mwh: number;
} {
  let total_export_mw = 0;
  let total_import_mw = 0;
  let total_storage_mwh = 0;

  for (const entry of entries) {
    if (entry.export_capacity_mw !== null) total_export_mw += entry.export_capacity_mw;
    if (entry.import_capacity_mw !== null) total_import_mw += entry.import_capacity_mw;
    if (entry.storage_capacity_mwh !== null) total_storage_mwh += entry.storage_capacity_mwh;
  }

  return {
    total_export_mw: Math.round(total_export_mw * 1000) / 1000,
    total_import_mw: Math.round(total_import_mw * 1000) / 1000,
    total_storage_mwh: Math.round(total_storage_mwh * 1000) / 1000,
  };
}

type SupportedOperator = "UKPN" | "SPEN" | "ENWL";

function normalizeOperator(operator: string): SupportedOperator | "all" | null {
  const normalized = operator.trim().toUpperCase();

  if (normalized === "UKPN" || normalized === "UK POWER NETWORKS" || normalized === "UK_POWER_NETWORKS") {
    return "UKPN";
  }
  if (normalized === "SPEN" || normalized === "SP ENERGY NETWORKS" || normalized === "SP_ENERGY_NETWORKS" || normalized === "SCOTTISH POWER") {
    return "SPEN";
  }
  if (normalized === "ENWL" || normalized === "ELECTRICITY NORTH WEST" || normalized === "ENW") {
    return "ENWL";
  }
  if (normalized === "ALL") return "all";

  return null;
}

function getSourceMetadata(operator: SupportedOperator): GisSourceMetadata {
  const metadataKeyMap: Record<SupportedOperator, string> = {
    UKPN: "ukpn-embedded-capacity",
    SPEN: "spen-embedded-capacity",
    ENWL: "enwl-embedded-capacity",
  };
  const metadataKey = metadataKeyMap[operator];

  const fallbackMap: Record<SupportedOperator, GisSourceMetadata> = {
    UKPN: {
      id: metadataKey,
      name: "UKPN ECR",
      provider: "UK Power Networks",
      licence: "Open Data",
      url: "https://ukpowernetworks.opendatasoft.com/explore/dataset/ukpn-embedded-capacity-register/",
      api_key_required: true,
      coverage: "UKPN",
      update_frequency: "Periodic",
      reliability: "medium" as const,
      caveats: [],
      attribution: "UKPN",
    },
    SPEN: {
      id: metadataKey,
      name: "SPEN ECR",
      provider: "SP Energy Networks",
      licence: "Open Data",
      url: "https://spenergynetworks.opendatasoft.com/explore/dataset/embedded-capacity-register/",
      api_key_required: true,
      coverage: "SPEN",
      update_frequency: "Periodic",
      reliability: "medium" as const,
      caveats: [],
      attribution: "SPEN",
    },
    ENWL: {
      id: metadataKey,
      name: "ENWL ECR",
      provider: "Electricity North West",
      licence: "Open Data",
      url: "https://electricitynorthwest.opendatasoft.com/explore/dataset/enwl-embedded-capacity-register-2-1mw-and-above/",
      api_key_required: true,
      coverage: "ENWL",
      update_frequency: "Periodic",
      reliability: "medium" as const,
      caveats: [],
      attribution: "ENWL",
    },
  };

  return GIS_SOURCES[metadataKey] ?? fallbackMap[operator];
}

const DISCLAIMER =
  "This uses publicly available Embedded Capacity Register data as a planning signal only. " +
  "It is not a connection offer, a firm capacity reservation, or a substitute for a formal DNO application. " +
  "Register data may not reflect the latest connection agreements.";

export async function getEmbeddedCapacityRegister(
  params: z.infer<typeof embeddedCapacityRegisterSchema>,
): Promise<EcrResult> {
  const operator = normalizeOperator(params.operator);
  const radiusKm = Math.min(params.radius_km ?? DEFAULT_RADIUS_KM, 50);
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, 50);

  if (!operator) {
    throw new Error('Supported operators: "UKPN", "SPEN", "ENWL", "all".');
  }
  if (params.lat < -90 || params.lat > 90) throw new Error("Latitude must be between -90 and 90.");
  if (params.lon < -180 || params.lon > 180) throw new Error("Longitude must be between -180 and 180.");
  if (radiusKm <= 0) throw new Error("radius_km must be greater than 0.");
  if (limit <= 0) throw new Error("limit must be greater than 0.");

  // Fetch records based on operator
  let allRecords: EcrRecord[] = [];

  if (operator === "UKPN" || operator === "all") {
    const ukpnRecords = await fetchUkpnEcrRecords();
    allRecords = allRecords.concat(ukpnRecords);
  }

  if (operator === "SPEN" || operator === "all") {
    const spenRecords = await fetchSpenEcrRecords();
    allRecords = allRecords.concat(spenRecords);
  }

  if (operator === "ENWL" || operator === "all") {
    const enwlRecords = await fetchEnwlEcrRecords();
    allRecords = allRecords.concat(enwlRecords);
  }

  // Apply energy_source and connection_status filters
  const filtered = applyFilters(allRecords, params.energy_source, params.connection_status);

  // Spatial matching for UKPN and ENWL records (have coordinates), alphabetical for SPEN (no coordinates)
  const spatialFiltered = filtered.filter((r) => r.operator === "UKPN" || r.operator === "ENWL");
  const spenFiltered = filtered.filter((r) => r.operator === "SPEN");

  const spatialMatched = spatialFiltered
    .map((record) => ({
      record,
      distanceKm: haversineKm(params.lat, params.lon, record.lat, record.lon),
    }))
    .filter((match) => match.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .map((match) => toEcrEntry(match.record, match.distanceKm));

  const spenMatched = spenFiltered
    .slice()
    .sort((a, b) => a.customer_name.localeCompare(b.customer_name))
    .map((record) => toEcrEntry(record, 0));

  // Combine: spatial matches first (by distance), then SPEN (alphabetical)
  const allMatched = [...spatialMatched, ...spenMatched].slice(0, limit);

  const { energy_source_breakdown, status_breakdown } = buildBreakdowns(allMatched);
  const { total_export_mw, total_import_mw, total_storage_mwh } = computeTotals(allMatched);

  // Use the primary operator's metadata, or UKPN for "all"
  const metadataOperator: SupportedOperator = operator === "all" ? "UKPN" : operator;

  return {
    lat: params.lat,
    lon: params.lon,
    operator: operator === "all" ? "all" : operator,
    radius_km: radiusKm,
    total_matched: allMatched.length,
    total_export_mw,
    total_import_mw,
    total_storage_mwh,
    energy_source_breakdown,
    status_breakdown,
    entries: allMatched,
    source_metadata: getSourceMetadata(metadataOperator),
    disclaimer: DISCLAIMER,
  };
}
