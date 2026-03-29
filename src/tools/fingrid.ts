import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const API_BASE = "https://data.fingrid.fi/api/datasets";
const cache = new TtlCache();

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

function getApiKey(): string {
  const key = process.env.FINGRID_API_KEY;
  if (!key) {
    throw new Error(
      "FINGRID_API_KEY environment variable is required. " +
        "Get one free at https://data.fingrid.fi/ (register for API access)."
    );
  }
  return key;
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

export async function getFingridData(
  params: z.infer<typeof fingridSchema>
): Promise<FingridResult> {
  const apiKey = getApiKey();
  const datasetId = DATASET_IDS[params.dataset];
  const unit = UNITS[params.dataset] ?? "MW";

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const startDate = params.start_date ?? dayAgo.toISOString();
  const endDate = params.end_date ?? now.toISOString();

  const url =
    `${API_BASE}/${datasetId}/data?startTime=${encodeURIComponent(startDate)}` +
    `&endTime=${encodeURIComponent(endDate)}&format=json&pageSize=200&page=1`;

  const cached = cache.get<FingridResult>(url);
  if (cached) return cached;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];

  const data: DataPoint[] = rows.map((r) => ({
    timestamp: r.startTime ?? r.start_time ?? r.timestamp ?? "",
    value: Math.round((Number(r.value ?? 0)) * 100) / 100,
  }));

  // Cap output to last 96 points (8 hours at 5-min resolution)
  const trimmed = data.slice(-96);
  const values = trimmed.map((d) => d.value);

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
    count: trimmed.length,
    latest: trimmed.length > 0 ? trimmed[trimmed.length - 1] : null,
    data: trimmed,
    stats,
  };

  cache.set(url, result, TTL.REALTIME);
  return result;
}
