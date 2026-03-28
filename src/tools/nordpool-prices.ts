import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const cache = new TtlCache();

const VALID_AREAS = new Set([
  "SE1", "SE2", "SE3", "SE4",
  "NO1", "NO2", "NO3", "NO4", "NO5",
  "DK1", "DK2",
  "FI",
]);

export const nordpoolSchema = z.object({
  areas: z.string().describe(
    'Comma-separated delivery areas. Available: SE1,SE2,SE3,SE4,NO1,NO2,NO3,NO4,NO5,DK1,DK2,FI. Example: "SE3,NO1,DK1"'
  ),
  date: z.string().optional().describe("Date YYYY-MM-DD. Defaults to today."),
  currency: z
    .enum(["EUR", "NOK", "SEK", "DKK"])
    .optional()
    .describe("Price currency. Defaults to EUR."),
});

interface AreaPriceData {
  prices: { timestamp: string; price: number }[];
  stats: { min: number; max: number; mean: number };
}

interface NordpoolResult {
  date: string;
  currency: string;
  areas: Record<string, AreaPriceData>;
}

interface NordpoolEntry {
  deliveryStart: string;
  deliveryEnd: string;
  entryPerArea: Record<string, number>;
}

interface NordpoolApiResponse {
  deliveryAreas: string[];
  multiAreaEntries: NordpoolEntry[];
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getNordpoolPrices(
  params: z.infer<typeof nordpoolSchema>,
): Promise<NordpoolResult> {
  const date = params.date ?? todayDate();
  const currency = params.currency ?? "EUR";

  const requestedAreas = params.areas
    .split(",")
    .map((a) => a.trim().toUpperCase())
    .filter((a) => a.length > 0);

  const invalidAreas = requestedAreas.filter((a) => !VALID_AREAS.has(a));
  if (invalidAreas.length > 0) {
    throw new Error(
      `Invalid delivery areas: ${invalidAreas.join(", ")}. Available: ${[...VALID_AREAS].join(", ")}`
    );
  }

  if (requestedAreas.length === 0) {
    throw new Error("No delivery areas specified.");
  }

  const areasParam = requestedAreas.join(",");
  const cacheKey = `nordpool:${date}:${areasParam}:${currency}`;
  const cached = cache.get<NordpoolResult>(cacheKey);
  if (cached) return cached;

  const url =
    `https://dataportal-api.nordpoolgroup.com/api/DayAheadPrices` +
    `?date=${date}&market=DayAhead&deliveryArea=${areasParam}&currency=${currency}`;

  const response = await fetch(url, {
    headers: { "User-Agent": "luminus-mcp/0.1" },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Nordpool API returned ${response.status}: ${body.slice(0, 300)}`
    );
  }

  const data = (await response.json()) as NordpoolApiResponse;

  if (!data.multiAreaEntries || data.multiAreaEntries.length === 0) {
    throw new Error(
      `No day-ahead prices returned for areas ${areasParam} on ${date}. Data may not be available yet.`
    );
  }

  const areas: Record<string, AreaPriceData> = {};

  for (const area of requestedAreas) {
    const prices: { timestamp: string; price: number }[] = [];

    for (const entry of data.multiAreaEntries) {
      const value = entry.entryPerArea[area];
      if (value == null || !Number.isFinite(value)) continue;

      prices.push({
        timestamp: entry.deliveryStart,
        price: Math.round(value * 100) / 100,
      });
    }

    if (prices.length === 0) continue;

    const values = prices.map((p) => p.price);
    const min = Math.round(Math.min(...values) * 100) / 100;
    const max = Math.round(Math.max(...values) * 100) / 100;
    const mean =
      Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) /
      100;

    areas[area] = { prices, stats: { min, max, mean } };
  }

  if (Object.keys(areas).length === 0) {
    throw new Error(
      `No price data found for the requested areas on ${date}.`
    );
  }

  const result: NordpoolResult = { date, currency, areas };
  cache.set(cacheKey, result, TTL.PRICES);
  return result;
}
