import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";
import { guardJsonFields } from "../lib/schema-guard.js";
import { resolveApiKey, ConfigurationError } from "../lib/auth.js";

const cache = new TtlCache();

const QUEUE_DATASET_URL =
  "https://spenergynetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/gsp-queue-position/records";
const DG_DATASET_URL =
  "https://spenergynetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/spd-dg-connections-network-info/records";
const CURTAILMENT_DATASET_URL =
  "https://spenergynetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/capacity-management-system/records";

const QUEUE_CACHE_KEY = "spen-gsp-queue:all";
const DG_CACHE_KEY = "spen-dg-capacity:all";
const CURTAILMENT_CACHE_KEY_PREFIX = "spen-curtailment:";

const ODS_PAGE_LIMIT = 100;
const DEFAULT_DAYS = 90;
const MAX_DAYS = 365;

const QUEUE_SELECT_FIELDS = [
  "unique_id",
  "generator_type",
  "export_capacity_mw",
  "licence_area",
  "gsp_name",
].join(",");

const DG_SELECT_FIELDS = [
  "district",
  "gsp",
  "total_gsp_capacity_mw",
  "remaining_export_capacity_mw_firm_non_firm",
  "remaining_import_capacity_mw_firm_non_firm",
  "fault_level_headroom",
  "estimated_connection_date",
  "estimated_cost_for_reinforcement_works",
].join(",");

const CURTAILMENT_SELECT_FIELDS = [
  "site_name",
  "date",
  "generation_lost",
  "network_management_scheme",
].join(",");

export const spenGridIntelligenceSchema = z.object({
  gsp_name: z
    .string()
    .optional()
    .describe("Filter by GSP name (case-insensitive substring match)."),
  days: z
    .number()
    .optional()
    .describe(
      "Days of curtailment history (default 90, max 365). Only affects capacity management data.",
    ),
});

// ── Raw record shapes ──

interface QueueRawRecord {
  unique_id?: string | null;
  generator_type?: string | null;
  export_capacity_mw?: number | string | null;
  licence_area?: string | null;
  gsp_name?: string | null;
}

interface DgRawRecord {
  district?: string | null;
  gsp?: string | null;
  total_gsp_capacity_mw?: number | string | null;
  remaining_export_capacity_mw_firm_non_firm?: number | string | null;
  remaining_import_capacity_mw_firm_non_firm?: number | string | null;
  fault_level_headroom?: string | null;
  estimated_connection_date?: string | null;
  estimated_cost_for_reinforcement_works?: string | null;
}

interface CurtailmentRawRecord {
  site_name?: string | null;
  date?: string | null;
  generation_lost?: number | string | null;
  network_management_scheme?: string | null;
}

// ── Result shapes ──

interface SpenGspQueueEntry {
  gsp_name: string;
  licence_area: string;
  generator_type: string;
  export_capacity_mw: number;
}

interface SpenDgCapacity {
  district: string;
  gsp: string;
  total_capacity_mw: number;
  remaining_export_mw: number;
  remaining_import_mw: number;
  fault_level_headroom: string | null;
  estimated_connection_date: string | null;
  reinforcement_cost: string | null;
}

interface SpenCurtailmentEvent {
  site_name: string;
  date: string;
  generation_lost_mw: number;
  scheme: string | null;
}

interface SpenGridIntelligenceResult {
  gsp_filter: string | null;
  queue: {
    total_projects: number;
    total_export_mw: number;
    type_breakdown: Record<string, { count: number; mw: number }>;
    entries: SpenGspQueueEntry[];
  };
  dg_capacity: {
    gsps_covered: number;
    entries: SpenDgCapacity[];
  };
  curtailment: {
    period_days: number;
    total_events: number;
    total_generation_lost_mw: number;
    entries: SpenCurtailmentEvent[];
  };
  source_metadata: {
    queue: GisSourceMetadata;
    dg_capacity: GisSourceMetadata;
    curtailment: GisSourceMetadata;
  };
  disclaimer: string;
}

// ── Source metadata ──

const QUEUE_SOURCE: GisSourceMetadata = {
  id: "spen-gsp-queue",
  name: "SPEN GSP Queue Position",
  provider: "SP Energy Networks",
  licence: "Open Data (free registration required for API access)",
  url: "https://spenergynetworks.opendatasoft.com/explore/dataset/gsp-queue-position/",
  api_key_required: true,
  coverage: "SPEN licence areas: SP Distribution and SP Manweb",
  update_frequency: "Published periodically by SPEN",
  reliability: "medium",
  caveats: [
    "Queue entries reflect contracted positions, not guaranteed connection dates",
    "Export capacity is declared capacity, not operational output",
  ],
  attribution: "Contains data from SP Energy Networks.",
};

const DG_SOURCE: GisSourceMetadata = {
  id: "spen-dg-capacity",
  name: "SPEN DG Connections Network Info",
  provider: "SP Energy Networks",
  licence: "Open Data (free registration required for API access)",
  url: "https://spenergynetworks.opendatasoft.com/explore/dataset/spd-dg-connections-network-info/",
  api_key_required: true,
  coverage: "SPD licence area only (Central and South Scotland)",
  update_frequency: "Published periodically by SPEN",
  reliability: "medium",
  caveats: [
    "Covers SPD licence area only, not SP Manweb",
    "Remaining capacity figures are planning estimates, not real-time",
    "Reinforcement cost estimates are indicative only",
  ],
  attribution: "Contains data from SP Energy Networks.",
};

const CURTAILMENT_SOURCE: GisSourceMetadata = {
  id: "spen-curtailment",
  name: "SPEN Capacity Management System",
  provider: "SP Energy Networks",
  licence: "Open Data (free registration required for API access)",
  url: "https://spenergynetworks.opendatasoft.com/explore/dataset/capacity-management-system/",
  api_key_required: true,
  coverage: "SPEN licence areas: SP Distribution and SP Manweb",
  update_frequency: "Published periodically by SPEN",
  reliability: "medium",
  caveats: [
    "Generation lost values are reported per event, not aggregated daily",
    "Network management scheme may be null for older records",
  ],
  attribution: "Contains data from SP Energy Networks.",
};

// ── Helpers ──

function escapeOdsString(value: string): string {
  return value.replace(/'/g, "''");
}

function parseNumeric(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseText(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function resolveOdsApiKey(): Promise<string> {
  try {
    return await resolveApiKey("SPEN_ODS_API_KEY");
  } catch (err) {
    if (err instanceof ConfigurationError) {
      throw new Error(
        "SP Energy Networks Open Data Portal requires a free API key. " +
          "Register at the portal, then set SPEN_ODS_API_KEY in ~/.luminus/keys.json or as an environment variable.",
      );
    }
    throw err;
  }
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ── Paginated ODS fetch ──

async function fetchOdsPages<T>(
  baseUrl: string,
  apiKey: string,
  selectFields: string,
  whereClause: string | null,
  schemaGuardFields: readonly string[],
  schemaGuardLabel: string,
): Promise<T[]> {
  const all: T[] = [];

  for (let offset = 0; ; offset += ODS_PAGE_LIMIT) {
    const params = new URLSearchParams({
      limit: String(ODS_PAGE_LIMIT),
      offset: String(offset),
      select: selectFields,
      apikey: apiKey,
    });
    if (whereClause) {
      params.set("where", whereClause);
    }

    const response = await fetch(`${baseUrl}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`${schemaGuardLabel} fetch failed: HTTP ${response.status}`);
    }

    const json = (await response.json()) as { results?: T[] };
    const page = Array.isArray(json.results) ? json.results : [];
    if (page.length === 0) break;

    guardJsonFields(
      page[0] as unknown as Record<string, unknown>,
      schemaGuardFields,
      schemaGuardLabel,
    );

    all.push(...page);
    if (page.length < ODS_PAGE_LIMIT) break;
  }

  return all;
}

// ── Section fetchers ──

async function fetchQueueEntries(
  apiKey: string,
  gspFilter: string | null,
): Promise<SpenGspQueueEntry[]> {
  const cacheKey = gspFilter
    ? `${QUEUE_CACHE_KEY}:${gspFilter.toLowerCase()}`
    : QUEUE_CACHE_KEY;
  const cached = cache.get<SpenGspQueueEntry[]>(cacheKey);
  if (cached) return cached;

  const where = gspFilter
    ? `gsp_name like '%${escapeOdsString(gspFilter)}%'`
    : null;

  const rows = await fetchOdsPages<QueueRawRecord>(
    QUEUE_DATASET_URL,
    apiKey,
    QUEUE_SELECT_FIELDS,
    where,
    ["generator_type", "export_capacity_mw", "gsp_name"],
    "SPEN GSP Queue Position",
  );

  const entries: SpenGspQueueEntry[] = [];
  for (const row of rows) {
    const gspName = parseText(row.gsp_name ?? undefined);
    if (!gspName) continue;

    entries.push({
      gsp_name: gspName,
      licence_area: parseText(row.licence_area ?? undefined) ?? "Unknown",
      generator_type: parseText(row.generator_type ?? undefined) ?? "Unknown",
      export_capacity_mw: parseNumeric(row.export_capacity_mw),
    });
  }

  cache.set(cacheKey, entries, TTL.STATIC_DATA);
  return entries;
}

async function fetchDgCapacity(
  apiKey: string,
  gspFilter: string | null,
): Promise<SpenDgCapacity[]> {
  const cacheKey = gspFilter
    ? `${DG_CACHE_KEY}:${gspFilter.toLowerCase()}`
    : DG_CACHE_KEY;
  const cached = cache.get<SpenDgCapacity[]>(cacheKey);
  if (cached) return cached;

  const where = gspFilter
    ? `gsp like '%${escapeOdsString(gspFilter)}%'`
    : null;

  const rows = await fetchOdsPages<DgRawRecord>(
    DG_DATASET_URL,
    apiKey,
    DG_SELECT_FIELDS,
    where,
    ["gsp", "total_gsp_capacity_mw", "remaining_export_capacity_mw_firm_non_firm"],
    "SPEN DG Connections Network Info",
  );

  const entries: SpenDgCapacity[] = [];
  for (const row of rows) {
    const gsp = parseText(row.gsp ?? undefined);
    if (!gsp) continue;

    entries.push({
      district: parseText(row.district ?? undefined) ?? "Unknown",
      gsp,
      total_capacity_mw: parseNumeric(row.total_gsp_capacity_mw),
      remaining_export_mw: parseNumeric(row.remaining_export_capacity_mw_firm_non_firm),
      remaining_import_mw: parseNumeric(row.remaining_import_capacity_mw_firm_non_firm),
      fault_level_headroom: parseText(row.fault_level_headroom ?? undefined),
      estimated_connection_date: parseText(row.estimated_connection_date ?? undefined),
      reinforcement_cost: parseText(row.estimated_cost_for_reinforcement_works ?? undefined),
    });
  }

  cache.set(cacheKey, entries, TTL.STATIC_DATA);
  return entries;
}

async function fetchCurtailmentEvents(
  apiKey: string,
  days: number,
  gspFilter: string | null,
): Promise<SpenCurtailmentEvent[]> {
  const cacheKey = gspFilter
    ? `${CURTAILMENT_CACHE_KEY_PREFIX}${days}:${gspFilter.toLowerCase()}`
    : `${CURTAILMENT_CACHE_KEY_PREFIX}${days}`;
  const cached = cache.get<SpenCurtailmentEvent[]>(cacheKey);
  if (cached) return cached;

  const startDate = formatIsoDate(
    new Date(Date.now() - days * 24 * 60 * 60 * 1000),
  );

  const whereParts: string[] = [`date >= date'${startDate}'`];
  if (gspFilter) {
    whereParts.push(`site_name like '%${escapeOdsString(gspFilter)}%'`);
  }
  const where = whereParts.join(" AND ");

  const rows = await fetchOdsPages<CurtailmentRawRecord>(
    CURTAILMENT_DATASET_URL,
    apiKey,
    CURTAILMENT_SELECT_FIELDS,
    where,
    ["site_name", "date", "generation_lost"],
    "SPEN Capacity Management System",
  );

  const entries: SpenCurtailmentEvent[] = [];
  for (const row of rows) {
    const siteName = parseText(row.site_name ?? undefined);
    const date = parseText(row.date ?? undefined);
    if (!siteName || !date) continue;

    entries.push({
      site_name: siteName,
      date,
      generation_lost_mw: parseNumeric(row.generation_lost),
      scheme: parseText(row.network_management_scheme ?? undefined),
    });
  }

  cache.set(cacheKey, entries, TTL.STATIC_DATA);
  return entries;
}

// ── Main function ──

export async function getSpenGridIntelligence(
  input: z.infer<typeof spenGridIntelligenceSchema>,
): Promise<SpenGridIntelligenceResult> {
  const gspFilter = input.gsp_name?.trim() || null;
  const days = Math.min(Math.max(input.days ?? DEFAULT_DAYS, 1), MAX_DAYS);

  const apiKey = await resolveOdsApiKey();

  // Fetch all three sections in parallel; each handles failure independently
  const [queueResult, dgResult, curtailmentResult] = await Promise.all([
    fetchQueueEntries(apiKey, gspFilter).catch((): SpenGspQueueEntry[] => []),
    fetchDgCapacity(apiKey, gspFilter).catch((): SpenDgCapacity[] => []),
    fetchCurtailmentEvents(apiKey, days, gspFilter).catch(
      (): SpenCurtailmentEvent[] => [],
    ),
  ]);

  // Build queue type breakdown
  const typeBreakdown: Record<string, { count: number; mw: number }> = {};
  let totalExportMw = 0;
  for (const entry of queueResult) {
    const type = entry.generator_type;
    const existing = typeBreakdown[type];
    if (existing) {
      existing.count += 1;
      existing.mw += entry.export_capacity_mw;
    } else {
      typeBreakdown[type] = { count: 1, mw: entry.export_capacity_mw };
    }
    totalExportMw += entry.export_capacity_mw;
  }

  // Round MW totals
  totalExportMw = Math.round(totalExportMw * 100) / 100;
  for (const entry of Object.values(typeBreakdown)) {
    entry.mw = Math.round(entry.mw * 100) / 100;
  }

  const totalGenerationLost = curtailmentResult.reduce(
    (sum, e) => sum + e.generation_lost_mw,
    0,
  );

  // Unique GSPs covered by DG capacity data
  const uniqueGsps = new Set(dgResult.map((e) => e.gsp));

  return {
    gsp_filter: gspFilter,
    queue: {
      total_projects: queueResult.length,
      total_export_mw: totalExportMw,
      type_breakdown: typeBreakdown,
      entries: queueResult,
    },
    dg_capacity: {
      gsps_covered: uniqueGsps.size,
      entries: dgResult,
    },
    curtailment: {
      period_days: days,
      total_events: curtailmentResult.length,
      total_generation_lost_mw: Math.round(totalGenerationLost * 100) / 100,
      entries: curtailmentResult,
    },
    source_metadata: {
      queue: QUEUE_SOURCE,
      dg_capacity: DG_SOURCE,
      curtailment: CURTAILMENT_SOURCE,
    },
    disclaimer:
      "Data sourced from SP Energy Networks Open Data Portal. " +
      "Queue positions, capacity figures, and curtailment records are planning-grade data " +
      "and should not be used as the sole basis for investment or connection decisions.",
  };
}

export function resetSpenGridCacheForTests(): void {
  cache.clear();
}

export { spenGridIntelligenceSchema as schema };
