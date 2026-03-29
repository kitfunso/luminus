import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const API_BASE = "https://www.regelleistung.net/apps/datacenter/tenders";
const cache = new TtlCache();

const PRODUCTS = ["FCR", "aFRR", "mFRR"] as const;

export const regelleistungSchema = z.object({
  product: z
    .enum(PRODUCTS)
    .describe(
      '"FCR" = Frequency Containment Reserve (primary, ±200mHz, all EU). ' +
        '"aFRR" = automatic Frequency Restoration Reserve (secondary, 5min). ' +
        '"mFRR" = manual Frequency Restoration Reserve (tertiary, 15min).'
    ),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
});

interface TenderRecord {
  product: string;
  delivery_date: string;
  direction: string;
  procured_mw: number;
  marginal_price_eur_mw: number;
  average_price_eur_mw: number;
  min_price_eur_mw: number;
  max_price_eur_mw: number;
}

interface RegelleistungResult {
  source: string;
  product: string;
  date: string;
  description: string;
  tenders: TenderRecord[];
}

export async function getRegelleistung(
  params: z.infer<typeof regelleistungSchema>
): Promise<RegelleistungResult> {
  const date = params.date ?? new Date().toISOString().slice(0, 10);
  const product = params.product;

  const url = `${API_BASE}?productTypes=${product}&deliveryDate=${date}&format=json`;

  const cached = cache.get<RegelleistungResult>(url);
  if (cached) return cached;

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "luminus-mcp/0.1" },
  });

  if (!response.ok) {
    // Regelleistung may not have a clean JSON API; fall back to description
    const descriptions: Record<string, string> = {
      FCR:
        "FCR (Frequency Containment Reserve): ±200mHz deadband, symmetric product, " +
        "auctioned daily via the FCR Cooperation (DE, FR, NL, BE, AT, CH, DK, SI). " +
        "Primary revenue stream for European BESS. Check regelleistung.net/apps/datacenter for latest results.",
      aFRR:
        "aFRR (automatic Frequency Restoration Reserve): Activated within 5 minutes, " +
        "energy + capacity pricing. DE-specific but harmonising across EU. " +
        "Check regelleistung.net/apps/datacenter for latest results.",
      mFRR:
        "mFRR (manual Frequency Restoration Reserve): Activated within 15 minutes, " +
        "manual dispatch. Often used for larger imbalances. " +
        "Check regelleistung.net/apps/datacenter for latest results.",
    };

    return {
      source: "Regelleistung.net (Balancing Market Data Center)",
      product,
      date,
      description: descriptions[product] ?? `${product} balancing reserve data.`,
      tenders: [],
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = Array.isArray(json) ? json : json?.data ?? json?.tenders ?? [];

  const tenders: TenderRecord[] = items.slice(0, 30).map((t) => ({
    product: t.productType ?? product,
    delivery_date: t.deliveryDate ?? date,
    direction: t.direction ?? "symmetric",
    procured_mw: Math.round(Number(t.procuredCapacity ?? t.demandMw ?? 0)),
    marginal_price_eur_mw: Math.round((Number(t.marginalPrice ?? 0)) * 100) / 100,
    average_price_eur_mw: Math.round((Number(t.averagePrice ?? t.weightedAveragePrice ?? 0)) * 100) / 100,
    min_price_eur_mw: Math.round((Number(t.minPrice ?? 0)) * 100) / 100,
    max_price_eur_mw: Math.round((Number(t.maxPrice ?? 0)) * 100) / 100,
  }));

  const result: RegelleistungResult = {
    source: "Regelleistung.net (Balancing Market Data Center)",
    product,
    date,
    description: `${product} tender results for ${date}. ${tenders.length} records.`,
    tenders,
  };

  cache.set(url, result, TTL.ANCILLARY);
  return result;
}
