import { z } from "zod";
import { getSolarIrradiance } from "./solar.js";
import { getDayAheadPrices } from "./prices.js";
import { getPriceSpreadAnalysis } from "./price-spread-analysis.js";
import { getTerrainAnalysis } from "./terrain-analysis.js";

export const siteRevenueSchema = z.object({
  lat: z.number().describe("Latitude (-90 to 90). WGS84."),
  lon: z.number().describe("Longitude (-180 to 180). WGS84."),
  zone: z.string().describe("Bidding zone for price data (e.g. GB, DE, FR)."),
  technology: z.enum(["pv", "bess"]).describe("PV (solar) or BESS (battery storage)."),
  capacity_mw: z
    .number()
    .optional()
    .describe("Installed capacity in MW (default 10)."),
  date: z
    .string()
    .optional()
    .describe("Price date for BESS arbitrage (YYYY-MM-DD, default today)."),
});

interface TerrainSnapshot {
  elevation_m: number;
  slope_deg: number;
  aspect_cardinal: string;
}

interface PriceSnapshot {
  date: string;
  peak_eur_mwh: number;
  off_peak_eur_mwh: number;
  mean_eur_mwh: number;
}

interface SiteRevenueResult {
  lat: number;
  lon: number;
  zone: string;
  technology: "pv" | "bess";
  capacity_mw: number;
  terrain: TerrainSnapshot | null;
  revenue: {
    annual_generation_mwh?: number;
    capacity_factor?: number;
    capture_price_eur_mwh?: number;
    daily_spread_eur_mwh?: number;
    daily_revenue_eur?: number;
    arb_signal?: string;
    estimated_annual_revenue_eur: number;
  };
  price_snapshot: PriceSnapshot | null;
  caveats: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "This is a screening-level estimate only. It is not a financial model, investment advice, or a substitute for a bankable feasibility study.";

const COMMON_CAVEATS: readonly string[] = [
  "Revenue estimate uses a single day's price curve, not historical averages",
  "No degradation, curtailment, or network losses modeled",
  "Grid connection costs are not included",
];

const PV_CAVEATS: readonly string[] = [
  "Capture price uses daylight hours (07:00-19:00) as a simple proxy",
];

const BESS_CAVEATS: readonly string[] = [
  "Arbitrage assumes optimal dispatch with perfect foresight",
];

/** Round to 2 decimal places. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Estimate annual PV generation revenue or BESS arbitrage revenue for a
 * candidate site. Combines GIS data (solar resource, terrain) with market
 * data (day-ahead prices, spread analysis).
 */
export async function estimateSiteRevenue(
  params: z.infer<typeof siteRevenueSchema>,
): Promise<SiteRevenueResult> {
  const { lat, lon, zone, technology } = params;
  const capacity_mw = params.capacity_mw ?? 10;
  const date = params.date ?? new Date().toISOString().slice(0, 10);

  if (technology === "pv") {
    return estimatePvRevenue({ lat, lon, zone, capacity_mw, date });
  }
  return estimateBessRevenue({ lat, lon, zone, capacity_mw, date });
}

// ---------------------------------------------------------------------------
// PV revenue
// ---------------------------------------------------------------------------

interface RevenueParams {
  lat: number;
  lon: number;
  zone: string;
  capacity_mw: number;
  date: string;
}

async function estimatePvRevenue(p: RevenueParams): Promise<SiteRevenueResult> {
  // Fire all three requests in parallel; terrain is non-critical.
  const [solarResult, pricesResult, terrainResult] = await Promise.allSettled([
    getSolarIrradiance({ lat: p.lat, lon: p.lon }),
    getDayAheadPrices({ zone: p.zone, start_date: p.date }),
    getTerrainAnalysis({ lat: p.lat, lon: p.lon }),
  ]);

  // Solar is required.
  if (solarResult.status === "rejected") {
    throw new Error(
      `Solar irradiance lookup failed: ${solarResult.reason instanceof Error ? solarResult.reason.message : String(solarResult.reason)}`,
    );
  }

  // Price data is required.
  if (pricesResult.status === "rejected") {
    throw new Error(
      `Day-ahead price lookup failed: ${pricesResult.reason instanceof Error ? pricesResult.reason.message : String(pricesResult.reason)}`,
    );
  }

  const solar = solarResult.value;
  const prices = pricesResult.value;
  const terrain = terrainResult.status === "fulfilled" ? terrainResult.value : null;

  // annual_generation_mwh = capacity_mw * 1000 * (annual_yield_kwh / 1000)
  // annual_yield_kwh is per 1 kWp, so for capacity_mw MW:
  const annual_generation_mwh = round2(p.capacity_mw * 1000 * (solar.annual_yield_kwh / 1000));

  // Capacity factor: actual generation / (capacity * 8760 hours)
  const capacity_factor = round2(annual_generation_mwh / (p.capacity_mw * 8760));

  // Capture price: weighted average of daylight hours (7-19)
  const daylightPrices = prices.prices.filter((pp) => pp.hour >= 7 && pp.hour <= 19);
  const capture_price_eur_mwh =
    daylightPrices.length > 0
      ? round2(daylightPrices.reduce((s, pp) => s + pp.price_eur_mwh, 0) / daylightPrices.length)
      : prices.stats.mean;

  // Annual revenue in EUR. annual_generation_mwh is already in MWh.
  const estimated_annual_revenue_eur = round2(annual_generation_mwh * capture_price_eur_mwh);

  const price_snapshot: PriceSnapshot = {
    date: prices.start_date,
    peak_eur_mwh: prices.stats.max,
    off_peak_eur_mwh: prices.stats.min,
    mean_eur_mwh: prices.stats.mean,
  };

  return {
    lat: p.lat,
    lon: p.lon,
    zone: p.zone.toUpperCase(),
    technology: "pv",
    capacity_mw: p.capacity_mw,
    terrain: terrain
      ? { elevation_m: terrain.elevation_m, slope_deg: terrain.slope_deg, aspect_cardinal: terrain.aspect_cardinal }
      : null,
    revenue: {
      annual_generation_mwh,
      capacity_factor,
      capture_price_eur_mwh,
      estimated_annual_revenue_eur,
    },
    price_snapshot,
    caveats: [...COMMON_CAVEATS, ...PV_CAVEATS],
    disclaimer: DISCLAIMER,
  };
}

// ---------------------------------------------------------------------------
// BESS revenue
// ---------------------------------------------------------------------------

async function estimateBessRevenue(p: RevenueParams): Promise<SiteRevenueResult> {
  const [spreadResult, terrainResult] = await Promise.allSettled([
    getPriceSpreadAnalysis({ zone: p.zone, date: p.date, efficiency: 0.88, cycles: 2 }),
    getTerrainAnalysis({ lat: p.lat, lon: p.lon }),
  ]);

  // Spread is required.
  if (spreadResult.status === "rejected") {
    throw new Error(
      `Price spread analysis failed: ${spreadResult.reason instanceof Error ? spreadResult.reason.message : String(spreadResult.reason)}`,
    );
  }

  const spread = spreadResult.value;
  const terrain = terrainResult.status === "fulfilled" ? terrainResult.value : null;

  const daily_revenue_eur = round2(spread.revenuePerMwDay * p.capacity_mw);
  const estimated_annual_revenue_eur = round2(daily_revenue_eur * 365);

  const price_snapshot: PriceSnapshot = {
    date: spread.date,
    peak_eur_mwh: spread.peakPrice,
    off_peak_eur_mwh: spread.offPeakPrice,
    mean_eur_mwh: round2((spread.peakPrice + spread.offPeakPrice) / 2),
  };

  return {
    lat: p.lat,
    lon: p.lon,
    zone: p.zone.toUpperCase(),
    technology: "bess",
    capacity_mw: p.capacity_mw,
    terrain: terrain
      ? { elevation_m: terrain.elevation_m, slope_deg: terrain.slope_deg, aspect_cardinal: terrain.aspect_cardinal }
      : null,
    revenue: {
      daily_spread_eur_mwh: spread.netSpread,
      daily_revenue_eur,
      arb_signal: spread.signal,
      estimated_annual_revenue_eur,
    },
    price_snapshot,
    caveats: [...COMMON_CAVEATS, ...BESS_CAVEATS],
    disclaimer: DISCLAIMER,
  };
}
