import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";
import { guardJsonFields } from "../lib/schema-guard.js";

const cache = new TtlCache();
const NESO_TEC_RESOURCE_ID = "17becbab-e3e8-473f-b303-3806f43a6a10";
const NESO_TEC_DATASTORE_URL =
  `https://api.neso.energy/api/3/action/datastore_search?resource_id=${NESO_TEC_RESOURCE_ID}&limit=5000`;

export const gridConnectionQueueSchema = z.object({
  connection_site_query: z
    .string()
    .optional()
    .describe("Case-insensitive substring match on NESO Connection Site, for example \"Berkswell\"."),
  project_name_query: z
    .string()
    .optional()
    .describe("Case-insensitive substring match on Project Name."),
  host_to: z
    .string()
    .optional()
    .describe('Filter by host transmission owner, for example "NGET", "SPT", or "SHET".'),
  plant_type: z
    .string()
    .optional()
    .describe('Case-insensitive exact match on Plant Type, for example "Solar" or "Energy Storage System".'),
  project_status: z
    .string()
    .optional()
    .describe('Case-insensitive exact match on Project Status, for example "Scoping" or "Awaiting Consents".'),
  agreement_type: z
    .string()
    .optional()
    .describe('Case-insensitive exact match on Agreement Type, for example "Embedded" or "Directly Connected".'),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of matched projects to return (default 20, max 50)."),
});

interface NesoTecRecordRaw {
  "Project Name"?: string;
  "Customer Name"?: string;
  "Connection Site"?: string;
  "Stage"?: number | null;
  "MW Connected"?: number | null;
  "MW Increase / Decrease"?: number | null;
  "Cumulative Total Capacity (MW)"?: number | null;
  "MW Effective From"?: string | null;
  "Project Status"?: string;
  "Agreement Type"?: string;
  "HOST TO"?: string;
  "Plant Type"?: string;
  "Project ID"?: string;
  "Project Number"?: string;
  "Gate"?: number | null;
}

interface ProjectMatch {
  project_name: string;
  customer_name: string | null;
  connection_site: string;
  stage: number | null;
  mw_connected: number;
  mw_increase_decrease: number;
  cumulative_total_capacity_mw: number;
  mw_effective_from: string | null;
  project_status: string | null;
  agreement_type: string | null;
  host_to: string | null;
  plant_type: string | null;
  project_id: string | null;
  project_number: string | null;
  gate: number | null;
}

interface ConnectionSiteSummary {
  connection_site: string;
  project_count: number;
  total_net_change_mw: number;
  total_connected_mw: number;
  total_cumulative_capacity_mw: number;
  plant_types: string[];
  project_statuses: string[];
  earliest_effective_from: string | null;
}

interface GridConnectionQueueResult {
  filters: {
    connection_site_query: string | null;
    project_name_query: string | null;
    host_to: string | null;
    plant_type: string | null;
    project_status: string | null;
    agreement_type: string | null;
  };
  summary: {
    matched_projects: number;
    returned_projects: number;
    total_connected_mw: number;
    total_net_change_mw: number;
    total_cumulative_capacity_mw: number;
    earliest_effective_from: string | null;
    latest_effective_from: string | null;
  };
  connection_sites: ConnectionSiteSummary[];
  projects: ProjectMatch[];
  source_metadata: GisSourceMetadata;
  disclaimer: string;
}

const DISCLAIMER =
  "This uses the public NESO Transmission Entry Capacity register as a GB transmission-level connection signal. " +
  "It is not a DNO headroom map, queue-position guarantee, or connection offer. " +
  "Connection site names reflect NESO register naming and may not match local substation labels exactly.";

export function resetGridConnectionQueueCacheForTests(): void {
  cache.clear();
}

function normaliseText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function toProject(record: NesoTecRecordRaw): ProjectMatch {
  return {
    project_name: record["Project Name"] ?? "Unknown project",
    customer_name: record["Customer Name"] ?? null,
    connection_site: record["Connection Site"] ?? "Unknown connection site",
    stage: typeof record.Stage === "number" ? record.Stage : null,
    mw_connected: typeof record["MW Connected"] === "number" ? record["MW Connected"] : 0,
    mw_increase_decrease:
      typeof record["MW Increase / Decrease"] === "number" ? record["MW Increase / Decrease"] : 0,
    cumulative_total_capacity_mw:
      typeof record["Cumulative Total Capacity (MW)"] === "number"
        ? record["Cumulative Total Capacity (MW)"]
        : 0,
    mw_effective_from: record["MW Effective From"] ?? null,
    project_status: record["Project Status"] ?? null,
    agreement_type: record["Agreement Type"] ?? null,
    host_to: record["HOST TO"] ?? null,
    plant_type: record["Plant Type"] ?? null,
    project_id: record["Project ID"] ?? null,
    project_number: record["Project Number"] ?? null,
    gate: typeof record.Gate === "number" ? record.Gate : null,
  };
}

async function fetchNesoTecRegister(): Promise<ProjectMatch[]> {
  const cached = cache.get<ProjectMatch[]>("neso-tec-register:all");
  if (cached) return cached;

  const response = await fetch(NESO_TEC_DATASTORE_URL);
  if (!response.ok) {
    throw new Error(`NESO API returned ${response.status}`);
  }

  const json = await response.json() as {
    success?: boolean;
    result?: { records?: NesoTecRecordRaw[] };
    error?: { message?: string };
  };

  if (!json.success) {
    throw new Error(json.error?.message ?? "NESO datastore request failed");
  }

  const records = Array.isArray(json.result?.records) ? json.result.records : [];

  if (records.length > 0) {
    guardJsonFields(
      records[0] as Record<string, unknown>,
      [
        "Project Name",
        "Connection Site",
        "MW Connected",
        "MW Increase / Decrease",
        "Cumulative Total Capacity (MW)",
        "Project Status",
        "HOST TO",
        "Plant Type",
      ],
      "NESO TEC Register",
    );
  }

  const projects = records.map(toProject);
  cache.set("neso-tec-register:all", projects, TTL.STATIC_DATA);
  return projects;
}

function matchesExactFilter(value: string | null, filter: string | undefined): boolean {
  if (!filter) return true;
  return normaliseText(value ?? undefined) === normaliseText(filter);
}

function matchesSubstring(value: string | null, query: string | undefined): boolean {
  if (!query) return true;
  return normaliseText(value ?? undefined).includes(normaliseText(query));
}

function summariseConnectionSites(projects: ProjectMatch[]): ConnectionSiteSummary[] {
  const grouped = new Map<string, ProjectMatch[]>();
  for (const project of projects) {
    const existing = grouped.get(project.connection_site) ?? [];
    existing.push(project);
    grouped.set(project.connection_site, existing);
  }

  return [...grouped.entries()]
    .map(([connectionSite, siteProjects]) => {
      const dates = siteProjects
        .map((p) => p.mw_effective_from)
        .filter((d): d is string => typeof d === "string" && d.length > 0)
        .sort();

      return {
        connection_site: connectionSite,
        project_count: siteProjects.length,
        total_net_change_mw: round1(siteProjects.reduce((sum, p) => sum + p.mw_increase_decrease, 0)),
        total_connected_mw: round1(siteProjects.reduce((sum, p) => sum + p.mw_connected, 0)),
        total_cumulative_capacity_mw: round1(
          siteProjects.reduce((sum, p) => sum + p.cumulative_total_capacity_mw, 0),
        ),
        plant_types: [...new Set(siteProjects.map((p) => p.plant_type).filter((v): v is string => Boolean(v)))].sort(),
        project_statuses: [...new Set(siteProjects.map((p) => p.project_status).filter((v): v is string => Boolean(v)))].sort(),
        earliest_effective_from: dates[0] ?? null,
      };
    })
    .sort((a, b) => b.total_net_change_mw - a.total_net_change_mw);
}

export async function getGridConnectionQueue(
  params: z.infer<typeof gridConnectionQueueSchema>,
): Promise<GridConnectionQueueResult> {
  const limit = params.limit ?? 20;
  if (limit <= 0 || limit > 50) {
    throw new Error("limit must be between 1 and 50.");
  }

  if (
    !params.connection_site_query &&
    !params.project_name_query &&
    !params.host_to &&
    !params.plant_type &&
    !params.project_status &&
    !params.agreement_type
  ) {
    throw new Error(
      "At least one filter is required: connection_site_query, project_name_query, host_to, plant_type, project_status, or agreement_type.",
    );
  }

  let projects: ProjectMatch[];
  try {
    projects = await fetchNesoTecRegister();
  } catch (error) {
    throw new Error(
      `NESO TEC register query failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const matched = projects.filter((project) => {
    return (
      matchesSubstring(project.connection_site, params.connection_site_query) &&
      matchesSubstring(project.project_name, params.project_name_query) &&
      matchesExactFilter(project.host_to, params.host_to) &&
      matchesExactFilter(project.plant_type, params.plant_type) &&
      matchesExactFilter(project.project_status, params.project_status) &&
      matchesExactFilter(project.agreement_type, params.agreement_type)
    );
  });

  matched.sort((a, b) => {
    const dateA = a.mw_effective_from ?? "9999-12-31";
    const dateB = b.mw_effective_from ?? "9999-12-31";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return b.mw_increase_decrease - a.mw_increase_decrease;
  });

  const dates = matched
    .map((p) => p.mw_effective_from)
    .filter((d): d is string => typeof d === "string" && d.length > 0)
    .sort();

  return {
    filters: {
      connection_site_query: params.connection_site_query ?? null,
      project_name_query: params.project_name_query ?? null,
      host_to: params.host_to ?? null,
      plant_type: params.plant_type ?? null,
      project_status: params.project_status ?? null,
      agreement_type: params.agreement_type ?? null,
    },
    summary: {
      matched_projects: matched.length,
      returned_projects: Math.min(matched.length, limit),
      total_connected_mw: round1(matched.reduce((sum, p) => sum + p.mw_connected, 0)),
      total_net_change_mw: round1(matched.reduce((sum, p) => sum + p.mw_increase_decrease, 0)),
      total_cumulative_capacity_mw: round1(
        matched.reduce((sum, p) => sum + p.cumulative_total_capacity_mw, 0),
      ),
      earliest_effective_from: dates[0] ?? null,
      latest_effective_from: dates[dates.length - 1] ?? null,
    },
    connection_sites: summariseConnectionSites(matched),
    projects: matched.slice(0, limit),
    source_metadata: GIS_SOURCES["neso-tec-register"],
    disclaimer: DISCLAIMER,
  };
}
