import { z } from "zod";
import { getDayAheadPrices, pricesSchema } from "./prices.js";
import { getIntradayPrices } from "./intraday-prices.js";
import { AVAILABLE_ZONES } from "../lib/zone-codes.js";

export const intradaySpreadSchema = z.object({
  zone: z
    .string()
    .describe(
      `Bidding zone code. Examples: DE, FR, GB. Available: ${AVAILABLE_ZONES}`
    ),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
});

interface SpreadPoint {
  hour: number;
  day_ahead: number;
  intraday: number;
  spread: number;
}

type SpreadSignal = "intraday_premium" | "intraday_discount" | "neutral";

export async function getIntradayDaSpread(
  params: z.infer<typeof intradaySpreadSchema>
): Promise<{
  zone: string;
  date: string;
  spreads: SpreadPoint[];
  stats: { mean_spread: number; max_spread: number; min_spread: number };
  signal: SpreadSignal;
}> {
  const date = params.date ?? new Date().toISOString().slice(0, 10);

  const [daResult, idResult] = await Promise.all([
    getDayAheadPrices(pricesSchema.parse({ zone: params.zone, start_date: date })),
    getIntradayPrices({ zone: params.zone, date }),
  ]);

  // Build lookup maps keyed by hour
  const daByHour = new Map(daResult.prices.map((p) => [p.hour, p.price_eur_mwh]));
  const idByHour = new Map(idResult.prices.map((p) => [p.hour, p.price_eur_mwh]));

  // Compute spreads for matching hours
  const spreads: SpreadPoint[] = [];
  for (const [hour, idPrice] of idByHour) {
    const daPrice = daByHour.get(hour);
    if (daPrice == null) continue;

    spreads.push({
      hour,
      day_ahead: daPrice,
      intraday: idPrice,
      spread: Math.round((idPrice - daPrice) * 100) / 100,
    });
  }

  spreads.sort((a, b) => a.hour - b.hour);

  const spreadValues = spreads.map((s) => s.spread);
  const meanSpread =
    spreadValues.length > 0
      ? Math.round((spreadValues.reduce((s, v) => s + v, 0) / spreadValues.length) * 100) / 100
      : 0;
  const maxSpread = spreadValues.length > 0 ? Math.max(...spreadValues) : 0;
  const minSpread = spreadValues.length > 0 ? Math.min(...spreadValues) : 0;

  let signal: SpreadSignal = "neutral";
  if (meanSpread > 5) signal = "intraday_premium";
  else if (meanSpread < -5) signal = "intraday_discount";

  return {
    zone: params.zone.toUpperCase(),
    date,
    spreads,
    stats: { mean_spread: meanSpread, max_spread: maxSpread, min_spread: minSpread },
    signal,
  };
}
