import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";
import { lookupGspRegion, type GspLookupResult } from "../lib/neso-gsp.js";
import { guardJsonFields } from "../lib/schema-guard.js";

const cache = new TtlCache();

const NGED_CONNECTION_QUEUE_PACKAGE_URL =
  "https://connecteddata.nationalgrid.co.uk/api/3/action/package_show?id=connection-queue";
const NGED_TD_LIMITS_PACKAGE_URL =
  "https://connecteddata.nationalgrid.co.uk/api/3/action/package_show?id=asset-limits-pre-event-transmission-distribution-limits";
const NGED_DATASTORE_URL =
  "https://connecteddata.nationalgrid.co.uk/api/3/action/datastore_search";
const DEFAULT_RADIUS_KM = 25;
const DEFAULT_QUEUE_LIMIT = 20;

export const ngedConnectionSignalSchema = z.object({
  lat: z.number().describe("Latitude (-90 to 90). WGS84."),
  lon: z.number().describe("Longitude (-180 to 180). WGS84."),
  radius_km: z
    .number()
    .optional()
    .describe("GSP search radius in km (default 25, max 50)."),
  queue_limit: z
    .number()
    .optional()
    .describe("Maximum number of NGED queue rows to return (default 20, max 50)."),
  country: z.string().describe('Only "GB" is supported.'),
});

interface NgedPackageResource {
  id?: string;
  name?: string;
  datastore_active?: boolean;
}

interface NgedQueueRecordRaw {
  "Licence Area"?: string;
  GSP?: string;
  TANM?: string | boolean;
  DANM?: string | boolean;
  Status?: string;
  "Bus Number"?: number | string;
  "Bus Name"?: string;
  "Site ID"?: number | string;
  "Application ID"?: number | string;
  "Site Export Capacity (MW)"?: number | string;
  "Site Import Capacity (MW)"?: number | string;
  "Machine Export Capacity (MW)"?: number | string;
  "Machine Import Capacity (MW)"?: number | string;
  "Fuel type"?: string;
  "Machine ID"?: string;
  Position?: number | string;
}

interface NgedTdLimitRecordRaw {
  "GSP Name"?: string;
  "From Bus Number"?: number | string;
  "To Bus Number"?: number | string;
  "Tertiary Bus Number"?: number | string;
  "From Bus Name"?: string;
  "To Bus Name"?: string;
  "Tertiary Bus Name"?: string;
  "Circuit ID"?: string;
  Season?: string;
  "Import TL MW"?: number | string;
  "Export TL MW"?: number | string;
  "Import CAFPL MVA"?: number | string;
  "Export CARPL MVA"?: number | string;
}

interface NearestGspResult {
  gsp_id: string;
  gsp_name: string;
  distance_km: number;
  region_id: string;
  region_name: string;
}

interface NgedQueueProject {
  licence_area: string | null;
  gsp: string | null;
  tanm: boolean | null;
  danm: boolean | null;
  status: string | null;
  bus_number: number | null;
  bus_name: string | null;
  site_id: number | null;
  application_id: number | null;
  site_export_capacity_mw: number | null;
  site_import_capacity_mw: number | null;
  machine_export_capacity_mw: number | null;
  machine_import_capacity_mw: number | null;
  fuel_type: string | null;
  machine_id: string | null;
  position: number | null;
}

interface NgedQueueSignal {
  resource_name: string;
  summary: {
    matched_projects: number;
    returned_projects: number;
    total_site_export_capacity_mw: number;
    total_site_import_capacity_mw: number;
    status_breakdown: Record<string, number>;
    fuel_type_breakdown: Record<string, number>;
  };
  projects: NgedQueueProject[];
}

interface NgedTdLimitRow {
  gsp_name: string | null;
  from_bus_number: number | null;
  to_bus_number: number | null;
  tertiary_bus_number: number | null;
  from_bus_name: string | null;
  to_bus_name: string | null;
  tertiary_bus_name: string | null;
  circuit_id: string | null;
  season: string | null;
  import_tl_mw: number | null;
  export_tl_mw: number | null;
  import_cafpl_mva: number | null;
  export_carpl_mva: number | null;
}

interface NgedTdLimitSignal {
  resource_name: string;
  summary: {
    matched_rows: number;
    seasons: string[];
    min_import_tl_mw: number | null;
    max_export_tl_mw: number | null;
  };
  rows: NgedTdLimitRow[];
}

interface NgedConnectionSignalResult {
  lat: number;
  lon: number;
  country: string;
  nearest_gsp: NearestGspResult | null;
  queue_signal: NgedQueueSignal | null;
  td_limits: NgedTdLimitSignal | null;
  confidence_notes: string[];
  source_metadata: {
    gsp_lookup: GisSourceMetadata;
    queue_signal: GisSourceMetadata;
    td_limits: GisSourceMetadata;
  };
  disclaimer: string;
}

interface SectionLookupResult<T> {
  data: T | null;
  status: "ok" | "not_covered" | "failed";
}

const DISCLAIMER =
  "This tool uses NGED's public Connection Queue and Asset Limits datasets as GSP-level planning signals only. " +
  "It does not provide DNO headroom, a connection offer, or a firm capacity right. " +
  "Always verify with NGED before making siting or connection decisions.";

export function resetNgedConnectionSignalCacheForTests(): void {
  cache.clear();
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseText(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const trimmed = String(value ?? "").trim();
  if (!trimmed.length) return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: unknown): number | null {
  const parsed = parseNumber(value);
  if (parsed === null) return null;
  const integer = Math.trunc(parsed);
  return Number.isFinite(integer) ? integer : null;
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const trimmed = String(value ?? "").trim().toLowerCase();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

async function fetchPackageResources(
  cacheKey: string,
  url: string,
  datasetName: string,
): Promise<NgedPackageResource[]> {
  const cached = cache.get<NgedPackageResource[]>(cacheKey);
  if (cached) return cached;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${datasetName} package lookup failed: HTTP ${response.status}`);
  }

  const json = await response.json() as {
    success?: boolean;
    result?: { resources?: NgedPackageResource[] };
  };

  if (!json.success) {
    throw new Error(`${datasetName} package lookup failed`);
  }

  const resources = Array.isArray(json.result?.resources) ? json.result.resources : [];
  cache.set(cacheKey, resources, TTL.CAPACITY);
  return resources;
}

async function fetchDatastoreRecords<T extends object>(
  cacheKey: string,
  resourceId: string,
  datasetName: string,
  expectedFields: readonly string[],
): Promise<T[]> {
  const cached = cache.get<T[]>(cacheKey);
  if (cached) return cached;

  const response = await fetch(`${NGED_DATASTORE_URL}?resource_id=${resourceId}&limit=5000`);
  if (!response.ok) {
    throw new Error(`${datasetName} datastore fetch failed: HTTP ${response.status}`);
  }

  const json = await response.json() as {
    success?: boolean;
    result?: { records?: T[] };
  };

  if (!json.success) {
    throw new Error(`${datasetName} datastore request failed`);
  }

  const records = Array.isArray(json.result?.records) ? json.result.records : [];
  if (records.length > 0) {
    guardJsonFields(records[0] as Record<string, unknown>, expectedFields, datasetName);
  }

  cache.set(cacheKey, records, TTL.CAPACITY);
  return records;
}

function findQueueResource(
  resources: NgedPackageResource[],
  regionName: string,
): NgedPackageResource | null {
  const target = normalizeLabel(regionName);
  return (
    resources.find((resource) =>
      Boolean(resource.datastore_active) &&
      normalizeLabel(resource.name ?? "") === target,
    ) ?? null
  );
}

function findTdLimitResource(
  resources: NgedPackageResource[],
  regionName: string,
): NgedPackageResource | null {
  const target = `${normalizeLabel(regionName)}tdlimits`;
  return (
    resources.find((resource) =>
      Boolean(resource.datastore_active) &&
      normalizeLabel(resource.name ?? "") === target,
    ) ?? null
  );
}

function toQueueProject(record: NgedQueueRecordRaw): NgedQueueProject {
  return {
    licence_area: parseText(record["Licence Area"]),
    gsp: parseText(record.GSP),
    tanm: parseBoolean(record.TANM),
    danm: parseBoolean(record.DANM),
    status: parseText(record.Status),
    bus_number: parseInteger(record["Bus Number"]),
    bus_name: parseText(record["Bus Name"]),
    site_id: parseInteger(record["Site ID"]),
    application_id: parseInteger(record["Application ID"]),
    site_export_capacity_mw: parseNumber(record["Site Export Capacity (MW)"]),
    site_import_capacity_mw: parseNumber(record["Site Import Capacity (MW)"]),
    machine_export_capacity_mw: parseNumber(record["Machine Export Capacity (MW)"]),
    machine_import_capacity_mw: parseNumber(record["Machine Import Capacity (MW)"]),
    fuel_type: parseText(record["Fuel type"]),
    machine_id: parseText(record["Machine ID"]),
    position: parseInteger(record.Position),
  };
}

function toTdLimitRow(record: NgedTdLimitRecordRaw): NgedTdLimitRow {
  return {
    gsp_name: parseText(record["GSP Name"]),
    from_bus_number: parseInteger(record["From Bus Number"]),
    to_bus_number: parseInteger(record["To Bus Number"]),
    tertiary_bus_number: parseInteger(record["Tertiary Bus Number"]),
    from_bus_name: parseText(record["From Bus Name"]),
    to_bus_name: parseText(record["To Bus Name"]),
    tertiary_bus_name: parseText(record["Tertiary Bus Name"]),
    circuit_id: parseText(record["Circuit ID"]),
    season: parseText(record.Season),
    import_tl_mw: parseNumber(record["Import TL MW"]),
    export_tl_mw: parseNumber(record["Export TL MW"]),
    import_cafpl_mva: parseNumber(record["Import CAFPL MVA"]),
    export_carpl_mva: parseNumber(record["Export CARPL MVA"]),
  };
}

function summariseBreakdown(values: Array<string | null>): Record<string, number> {
  const breakdown = new Map<string, number>();

  for (const value of values) {
    if (!value) continue;
    breakdown.set(value, (breakdown.get(value) ?? 0) + 1);
  }

  return Object.fromEntries([...breakdown.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

async function queryQueueSignal(
  gspResult: GspLookupResult,
  queueLimit: number,
): Promise<SectionLookupResult<NgedQueueSignal>> {
  try {
    const resources = await fetchPackageResources(
      "nged-connection-queue:resources",
      NGED_CONNECTION_QUEUE_PACKAGE_URL,
      "NGED Connection Queue",
    );
    const resource = findQueueResource(resources, gspResult.region_name);
    if (!resource?.id || !resource.name) {
      return { data: null, status: "not_covered" };
    }

    const records = await fetchDatastoreRecords<NgedQueueRecordRaw>(
      `nged-connection-queue:${resource.id}`,
      resource.id,
      "NGED Connection Queue",
      [
        "Licence Area",
        "GSP",
        "Status",
        "Site Export Capacity (MW)",
        "Fuel type",
      ],
    );

    const projects = records.map(toQueueProject);
    return {
      status: "ok",
      data: {
        resource_name: resource.name,
        summary: {
          matched_projects: projects.length,
          returned_projects: Math.min(projects.length, queueLimit),
          total_site_export_capacity_mw: round1(
            projects.reduce((sum, project) => sum + (project.site_export_capacity_mw ?? 0), 0),
          ),
          total_site_import_capacity_mw: round1(
            projects.reduce((sum, project) => sum + (project.site_import_capacity_mw ?? 0), 0),
          ),
          status_breakdown: summariseBreakdown(projects.map((project) => project.status)),
          fuel_type_breakdown: summariseBreakdown(projects.map((project) => project.fuel_type)),
        },
        projects: projects.slice(0, queueLimit),
      },
    };
  } catch {
    return { data: null, status: "failed" };
  }
}

async function queryTdLimits(
  gspResult: GspLookupResult,
): Promise<SectionLookupResult<NgedTdLimitSignal>> {
  try {
    const resources = await fetchPackageResources(
      "nged-td-limits:resources",
      NGED_TD_LIMITS_PACKAGE_URL,
      "NGED Asset Limits",
    );
    const resource = findTdLimitResource(resources, gspResult.region_name);
    if (!resource?.id || !resource.name) {
      return { data: null, status: "not_covered" };
    }

    const records = await fetchDatastoreRecords<NgedTdLimitRecordRaw>(
      `nged-td-limits:${resource.id}`,
      resource.id,
      "NGED Asset Limits",
      [
        "GSP Name",
        "Season",
        "Import TL MW",
        "Export TL MW",
      ],
    );

    const rows = records.map(toTdLimitRow);
    const importValues = rows
      .map((row) => row.import_tl_mw)
      .filter((value): value is number => typeof value === "number");
    const exportValues = rows
      .map((row) => row.export_tl_mw)
      .filter((value): value is number => typeof value === "number");

    return {
      status: "ok",
      data: {
        resource_name: resource.name,
        summary: {
          matched_rows: rows.length,
          seasons: [...new Set(rows.map((row) => row.season).filter((value): value is string => Boolean(value)))].sort(),
          min_import_tl_mw: importValues.length ? Math.min(...importValues) : null,
          max_export_tl_mw: exportValues.length ? Math.max(...exportValues) : null,
        },
        rows,
      },
    };
  } catch {
    return { data: null, status: "failed" };
  }
}

function buildConfidenceNotes(
  gspResult: GspLookupResult | null,
  queueStatus: SectionLookupResult<NgedQueueSignal>["status"],
  tdLimitStatus: SectionLookupResult<NgedTdLimitSignal>["status"],
): string[] {
  const notes = [
    "GSP lookup uses NESO region polygons when available, with nearest-point fallback if boundaries do not resolve a match",
    "NGED queue rows are project or machine records and should not be treated as available connection capacity",
    "NGED TD-limit rows describe seasonal transfer limits at a GSP boundary, not spare connection headroom",
    "NGED queue data can fail independently of NGED TD-limit data; null sections indicate upstream fetch or schema issues.",
  ];

  if (!gspResult) {
    notes.push("No GSP found within search radius");
    return notes;
  }

  if (queueStatus === "not_covered" && tdLimitStatus === "not_covered") {
    notes.push("Matched GSP is not covered by the current NGED public queue or TD-limit resources.");
  }

  return notes;
}

export async function getNgedConnectionSignal(
  params: z.infer<typeof ngedConnectionSignalSchema>,
): Promise<NgedConnectionSignalResult> {
  const { lat, lon, country } = params;
  const radiusKm = params.radius_km ?? DEFAULT_RADIUS_KM;
  const queueLimit = params.queue_limit ?? DEFAULT_QUEUE_LIMIT;

  if (country.toUpperCase() !== "GB") {
    throw new Error('Only country "GB" is supported for NGED connection signal.');
  }

  if (lat < -90 || lat > 90) throw new Error("Latitude must be between -90 and 90.");
  if (lon < -180 || lon > 180) throw new Error("Longitude must be between -180 and 180.");
  if (radiusKm <= 0 || radiusKm > 50) throw new Error("radius_km must be between 0 and 50.");
  if (queueLimit <= 0 || queueLimit > 50) throw new Error("queue_limit must be between 1 and 50.");

  const gspResult = await lookupGspRegion(lat, lon, radiusKm);

  const queueResult = gspResult
    ? await queryQueueSignal(gspResult, queueLimit)
    : { data: null, status: "not_covered" as const };
  const tdLimitResult = gspResult
    ? await queryTdLimits(gspResult)
    : { data: null, status: "not_covered" as const };

  return {
    lat,
    lon,
    country: "GB",
    nearest_gsp: gspResult
      ? {
          gsp_id: gspResult.gsp_id,
          gsp_name: gspResult.gsp_name,
          distance_km: gspResult.distance_km,
          region_id: gspResult.region_id,
          region_name: gspResult.region_name,
        }
      : null,
    queue_signal: queueResult.data,
    td_limits: tdLimitResult.data,
    confidence_notes: buildConfidenceNotes(gspResult, queueResult.status, tdLimitResult.status),
    source_metadata: {
      gsp_lookup: GIS_SOURCES["neso-gsp-lookup"],
      queue_signal: GIS_SOURCES["nged-connection-queue"],
      td_limits: GIS_SOURCES["nged-asset-limits"],
    },
    disclaimer: DISCLAIMER,
  };
}
