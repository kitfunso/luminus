import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { resolveApiKey } from "../lib/auth.js";

const API_BASE = "https://data.fingrid.fi/api/datasets";
const cache = new TtlCache();
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 200;

/** Fingrid dataset IDs */
const DATASET_IDS: Record<string, number> = {
  consumption: 124,
  production: 74,
  wind_production: 75,
  solar_production: 248,
  nuclear_production: 188,
  hydro_production: 191,
  imports: 87,
  exports: 89,
  frequency: 177,
  reserve_prices: 244,
};

export const fingridSchema = z.object({
  dataset: z
    .enum([
      "consumption",
      "production",
      "wind_production",
      "solar_production",
      "nuclear_production",
      "hydro_production",
      "imports",
      "exports",
      "frequency",
      "reserve_prices",
    ])
    .describe(
      '"consumption" = Finnish electricity consumption (MW, 3-min). ' +
        '"production" = total electricity production (MW, 3-min). ' +
        '"wind_production" = wind power generation (MW, 3-min). ' +
        '"solar_production" = solar power estimate (MW). ' +
        '"nuclear_production" = nuclear generation (MW, hourly). ' +
        '"hydro_production" = hydro generation (MW, hourly). ' +
        '"imports" = electricity imports to Finland (MW). ' +
        '"exports" = electricity exports from Finland (MW). ' +
        '"frequency" = grid frequency measurements (Hz, 3-min). ' +
        '"reserve_prices" = balancing reserve market prices.'
    ),
  start_date: z
    .string()
    .optional()
    .describe("Start datetime ISO-8601 (e.g. 2025-01-15T00:00:00Z). Defaults to 24h ago."),
  end_date: z
    .string()
    .optional()
    .describe("End datetime ISO-8601. Defaults to now."),
});

async function getApiKey(): Promise<string> {
  try {
    return await resolveApiKey("FINGRID_API_KEY");
  } catch {
    throw new Error(
      "FINGRID_API_KEY is required. Set it as an environment variable or in ~/.luminus/keys.json. " +
        "Get one free at https://data.fingrid.fi/ (register for API access)."
    );
  }
}

interface DataPoint {
  timestamp: string;
  value: number;
}

interface FingridResult {
  source: string;
  dataset: string;
  dataset_id: number;
  unit: string;
  start_date: string;
  end_date: string;
  count: number;
  latest: DataPoint | null;
  data: DataPoint[];
  stats: { min: number; max: number; mean: number } | null;
}

const UNITS: Record<string, string> = {
  consumption: "MW",
  production: "MW",
  wind_production: "MW",
  solar_production: "MW",
  nuclear_production: "MW",
  hydro_production: "MW",
  imports: "MW",
  exports: "MW",
  frequency: "Hz",
  reserve_prices: "EUR/MW",
};

function alignToBucket(date: Date, bucketMs: number): Date {
  return new Date(Math.floor(date.getTime() / bucketMs) * bucketMs);
}

function getEffectiveWindow(params: z.infer<typeof fingridSchema>): { startDate: string; endDate: string } {
  if (params.start_date && params.end_date) {
    return { startDate: params.start_date, endDate: params.end_date };
  }

  const alignedNow = alignToBucket(new Date(), TTL.REALTIME);
  const alignedDayAgo = new Date(alignedNow.getTime() - DEFAULT_WINDOW_MS);

  return {
    startDate: params.start_date ?? alignedDayAgo.toISOString(),
    endDate: params.end_date ?? alignedNow.toISOString(),
  };
}

function buildPageUrl(datasetId: number, startDate: string, endDate: string, page: number): string {
  return (
    `${API_BASE}/${datasetId}/data?startTime=${encodeURIComponent(startDate)}` +
    `&endTime=${encodeURIComponent(endDate)}&format=json&pageSize=${PAGE_SIZE}&page=${page}`
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractRows(json: any): any[] {
  return Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
}

async function fetchAllRows(
  datasetId: number,
  startDate: string,
  endDate: string,
  apiKey: string,
): Promise<DataPoint[]> {
  const rows: DataPoint[] = [];

  for (let page = 1; page <= 50; page++) {
    const url = buildPageUrl(datasetId, startDate, endDate, page);
    const response = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Fingrid API returned ${response.status}: ${body.slice(0, 300)}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await response.json();
    const pageRows = extractRows(json);

    rows.push(
      ...pageRows.map((r) => ({
        timestamp: r.startTime ?? r.start_time ?? r.timestamp ?? "",
        value: Math.round(Number(r.value ?? 0) * 100) / 100,
      })),
    );

    if (pageRows.length < PAGE_SIZE) {
      break;
    }
  }

  return rows
    .filter((row) => row.timestamp)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function getFingridData(
  params: z.infer<typeof fingridSchema>
): Promise<FingridResult> {
  const apiKey = await getApiKey();
  const datasetId = DATASET_IDS[params.dataset];
  const unit = UNITS[params.dataset] ?? "MW";
  const { startDate, endDate } = getEffectiveWindow(params);

  const cacheKey = `fingrid:${datasetId}:${startDate}:${endDate}`;
  const cached = cache.get<FingridResult>(cacheKey);
  if (cached) return cached;

  const data = await fetchAllRows(datasetId, startDate, endDate, apiKey);
  const values = data.map((d) => d.value);

  const stats =
    values.length > 0
      ? {
          min: Math.round(Math.min(...values) * 100) / 100,
          max: Math.round(Math.max(...values) * 100) / 100,
          mean: Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100,
        }
      : null;

  const result: FingridResult = {
    source: "Fingrid Open Data",
    dataset: params.dataset,
    dataset_id: datasetId,
    unit,
    start_date: startDate,
    end_date: endDate,
    count: data.length,
    latest: data.length > 0 ? data[data.length - 1] : null,
    data,
    stats,
  };

  cache.set(cacheKey, result, TTL.REALTIME);
  return result;
}
