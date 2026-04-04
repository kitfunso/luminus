import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";
import { guardJsonFields } from "../lib/schema-guard.js";
import { resolveApiKey, ConfigurationError } from "../lib/auth.js";

const cache = new TtlCache();

const UKPN_CONSTRAINT_BREACHES_URL =
  "https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/ukpn-constraint-breaches-history/records";
const CACHE_KEY = "ukpn-constraint-breaches";
const ODS_PAGE_LIMIT = 100;
const DEFAULT_DAYS = 90;
const MAX_DAYS = 365;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const SELECT_FIELDS = [
  "scheme",
  "start_time_utc",
  "end_time_utc",
  "duration_hours",
  "total_der_access_reduction_kwh",
  "event_id",
  "constraint_id",
  "constraint_description",
  "constraint_voltage_kv",
].join(",");
const GUARD_FIELDS: readonly string[] = [
  "scheme",
  "start_time_utc",
  "duration_hours",
  "constraint_description",
];

export const constraintBreachesSchema = z.object({
  scheme: z.string().optional().describe("Filter by constraint scheme/area name."),
  days: z.number().optional().describe("Number of days of history (default 90, max 365)."),
  limit: z.number().optional().describe("Maximum records (default 50, max 200)."),
  min_duration_hours: z
    .number()
    .optional()
    .describe("Only return breaches lasting at least this many hours."),
});

interface ConstraintBreachRawRecord {
  scheme?: string | null;
  start_time_utc?: string | null;
  end_time_utc?: string | null;
  duration_hours?: number | null;
  total_der_access_reduction_kwh?: number | null;
  event_id?: string | null;
  constraint_id?: string | null;
  constraint_description?: string | null;
  constraint_voltage_kv?: number | null;
}

interface ConstraintBreach {
  scheme: string;
  event_id: string;
  constraint_id: string;
  constraint_description: string;
  voltage_kv: number | null;
  start_time: string;
  end_time: string;
  duration_hours: number;
  der_curtailment_kwh: number;
}

interface SchemeBreakdown {
  count: number;
  total_kwh: number;
  total_hours: number;
}

interface ConstraintBreachesResult {
  period_days: number;
  total_breaches: number;
  total_curtailment_kwh: number;
  total_curtailment_hours: number;
  scheme_breakdown: Record<string, SchemeBreakdown>;
  breaches: ConstraintBreach[];
  source_metadata: GisSourceMetadata;
  disclaimer: string;
}

const SOURCE_METADATA: GisSourceMetadata = {
  id: "ukpn-constraint-breaches",
  name: "UKPN Constraint Breaches History",
  provider: "UK Power Networks",
  licence: "Open Data (free registration required for API access)",
  url: "https://ukpowernetworks.opendatasoft.com/explore/dataset/ukpn-constraint-breaches-history/",
  api_key_required: true,
  coverage:
    "UKPN licence areas: Eastern Power Networks (EPN), London Power Networks (LPN), South Eastern Power Networks (SPN)",
  update_frequency: "Updated as new constraint events are recorded",
  reliability: "medium",
  caveats: [
    "Constraint breach records reflect historical events, not current operational state",
    "DER curtailment figures are totals per event and may aggregate multiple sites within a scheme",
    "Coverage is limited to UKPN licence areas — does not include SSEN, NPG, SPEN, or NGED",
    "Scheme names may not directly map to substation identifiers in other UKPN datasets",
  ],
  attribution: "Contains data from UK Power Networks.",
};

export function resetConstraintBreachesCacheForTests(): void {
  cache.clear();
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
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

function toBreach(row: ConstraintBreachRawRecord): ConstraintBreach | null {
  const scheme = row.scheme?.trim();
  if (!scheme) return null;

  const durationHours =
    typeof row.duration_hours === "number" && Number.isFinite(row.duration_hours)
      ? row.duration_hours
      : null;
  if (durationHours === null) return null;

  return {
    scheme,
    event_id: row.event_id?.trim() ?? "",
    constraint_id: row.constraint_id?.trim() ?? "",
    constraint_description: row.constraint_description?.trim() ?? "",
    voltage_kv:
      typeof row.constraint_voltage_kv === "number" &&
      Number.isFinite(row.constraint_voltage_kv)
        ? row.constraint_voltage_kv
        : null,
    start_time: row.start_time_utc?.trim() ?? "",
    end_time: row.end_time_utc?.trim() ?? "",
    duration_hours: durationHours,
    der_curtailment_kwh:
      typeof row.total_der_access_reduction_kwh === "number" &&
      Number.isFinite(row.total_der_access_reduction_kwh)
        ? row.total_der_access_reduction_kwh
        : 0,
  };
}

async function fetchBreaches(
  apiKey: string,
  startDate: string,
  scheme: string | undefined,
): Promise<ConstraintBreach[]> {
  const cacheKey = `${CACHE_KEY}:${startDate}:${scheme ?? "all"}`;
  const cached = cache.get<ConstraintBreach[]>(cacheKey);
  if (cached) return cached;

  const allBreaches: ConstraintBreach[] = [];
  let guardChecked = false;

  for (let offset = 0; ; offset += ODS_PAGE_LIMIT) {
    let where = `start_time_utc >= date'${startDate}'`;
    if (scheme) {
      where += ` AND scheme = '${scheme}'`;
    }

    const params = new URLSearchParams({
      limit: String(ODS_PAGE_LIMIT),
      offset: String(offset),
      select: SELECT_FIELDS,
      where,
      order_by: "start_time_utc DESC",
      apikey: apiKey,
    });

    const response = await fetch(`${UKPN_CONSTRAINT_BREACHES_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(
        `UKPN constraint breaches dataset fetch failed: HTTP ${response.status}`,
      );
    }

    const json = (await response.json()) as { results?: ConstraintBreachRawRecord[] };
    const page = Array.isArray(json.results) ? json.results : [];
    if (page.length === 0) break;

    if (!guardChecked) {
      guardJsonFields(
        page[0] as unknown as Record<string, unknown>,
        GUARD_FIELDS,
        "UKPN Constraint Breaches History",
      );
      guardChecked = true;
    }

    for (const row of page) {
      const breach = toBreach(row);
      if (breach) {
        allBreaches.push(breach);
      }
    }

    if (page.length < ODS_PAGE_LIMIT) break;
  }

  cache.set(cacheKey, allBreaches, TTL.STATIC_DATA);
  return allBreaches;
}

export async function getConstraintBreaches(
  args: z.infer<typeof constraintBreachesSchema>,
): Promise<ConstraintBreachesResult> {
  const days = Math.min(Math.max(args.days ?? DEFAULT_DAYS, 1), MAX_DAYS);
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const minDurationHours = args.min_duration_hours ?? 0;
  const scheme = args.scheme?.trim() || undefined;

  const apiKey = await resolveOdsApiKey();

  const startDate = formatIsoDate(
    new Date(Date.now() - days * 24 * 60 * 60 * 1000),
  );

  let breaches = await fetchBreaches(apiKey, startDate, scheme);

  if (minDurationHours > 0) {
    breaches = breaches.filter((b) => b.duration_hours >= minDurationHours);
  }

  // Build scheme breakdown from all matching breaches (before limit)
  const schemeBreakdown: Record<string, SchemeBreakdown> = {};
  let totalCurtailmentKwh = 0;
  let totalCurtailmentHours = 0;

  for (const breach of breaches) {
    totalCurtailmentKwh += breach.der_curtailment_kwh;
    totalCurtailmentHours += breach.duration_hours;

    const existing = schemeBreakdown[breach.scheme];
    if (existing) {
      existing.count += 1;
      existing.total_kwh += breach.der_curtailment_kwh;
      existing.total_hours += breach.duration_hours;
    } else {
      schemeBreakdown[breach.scheme] = {
        count: 1,
        total_kwh: breach.der_curtailment_kwh,
        total_hours: breach.duration_hours,
      };
    }
  }

  // Round aggregated values
  totalCurtailmentKwh = Math.round(totalCurtailmentKwh * 100) / 100;
  totalCurtailmentHours = Math.round(totalCurtailmentHours * 1000) / 1000;

  for (const entry of Object.values(schemeBreakdown)) {
    entry.total_kwh = Math.round(entry.total_kwh * 100) / 100;
    entry.total_hours = Math.round(entry.total_hours * 1000) / 1000;
  }

  return {
    period_days: days,
    total_breaches: breaches.length,
    total_curtailment_kwh: totalCurtailmentKwh,
    total_curtailment_hours: totalCurtailmentHours,
    scheme_breakdown: schemeBreakdown,
    breaches: breaches.slice(0, limit),
    source_metadata: SOURCE_METADATA,
    disclaimer:
      "Constraint breach data is sourced from UKPN and reflects historical events. " +
      "It should be used for screening and siting analysis only, not as a guarantee of future constraint frequency or revenue opportunity.",
  };
}
