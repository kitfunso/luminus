import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const BASE_URL = "https://api.eia.gov/v2";
const cache = new TtlCache();

export const usGasSchema = z.object({
  dataset: z
    .enum(["storage", "henry_hub"])
    .describe(
      'Dataset to query. "storage" = weekly US gas storage levels (Lower 48). ' +
        '"henry_hub" = Henry Hub natural gas spot price.'
    ),
  limit: z
    .number()
    .optional()
    .describe("Number of records to return. Defaults to 10."),
});

function getApiKey(): string {
  const key = process.env.EIA_API_KEY;
  if (!key) {
    throw new Error(
      "EIA_API_KEY environment variable is required. " +
        "Get one at https://www.eia.gov/opendata/register.php"
    );
  }
  return key;
}

interface StorageRecord {
  period: string;
  value_bcf: number;
  region: string;
}

interface HenryHubRecord {
  period: string;
  price_usd_mmbtu: number;
}

interface UsGasStorageResult {
  dataset: "storage";
  description: string;
  records: StorageRecord[];
}

interface UsGasHenryHubResult {
  dataset: "henry_hub";
  description: string;
  records: HenryHubRecord[];
}

type UsGasResult = UsGasStorageResult | UsGasHenryHubResult;

async function fetchEia(
  path: string,
  params: Record<string, string>,
  ttlMs: number
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_key", getApiKey());

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const cacheKey = url.toString().replace(/api_key=[^&]+/, "api_key=***");
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const response = await fetch(url.toString());

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`EIA API returned ${response.status}: ${body.slice(0, 300)}`);
  }

  const json = await response.json();
  cache.set(cacheKey, json, ttlMs);
  return json;
}

async function getWeeklyStorage(limit: number): Promise<UsGasStorageResult> {
  // EIA v2 requires /data/ suffix for data queries
  // Filter: R48 = Lower 48 total, SWO = Working Gas
  const data = await fetchEia(
    "/natural-gas/stor/wkly/data/",
    {
      "data[]": "value",
      "facets[duoarea][]": "R48",
      "facets[process][]": "SWO",
      frequency: "weekly",
      "sort[0][column]": "period",
      "sort[0][direction]": "desc",
      length: String(limit),
    },
    TTL.EIA
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = data?.response?.data ?? [];

  const records: StorageRecord[] = rows.map((r) => ({
    period: r.period ?? "",
    value_bcf: Number(r.value ?? 0),
    region: r["series-description"] ?? "Lower 48",
  }));

  return {
    dataset: "storage",
    description: "US weekly natural gas working storage, Lower 48 (Bcf)",
    records,
  };
}

async function getHenryHub(limit: number): Promise<UsGasHenryHubResult> {
  const data = await fetchEia(
    "/natural-gas/pri/fut/data/",
    {
      "data[]": "value",
      "facets[series][]": "RNGWHHD",
      frequency: "daily",
      "sort[0][column]": "period",
      "sort[0][direction]": "desc",
      length: String(limit),
    },
    TTL.EIA
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = data?.response?.data ?? [];

  const records: HenryHubRecord[] = rows.map((r) => ({
    period: r.period ?? "",
    price_usd_mmbtu: Number(r.value ?? 0),
  }));

  return {
    dataset: "henry_hub",
    description: "Henry Hub natural gas spot price (USD/MMBtu)",
    records,
  };
}

export async function getUsGasData(
  params: z.infer<typeof usGasSchema>
): Promise<UsGasResult> {
  const limit = params.limit ?? 10;

  switch (params.dataset) {
    case "storage":
      return getWeeklyStorage(limit);
    case "henry_hub":
      return getHenryHub(limit);
  }
}
