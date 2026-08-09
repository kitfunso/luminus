import { z } from "zod";
import { queryEntsoe, dayRange } from "../lib/entsoe-client.js";
import { resolveZone, AVAILABLE_ZONES } from "../lib/zone-codes.js";
import { extractSeriesPoints } from "../lib/entsoe-timeseries.js";
import { fetchNtpDay, hasNtpCredentials } from "../lib/netztransparenz.js";
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

interface ImbalancePricesResult {
  zone: string;
  date: string;
  currency: string;
  source: string;
  prices: ImbalancePricePoint[];
  stats: { min: number; max: number; mean: number };
}

function withStats(
  zone: string,
  date: string | undefined,
  source: string,
  prices: ImbalancePricePoint[]
): ImbalancePricesResult {
  const values = prices.map((p) => p.price_eur_mwh);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const mean =
    values.length > 0
      ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100
      : 0;
  return {
    zone: zone.toUpperCase(),
    date: date ?? new Date().toISOString().slice(0, 10),
    currency: "EUR",
    source,
    prices,
    stats: { min, max, mean },
  };
}

export async function getImbalancePrices(
  params: z.infer<typeof imbalancePricesSchema>
): Promise<ImbalancePricesResult> {
  const eic = resolveZone(params.zone);
  const { periodStart, periodEnd } = dayRange(params.date);
  const isGermany = params.zone.toUpperCase() === "DE";

  let prices: ImbalancePricePoint[] = [];
  let entsoeError: Error | null = null;

  try {
    // A85 = imbalance prices; A86 is imbalance VOLUME (issue #21 - this tool
    // previously queried A86 and read Point.quantity as if it were a price).
    // No processType: the reference client (entsoe-py query_imbalance_prices)
    // sends documentType + controlArea_Domain only.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await queryEntsoe(
      {
        documentType: "A85",
        controlArea_Domain: eic,
        periodStart,
        periodEnd,
      },
      TTL.BALANCING
    );

    const doc =
      data.Balancing_MarketDocument ??
      data.Imbalance_MarketDocument ??
      data.GL_MarketDocument ??
      data.Publication_MarketDocument;
    if (!doc) throw new Error("No imbalance price data returned for this zone/date.");

    // Price keys only - never Point.quantity (a volume, not a price).
    prices = extractSeriesPoints(doc, ["imbalance_Price.amount", "price.amount"]).map((p) => ({
      period: p.period,
      price_eur_mwh: p.value,
    }));
    prices.sort((a, b) => a.period - b.period);
  } catch (err) {
    entsoeError = err instanceof Error ? err : new Error(String(err));
  }

  if (prices.length > 0) {
    return withStats(params.zone, params.date, "entsoe", prices);
  }

  // DE fallback (issue #21): ENTSO-E has no German imbalance price before
  // 2022-09-30 and historic gaps. reBAP from netztransparenz.de is the
  // authoritative full series; used when configured and ENTSO-E is empty.
  if (isGermany && (await hasNtpCredentials())) {
    const date = params.date ?? new Date().toISOString().slice(0, 10);
    const rebap = await fetchNtpDay("reBAP", date);
    if (rebap.length > 0) {
      return withStats(
        params.zone,
        params.date,
        "netztransparenz_rebap",
        rebap.map((p) => ({ period: p.period, price_eur_mwh: p.value }))
      );
    }
  }

  if (entsoeError) {
    if (isGermany) {
      throw new Error(
        `${entsoeError.message} For full German history (pre-2022-09-30), configure ` +
          `NETZTRANSPARENZ_CLIENT_ID/SECRET (free: netztransparenz.de/en/Web-API) to enable the reBAP fallback.`
      );
    }
    throw entsoeError;
  }
  return withStats(params.zone, params.date, "entsoe", prices);
}
