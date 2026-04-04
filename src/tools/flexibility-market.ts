import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";
import { guardJsonFields } from "../lib/schema-guard.js";
import { resolveApiKey, ConfigurationError } from "../lib/auth.js";

const cache = new TtlCache();

const UKPN_FLEX_DATASET_URL =
  "https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/ukpn-flexibility-dispatches/records";
const SPEN_FLEX_DATASET_URL =
  "https://spenergynetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/flex_dispatch/records";

const UKPN_FLEX_CACHE_KEY = "ukpn-flex-dispatches";
const SPEN_FLEX_CACHE_KEY = "spen-flex-dispatches";

const ODS_PAGE_LIMIT = 100;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const UKPN_SELECT_FIELDS = [
  "company_name",
  "zone",
  "product",
  "start_time_local",
  "end_time_local",
  "availability_mw_req",
  "utilisation_mw_req",
  "availability_price",
  "utilisation_price",
  "technology",
  "dispatch_type",
  "hours_requested",
].join(",");

const SPEN_SELECT_FIELDS = [
  "capacity",
  "mwh",
  "start",
  "end",
  "hours",
  "need_direction",
  "power_type",
  "status",
].join(",");

export const flexibilityMarketSchema = z.object({
  operator: z.string().describe('Supported: "UKPN", "SPEN", "all".'),
  zone: z.string().optional().describe("Filter by flexibility zone name (UKPN only)."),
  days: z.number().optional().describe("Number of days of history to fetch (default 30, max 365)."),
  limit: z.number().optional().describe("Maximum dispatch records to return (default 50, max 200)."),
});

interface UkpnFlexRawRecord {
  company_name?: string | null;
  zone?: string | null;
  product?: string | null;
  start_time_local?: string | null;
  end_time_local?: string | null;
  availability_mw_req?: number | null;
  utilisation_mw_req?: number | null;
  availability_price?: number | null;
  utilisation_price?: number | null;
  technology?: string | null;
  dispatch_type?: string | null;
  hours_requested?: number | null;
}

interface SpenFlexRawRecord {
  capacity?: number | null;
  mwh?: number | null;
  start?: string | null;
  end?: string | null;
  hours?: number | null;
  need_direction?: string | null;
  power_type?: string | null;
  status?: string | null;
}

interface FlexDispatchEntry {
  operator: "UKPN" | "SPEN";
  zone: string | null;
  provider: string | null;
  product: string | null;
  technology: string | null;
  dispatch_type: string | null;
  start_time: string;
  end_time: string | null;
  hours: number | null;
  capacity_mw: number | null;
  energy_mwh: number | null;
  availability_price: number | null;
  utilisation_price: number | null;
}

interface FlexibilityMarketResult {
  operator: string;
  period_days: number;
  total_dispatches: number;
  total_mwh: number;
  avg_utilisation_price: number | null;
  zone_breakdown: Record<string, number>;
  dispatches: FlexDispatchEntry[];
  source_metadata: GisSourceMetadata;
  disclaimer: string;
}

type SupportedOperator = "UKPN" | "SPEN";

function normalizeOperator(operator: string): SupportedOperator | "all" | null {
  const normalized = operator.trim().toUpperCase();
  if (normalized === "UKPN" || normalized === "UK POWER NETWORKS") return "UKPN";
  if (normalized === "SPEN" || normalized === "SP ENERGY NETWORKS") return "SPEN";
  if (normalized === "ALL") return "all";
  return null;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
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

function cacheKeyForQuery(base: string, startDate: string, zone?: string): string {
  return zone ? `${base}:${startDate}:zone=${zone}` : `${base}:${startDate}`;
}

async function fetchUkpnFlexDispatches(
  startDate: string,
  zone: string | undefined,
  limit: number,
): Promise<FlexDispatchEntry[]> {
  const cacheKey = cacheKeyForQuery(UKPN_FLEX_CACHE_KEY, startDate, zone);
  const cached = cache.get<FlexDispatchEntry[]>(cacheKey);
  if (cached) return cached.slice(0, limit);

  const apiKey = await resolveOdsApiKey("UKPN_ODS_API_KEY", "UKPN Open Data Portal");

  let whereClause = `start_time_local >= date'${startDate}'`;
  if (zone) {
    whereClause += ` AND zone = '${zone}'`;
  }

  const allRows: UkpnFlexRawRecord[] = [];

  for (let offset = 0; ; offset += ODS_PAGE_LIMIT) {
    const params = new URLSearchParams({
      limit: String(ODS_PAGE_LIMIT),
      offset: String(offset),
      select: UKPN_SELECT_FIELDS,
      where: whereClause,
      order_by: "start_time_local DESC",
      apikey: apiKey,
    });

    const response = await fetch(`${UKPN_FLEX_DATASET_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`UKPN flexibility dispatches fetch failed: HTTP ${response.status}`);
    }

    const json = (await response.json()) as { results?: UkpnFlexRawRecord[] };
    const page = Array.isArray(json.results) ? json.results : [];
    if (page.length === 0) break;

    guardJsonFields(
      page[0] as unknown as Record<string, unknown>,
      ["zone", "product", "utilisation_mw_req", "start_time_local"],
      "UKPN Flexibility Dispatches",
    );

    allRows.push(...page);
    if (page.length < ODS_PAGE_LIMIT) break;
  }

  const dispatches: FlexDispatchEntry[] = allRows.map((row) => ({
    operator: "UKPN" as const,
    zone: row.zone?.trim() ?? null,
    provider: row.company_name?.trim() ?? null,
    product: row.product?.trim() ?? null,
    technology: row.technology?.trim() ?? null,
    dispatch_type: row.dispatch_type?.trim() ?? null,
    start_time: row.start_time_local ?? "",
    end_time: row.end_time_local ?? null,
    hours: typeof row.hours_requested === "number" ? row.hours_requested : null,
    capacity_mw: typeof row.utilisation_mw_req === "number" ? row.utilisation_mw_req : null,
    energy_mwh: null,
    availability_price: typeof row.availability_price === "number" ? row.availability_price : null,
    utilisation_price: typeof row.utilisation_price === "number" ? row.utilisation_price : null,
  }));

  cache.set(cacheKey, dispatches, TTL.PRICES);
  return dispatches.slice(0, limit);
}

async function fetchSpenFlexDispatches(
  startDate: string,
  limit: number,
): Promise<FlexDispatchEntry[]> {
  const cacheKey = cacheKeyForQuery(SPEN_FLEX_CACHE_KEY, startDate);
  const cached = cache.get<FlexDispatchEntry[]>(cacheKey);
  if (cached) return cached.slice(0, limit);

  const apiKey = await resolveOdsApiKey("SPEN_ODS_API_KEY", "SP Energy Networks Open Data Portal");

  const whereClause = `start >= date'${startDate}'`;

  const allRows: SpenFlexRawRecord[] = [];

  for (let offset = 0; ; offset += ODS_PAGE_LIMIT) {
    const params = new URLSearchParams({
      limit: String(ODS_PAGE_LIMIT),
      offset: String(offset),
      select: SPEN_SELECT_FIELDS,
      where: whereClause,
      order_by: "start DESC",
      apikey: apiKey,
    });

    const response = await fetch(`${SPEN_FLEX_DATASET_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`SPEN flexibility dispatches fetch failed: HTTP ${response.status}`);
    }

    const json = (await response.json()) as { results?: SpenFlexRawRecord[] };
    const page = Array.isArray(json.results) ? json.results : [];
    if (page.length === 0) break;

    guardJsonFields(
      page[0] as unknown as Record<string, unknown>,
      ["capacity", "start", "need_direction"],
      "SPEN Flex Dispatch",
    );

    allRows.push(...page);
    if (page.length < ODS_PAGE_LIMIT) break;
  }

  const dispatches: FlexDispatchEntry[] = allRows.map((row) => ({
    operator: "SPEN" as const,
    zone: null,
    provider: null,
    product: null,
    technology: row.power_type?.trim() ?? null,
    dispatch_type: row.need_direction?.trim() ?? null,
    start_time: row.start ?? "",
    end_time: row.end ?? null,
    hours: typeof row.hours === "number" ? row.hours : null,
    capacity_mw: typeof row.capacity === "number" ? row.capacity : null,
    energy_mwh: typeof row.mwh === "number" ? row.mwh : null,
    availability_price: null,
    utilisation_price: null,
  }));

  cache.set(cacheKey, dispatches, TTL.PRICES);
  return dispatches.slice(0, limit);
}

function computeSummary(
  dispatches: FlexDispatchEntry[],
): { total_mwh: number; avg_utilisation_price: number | null; zone_breakdown: Record<string, number> } {
  let totalMwh = 0;
  let priceSum = 0;
  let priceCount = 0;
  const zoneBreakdown: Record<string, number> = {};

  for (const d of dispatches) {
    if (d.energy_mwh !== null) {
      totalMwh += d.energy_mwh;
    } else if (d.capacity_mw !== null && d.hours !== null) {
      totalMwh += d.capacity_mw * d.hours;
    }

    if (d.utilisation_price !== null) {
      priceSum += d.utilisation_price;
      priceCount++;
    }

    const zone = d.zone ?? d.operator;
    zoneBreakdown[zone] = (zoneBreakdown[zone] ?? 0) + 1;
  }

  return {
    total_mwh: Math.round(totalMwh * 1000) / 1000,
    avg_utilisation_price: priceCount > 0 ? Math.round((priceSum / priceCount) * 100) / 100 : null,
    zone_breakdown: zoneBreakdown,
  };
}

const SOURCE_METADATA_MAP: Record<SupportedOperator, string> = {
  UKPN: "ukpn-flexibility-dispatches",
  SPEN: "spen-flex-dispatch",
};

function getSourceMetadata(operator: SupportedOperator | "all"): GisSourceMetadata {
  if (operator === "all") {
    return GIS_SOURCES[SOURCE_METADATA_MAP.UKPN];
  }
  return GIS_SOURCES[SOURCE_METADATA_MAP[operator]];
}

const DISCLAIMER =
  "This uses publicly available flexibility dispatch data from UK distribution network operators. " +
  "Dispatch records represent historical flexibility service activations and pricing, " +
  "not future availability or guaranteed pricing. Data is provided as-is for informational purposes.";

export async function getFlexibilityMarket(
  params: z.infer<typeof flexibilityMarketSchema>,
): Promise<FlexibilityMarketResult> {
  const operator = normalizeOperator(params.operator);
  const days = Math.min(Math.max(params.days ?? DEFAULT_DAYS, 1), MAX_DAYS);
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  if (!operator) {
    throw new Error('Supported operators: "UKPN", "SPEN", "all".');
  }

  if (params.zone && operator === "SPEN") {
    throw new Error("Zone filtering is only supported for UKPN dispatches.");
  }

  const startDate = formatIsoDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));

  let dispatches: FlexDispatchEntry[] = [];

  if (operator === "UKPN" || operator === "all") {
    const ukpn = await fetchUkpnFlexDispatches(startDate, params.zone, limit);
    dispatches.push(...ukpn);
  }

  if (operator === "SPEN" || operator === "all") {
    const spen = await fetchSpenFlexDispatches(startDate, limit);
    dispatches.push(...spen);
  }

  // Sort combined results by start_time descending
  dispatches.sort((a, b) => (b.start_time > a.start_time ? 1 : b.start_time < a.start_time ? -1 : 0));

  // Apply final limit for "all" queries
  if (operator === "all" && dispatches.length > limit) {
    dispatches = dispatches.slice(0, limit);
  }

  const summary = computeSummary(dispatches);

  return {
    operator: operator === "all" ? "UKPN+SPEN" : operator,
    period_days: days,
    total_dispatches: dispatches.length,
    total_mwh: summary.total_mwh,
    avg_utilisation_price: summary.avg_utilisation_price,
    zone_breakdown: summary.zone_breakdown,
    dispatches,
    source_metadata: getSourceMetadata(operator),
    disclaimer: DISCLAIMER,
  };
}

export function resetFlexCacheForTests(): void {
  cache.clear();
}
