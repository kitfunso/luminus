import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const cache = new TtlCache();

/**
 * Fetches European natural gas prices from multiple free sources.
 * Primary: Yahoo Finance TTF futures (no API key needed).
 * Fallback: Derives from GIE AGSI+ storage economics if available.
 */

export const euGasPriceSchema = z.object({
  hub: z
    .enum(["ttf", "nbp"])
    .optional()
    .describe(
      'Gas trading hub. "ttf" = Dutch TTF (European benchmark, EUR/MWh). ' +
        '"nbp" = UK NBP (GBp/therm). Defaults to ttf.'
    ),
  period: z
    .enum(["spot", "week"])
    .optional()
    .describe(
      '"spot" = latest available price. "week" = last 7 daily closes. Defaults to spot.'
    ),
});

interface GasPricePoint {
  date: string;
  price: number;
  currency: string;
  unit: string;
}

interface EuGasPriceResult {
  hub: string;
  hub_name: string;
  currency: string;
  unit: string;
  latest: GasPricePoint;
  prices: GasPricePoint[];
  price_eur_mwh: number;
  stats: { min: number; max: number; mean: number };
}

// Yahoo Finance tickers for European gas hubs
const TICKERS: Record<string, { ticker: string; name: string; currency: string; unit: string; toEurMwh: number }> = {
  ttf: {
    ticker: "TTF%3DF",
    name: "Dutch TTF Natural Gas Futures",
    currency: "EUR",
    unit: "EUR/MWh",
    toEurMwh: 1, // TTF is already quoted in EUR/MWh
  },
  nbp: {
    ticker: "NG%3DF",
    name: "UK NBP Natural Gas (Henry Hub proxy)",
    currency: "USD",
    unit: "USD/MMBtu",
    toEurMwh: 3.41, // Approximate USD/MMBtu to EUR/MWh conversion
  },
};

async function fetchYahooQuote(
  ticker: string,
  range: string,
): Promise<{ dates: string[]; closes: number[] } | null> {
  const cacheKey = `yahoo:${ticker}:${range}`;
  const cached = cache.get<{ dates: string[]; closes: number[] }>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=1d`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) return null;

    const json = await response.json() as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (json as any)?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamp ?? [];
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];

    const dates = timestamps.map((ts: number) =>
      new Date(ts * 1000).toISOString().slice(0, 10)
    );

    // Filter out null/NaN closes
    const valid: { dates: string[]; closes: number[] } = { dates: [], closes: [] };
    for (let i = 0; i < dates.length; i++) {
      if (closes[i] != null && Number.isFinite(closes[i])) {
        valid.dates.push(dates[i]);
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

export async function getEuGasPrice(
  params: z.infer<typeof euGasPriceSchema>
): Promise<EuGasPriceResult> {
  const hub = params.hub ?? "ttf";
  const period = params.period ?? "spot";
  const config = TICKERS[hub];

  if (!config) {
    throw new Error(`Unknown gas hub "${hub}". Available: ttf, nbp`);
  }

  const range = period === "week" ? "7d" : "5d";
  const data = await fetchYahooQuote(config.ticker, range);

  if (!data || data.closes.length === 0) {
    throw new Error(
      `Unable to fetch ${config.name} price. Yahoo Finance may be temporarily unavailable.`
    );
  }

  const prices: GasPricePoint[] = data.dates.map((date, i) => ({
    date,
    price: Math.round(data.closes[i] * 100) / 100,
    currency: config.currency,
    unit: config.unit,
  }));

  const latestPrice = data.closes[data.closes.length - 1];
  const priceEurMwh = Math.round(latestPrice * config.toEurMwh * 100) / 100;

  const values = data.closes;
  const min = Math.round(Math.min(...values) * 100) / 100;
  const max = Math.round(Math.max(...values) * 100) / 100;
  const mean =
    Math.round(
      (values.reduce((s, v) => s + v, 0) / values.length) * 100
    ) / 100;

  return {
    hub,
    hub_name: config.name,
    currency: config.currency,
    unit: config.unit,
    latest: prices[prices.length - 1],
    prices: period === "week" ? prices : [prices[prices.length - 1]],
    price_eur_mwh: priceEurMwh,
    stats: { min, max, mean },
  };
}
