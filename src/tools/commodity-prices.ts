import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const cache = new TtlCache();

export const commodityPricesSchema = z.object({
  commodity: z.enum(["carbon", "brent", "ttf", "all"]).describe(
    '"carbon" = EU ETS carbon allowance (EUR/tCO2). "brent" = Brent crude (USD/bbl). "ttf" = Dutch TTF gas (EUR/MWh). "all" = all three.'
  ),
});

interface CommodityConfig {
  readonly ticker: string;
  readonly name: string;
  readonly currency: string;
  readonly unit: string;
}

interface CommodityEntry {
  name: string;
  ticker: string;
  price: number;
  currency: string;
  unit: string;
  change_5d_pct: number;
  prices_5d: { date: string; price: number }[];
}

interface CommodityPricesResult {
  commodities: CommodityEntry[];
}

const COMMODITIES: Record<string, CommodityConfig> = {
  carbon: {
    ticker: "CO2.L",
    name: "EU Carbon (EUA)",
    currency: "EUR",
    unit: "EUR/tCO2",
  },
  brent: {
    ticker: "BZ%3DF",
    name: "Brent Crude",
    currency: "USD",
    unit: "USD/bbl",
  },
  ttf: {
    ticker: "TTF%3DF",
    name: "TTF Natural Gas",
    currency: "EUR",
    unit: "EUR/MWh",
  },
};

async function fetchYahoo5d(
  ticker: string,
): Promise<{ dates: string[]; closes: number[] } | null> {
  const cacheKey = `commodity:${ticker}:5d`;
  const cached = cache.get<{ dates: string[]; closes: number[] }>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=5d&interval=1d`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) return null;

    const json = await response.json() as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (json as any)?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamp ?? [];
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];

    const valid: { dates: string[]; closes: number[] } = { dates: [], closes: [] };
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null && Number.isFinite(closes[i])) {
        valid.dates.push(
          new Date(timestamps[i] * 1000).toISOString().slice(0, 10)
        );
        valid.closes.push(closes[i]);
      }
    }

    if (valid.dates.length > 0) {
      cache.set(cacheKey, valid, TTL.STORAGE);
    }
    return valid.dates.length > 0 ? valid : null;
  } catch {
    return null;
  }
}

function buildEntry(
  key: string,
  data: { dates: string[]; closes: number[] },
): CommodityEntry {
  const config = COMMODITIES[key];
  const latestPrice = data.closes[data.closes.length - 1];
  const firstPrice = data.closes[0];
  const change5dPct =
    firstPrice > 0
      ? Math.round(((latestPrice - firstPrice) / firstPrice) * 10000) / 100
      : 0;

  const prices5d = data.dates.map((date, i) => ({
    date,
    price: Math.round(data.closes[i] * 100) / 100,
  }));

  return {
    name: config.name,
    ticker: config.ticker,
    price: Math.round(latestPrice * 100) / 100,
    currency: config.currency,
    unit: config.unit,
    change_5d_pct: change5dPct,
    prices_5d: prices5d,
  };
}

export async function getCommodityPrices(
  params: z.infer<typeof commodityPricesSchema>,
): Promise<CommodityPricesResult> {
  const keys =
    params.commodity === "all"
      ? Object.keys(COMMODITIES)
      : [params.commodity];

  const results = await Promise.all(
    keys.map(async (key) => {
      const config = COMMODITIES[key];
      const data = await fetchYahoo5d(config.ticker);
      if (!data || data.closes.length === 0) {
        return null;
      }
      return buildEntry(key, data);
    }),
  );

  const commodities = results.filter(
    (r): r is CommodityEntry => r !== null,
  );

  if (commodities.length === 0) {
    throw new Error(
      "Unable to fetch commodity prices. Yahoo Finance may be temporarily unavailable."
    );
  }

  return { commodities };
}
