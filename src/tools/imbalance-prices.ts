import { z } from "zod";
import { queryEntsoe, dayRange } from "../lib/entsoe-client.js";
import { resolveZone, AVAILABLE_ZONES } from "../lib/zone-codes.js";
import { ensureArray } from "../lib/xml-parser.js";
import { TTL } from "../lib/cache.js";

export const imbalancePricesSchema = z.object({
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

interface ImbalancePricePoint {
  period: number;
  price_eur_mwh: number;
}

export async function getImbalancePrices(
  params: z.infer<typeof imbalancePricesSchema>
): Promise<{
  zone: string;
  date: string;
  currency: string;
  prices: ImbalancePricePoint[];
  stats: { min: number; max: number; mean: number };
}> {
  const eic = resolveZone(params.zone);
  const { periodStart, periodEnd } = dayRange(params.date);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await queryEntsoe(
    {
      documentType: "A86",
      processType: "A16",
      controlArea_Domain: eic,
      periodStart,
      periodEnd,
    },
    TTL.BALANCING
  );

  const doc =
    data.Imbalance_MarketDocument ?? data.GL_MarketDocument ?? data.Publication_MarketDocument;
  if (!doc) throw new Error("No imbalance price data returned for this zone/date.");

  const timeSeries = ensureArray(doc.TimeSeries);
  const prices: ImbalancePricePoint[] = [];

  for (const ts of timeSeries) {
    const periods = ensureArray(ts.Period);
    for (const period of periods) {
      const points = ensureArray(period.Point);
      for (const point of points) {
        const position = Number(point.position);
        const price = Number(
          point["imbalance_Price.amount"] ?? point["price.amount"] ?? point.quantity ?? 0
        );
        prices.push({ period: position, price_eur_mwh: price });
      }
    }
  }

  prices.sort((a, b) => a.period - b.period);

  const values = prices.map((p) => p.price_eur_mwh);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const mean =
    values.length > 0
      ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100
      : 0;

  return {
    zone: params.zone.toUpperCase(),
    date: params.date ?? new Date().toISOString().slice(0, 10),
    currency: "EUR",
    prices,
    stats: { min, max, mean },
  };
}
