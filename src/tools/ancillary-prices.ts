import { z } from "zod";
import { queryEntsoe, dayRange } from "../lib/entsoe-client.js";
import { resolveZone, AVAILABLE_ZONES } from "../lib/zone-codes.js";
import { ensureArray } from "../lib/xml-parser.js";
import { TTL } from "../lib/cache.js";

const SERVICE_PROCESS_TYPES: Record<string, string> = {
  fcr: "A51",
  afrr: "A52",
  mfrr: "A56",
};

export const ancillaryPricesSchema = z.object({
  zone: z
    .string()
    .describe(
      `Bidding zone code. Examples: DE, FR, GB. Available: ${AVAILABLE_ZONES}`
    ),
  service: z
    .enum(["fcr", "afrr", "mfrr"])
    .optional()
    .describe("Reserve type: 'fcr' (default), 'afrr', or 'mfrr'."),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
});

interface AncillaryPricePoint {
  period: number;
  price_eur_mw: number;
}

export async function getAncillaryPrices(
  params: z.infer<typeof ancillaryPricesSchema>
): Promise<{
  zone: string;
  service: string;
  date: string;
  currency: string;
  prices: AncillaryPricePoint[];
  stats: { min: number; max: number; mean: number };
}> {
  const eic = resolveZone(params.zone);
  const service = params.service ?? "fcr";
  const processType = SERVICE_PROCESS_TYPES[service];
  const { periodStart, periodEnd } = dayRange(params.date);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await queryEntsoe(
    {
      documentType: "A84",
      processType,
      controlArea_Domain: eic,
      periodStart,
      periodEnd,
    },
    TTL.ANCILLARY
  );

  const doc =
    data.Publication_MarketDocument ??
    data.Balancing_MarketDocument ??
    data.GL_MarketDocument;
  if (!doc) throw new Error("No ancillary price data returned for this zone/date.");

  const timeSeries = ensureArray(doc.TimeSeries);
  const prices: AncillaryPricePoint[] = [];

  for (const ts of timeSeries) {
    const periods = ensureArray(ts.Period);
    for (const period of periods) {
      const points = ensureArray(period.Point);
      for (const point of points) {
        const position = Number(point.position);
        const price = Number(
          point["procurement_Price.amount"] ?? point["price.amount"] ?? point.quantity ?? 0
        );
        prices.push({ period: position, price_eur_mw: Math.round(price * 100) / 100 });
      }
    }
  }

  prices.sort((a, b) => a.period - b.period);

  const values = prices.map((p) => p.price_eur_mw);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const mean =
    values.length > 0
      ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100
      : 0;

  return {
    zone: params.zone.toUpperCase(),
    service,
    date: params.date ?? new Date().toISOString().slice(0, 10),
    currency: "EUR",
    prices,
    stats: { min, max, mean },
  };
}
