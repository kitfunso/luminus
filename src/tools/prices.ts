import { z } from "zod";
import { queryEntsoe, dayRange, formatEntsoeDate } from "../lib/entsoe-client.js";
import { resolvePriceZone, AVAILABLE_ZONES } from "../lib/zone-codes.js";
import { ensureArray } from "../lib/xml-parser.js";
import { TTL } from "../lib/cache.js";

export const pricesSchema = z.object({
  zone: z
    .string()
    .describe(
      `Bidding zone code. Examples: DE, FR, GB. Available: ${AVAILABLE_ZONES}`
    ),
  start_date: z
    .string()
    .optional()
    .describe("Start date YYYY-MM-DD. Defaults to today."),
  end_date: z
    .string()
    .optional()
    .describe("End date YYYY-MM-DD. Defaults to start_date + 1 day."),
});

interface PricePoint {
  hour: number;
  price_eur_mwh: number;
}

export async function getDayAheadPrices(
  params: z.infer<typeof pricesSchema>
): Promise<{
  zone: string;
  start_date: string;
  end_date: string;
  currency: string;
  prices: PricePoint[];
  stats: { min: number; max: number; mean: number };
}> {
  const eic = resolvePriceZone(params.zone);

  let periodStart: string;
  let periodEnd: string;

  if (params.start_date) {
    const startDt = new Date(params.start_date + "T00:00:00Z");
    periodStart = formatEntsoeDate(startDt);

    if (params.end_date) {
      const endDt = new Date(params.end_date + "T00:00:00Z");
      periodEnd = formatEntsoeDate(endDt);
    } else {
      periodEnd = formatEntsoeDate(
        new Date(startDt.getTime() + 24 * 60 * 60 * 1000)
      );
    }
  } else {
    const range = dayRange();
    periodStart = range.periodStart;
    periodEnd = range.periodEnd;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await queryEntsoe(
    {
      documentType: "A44",
      in_Domain: eic,
      out_Domain: eic,
      periodStart,
      periodEnd,
    },
    TTL.PRICES
  );

  const doc = data.Publication_MarketDocument;
  if (!doc) throw new Error("No price data returned for this zone/date range.");

  const timeSeries = ensureArray(doc.TimeSeries);
  const prices: PricePoint[] = [];

  for (const ts of timeSeries) {
    const currency = ts["currency_Unit.name"] ?? "EUR";
    const periods = ensureArray(ts.Period);

    for (const period of periods) {
      const points = ensureArray(period.Point);
      for (const point of points) {
        const position = Number(point.position);
        const price = Number(point["price.amount"]);
        prices.push({ hour: position - 1, price_eur_mwh: price });
      }
    }
  }

  prices.sort((a, b) => a.hour - b.hour);

  const values = prices.map((p) => p.price_eur_mwh);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean =
    values.length > 0
      ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100
      : 0;

  return {
    zone: params.zone.toUpperCase(),
    start_date: params.start_date ?? new Date().toISOString().slice(0, 10),
    end_date: params.end_date ?? params.start_date ?? new Date().toISOString().slice(0, 10),
    currency: "EUR",
    prices,
    stats: { min, max, mean },
  };
}
