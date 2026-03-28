import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const API_BASE = "https://api.energy-charts.info";
const cache = new TtlCache();

export const energyChartsSchema = z.object({
  dataset: z
    .enum(["prices", "generation", "flows"])
    .describe(
      '"prices" = day-ahead electricity prices (15-min resolution). ' +
        '"generation" = real-time generation by fuel type. ' +
        '"flows" = cross-border physical flows.'
    ),
  zone: z
    .string()
    .describe(
      "Country or bidding zone code. " +
        "For prices: DE-LU, FR, ES, IT-North, NL, BE, AT, PL, NO2, SE4, DK1, DK2, CZ, HU, RO, BG, HR, SI, SK, GR, PT, FI, LT, LV, EE, IE-SEM. " +
        "For generation/flows: de, fr, es, it, nl, be, at, pl, no, se, dk, cz, hu, ro, bg, hr, si, sk, gr, pt, fi, lt, lv, ee, ie."
    ),
  start_date: z
    .string()
    .optional()
    .describe("Start date YYYY-MM-DD. Defaults to today."),
  end_date: z
    .string()
    .optional()
    .describe("End date YYYY-MM-DD. Defaults to start + 1 day."),
});

// ---------------------------------------------------------------------------
// Shared fetch with caching
// ---------------------------------------------------------------------------

async function fetchEnergyCharts<T>(url: string): Promise<T> {
  const cached = cache.get<T>(url);
  if (cached) return cached;

  const response = await fetch(url, {
    headers: { "User-Agent": "luminus-mcp/0.1" },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `energy-charts.info returned ${response.status}: ${body.slice(0, 300)}`
    );
  }

  const json = (await response.json()) as T;
  cache.set(url, json, TTL.REALTIME);
  return json;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function resolveDates(startDate?: string, endDate?: string): { start: string; end: string } {
  const today = new Date().toISOString().slice(0, 10);
  const start = startDate ?? today;

  if (endDate) {
    return { start, end: endDate };
  }

  const startDt = new Date(start + "T00:00:00Z");
  const endDt = new Date(startDt.getTime() + 24 * 60 * 60 * 1000);
  return { start, end: endDt.toISOString().slice(0, 10) };
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

interface PricesApiResponse {
  unix_seconds: number[];
  price: number[];
  unit: string;
}

interface PricePoint15min {
  timestamp: string;
  price: number;
}

interface PricePointHourly {
  hour: number;
  price: number;
}

interface PricesResult {
  zone: string;
  start_date: string;
  end_date: string;
  source: string;
  resolution: string;
  prices_15min: PricePoint15min[];
  prices_hourly: PricePointHourly[];
  stats: { min: number; max: number; mean: number };
}

async function fetchPrices(
  zone: string,
  startDate?: string,
  endDate?: string
): Promise<PricesResult> {
  const { start, end } = resolveDates(startDate, endDate);
  const url = `${API_BASE}/price?bzn=${encodeURIComponent(zone)}&start=${start}&end=${end}`;

  const data = await fetchEnergyCharts<PricesApiResponse>(url);

  if (!data.unix_seconds || data.unix_seconds.length === 0) {
    throw new Error(`No price data returned for zone "${zone}" (${start} to ${end}).`);
  }

  // Build 15-min price points, capped at first 96
  const maxPoints = Math.min(data.unix_seconds.length, 96);
  const prices15min: PricePoint15min[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const ts = data.unix_seconds[i];
    const price = data.price[i];
    if (ts == null || price == null || !Number.isFinite(price)) continue;
    prices15min.push({
      timestamp: new Date(ts * 1000).toISOString(),
      price: Math.round(price * 100) / 100,
    });
  }

  // Convert 15-min to hourly by averaging each 4 consecutive values
  const pricesHourly: PricePointHourly[] = [];
  for (let h = 0; h < Math.floor(prices15min.length / 4); h++) {
    const chunk = prices15min.slice(h * 4, h * 4 + 4);
    const avg = chunk.reduce((s, p) => s + p.price, 0) / chunk.length;
    pricesHourly.push({
      hour: h,
      price: Math.round(avg * 100) / 100,
    });
  }

  const values = prices15min.map((p) => p.price);
  const min = values.length > 0 ? Math.round(Math.min(...values) * 100) / 100 : 0;
  const max = values.length > 0 ? Math.round(Math.max(...values) * 100) / 100 : 0;
  const mean =
    values.length > 0
      ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100
      : 0;

  return {
    zone,
    start_date: start,
    end_date: end,
    source: "energy-charts.info",
    resolution: "15min",
    prices_15min: prices15min,
    prices_hourly: pricesHourly,
    stats: { min, max, mean },
  };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

interface ProductionType {
  name: string;
  data: (number | null)[];
}

interface GenerationApiResponse {
  unix_seconds: number[];
  production_types: ProductionType[];
}

interface GenerationEntry {
  fuel: string;
  generation_mw: number;
}

interface GenerationResult {
  zone: string;
  timestamp: string;
  source: string;
  generation: GenerationEntry[];
  total_mw: number;
  renewable_pct: number;
}

/** Fuel category mapping: source name -> aggregated category */
const FUEL_CATEGORIES: Record<string, string> = {
  "Wind onshore": "Wind",
  "Wind offshore": "Wind",
  Solar: "Solar",
  "Fossil gas": "Gas",
  "Fossil coal-derived gas": "Gas",
  Nuclear: "Nuclear",
  "Hydro Run-of-River": "Hydro",
  "Hydro water reservoir": "Hydro",
  "Hydro pumped storage": "Hydro",
  "Fossil brown coal / lignite": "Coal",
  "Fossil hard coal": "Coal",
  Biomass: "Biomass",
};

/** Production types to exclude from aggregation (consumption, load, cross-border) */
const EXCLUDED_TYPES = new Set([
  "Load",
  "Residual load",
  "Pumped storage consumption",
  "Cross border electricity trading",
  "Power consumption",
  "Import Balance",
  "Export Balance",
]);

const RENEWABLE_FUELS = new Set(["Wind", "Solar", "Hydro", "Biomass"]);

function getLatestNonNull(data: (number | null)[]): number | null {
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i] != null && Number.isFinite(data[i])) {
      return data[i];
    }
  }
  return null;
}

async function fetchGeneration(
  zone: string,
  startDate?: string,
  endDate?: string
): Promise<GenerationResult> {
  const { start, end } = resolveDates(startDate, endDate);
  const url = `${API_BASE}/public_power?country=${encodeURIComponent(zone)}&start=${start}&end=${end}`;

  const data = await fetchEnergyCharts<GenerationApiResponse>(url);

  if (!data.production_types || data.production_types.length === 0) {
    throw new Error(`No generation data returned for zone "${zone}" (${start} to ${end}).`);
  }

  // Aggregate by fuel category
  const categoryMw = new Map<string, number>();

  for (const pt of data.production_types) {
    if (EXCLUDED_TYPES.has(pt.name)) continue;

    const category = FUEL_CATEGORIES[pt.name] ?? "Other";
    const mw = getLatestNonNull(pt.data);
    if (mw == null || mw <= 0) continue;

    categoryMw.set(category, (categoryMw.get(category) ?? 0) + mw);
  }

  const generation: GenerationEntry[] = [];
  for (const [fuel, mw] of categoryMw.entries()) {
    generation.push({ fuel, generation_mw: Math.round(mw) });
  }
  generation.sort((a, b) => b.generation_mw - a.generation_mw);

  const totalMw = generation.reduce((sum, g) => sum + g.generation_mw, 0);
  const renewableMw = generation
    .filter((g) => RENEWABLE_FUELS.has(g.fuel))
    .reduce((sum, g) => sum + g.generation_mw, 0);
  const renewablePct =
    totalMw > 0 ? Math.round((renewableMw / totalMw) * 1000) / 10 : 0;

  // Determine timestamp from the latest non-null entry
  let timestamp = new Date().toISOString();
  if (data.unix_seconds && data.unix_seconds.length > 0) {
    const lastTs = data.unix_seconds[data.unix_seconds.length - 1];
    if (lastTs != null) {
      timestamp = new Date(lastTs * 1000).toISOString();
    }
  }

  return {
    zone,
    timestamp,
    source: "energy-charts.info",
    generation,
    total_mw: totalMw,
    renewable_pct: renewablePct,
  };
}

// ---------------------------------------------------------------------------
// Cross-border flows
// ---------------------------------------------------------------------------

interface FlowCountry {
  name: string;
  data: (number | null)[];
}

interface FlowsApiResponse {
  unix_seconds: number[];
  countries: FlowCountry[];
}

interface FlowEntry {
  country: string;
  flow_mw: number;
}

interface FlowsResult {
  zone: string;
  source: string;
  flows: FlowEntry[];
  net_position_mw: number;
}

async function fetchFlows(zone: string): Promise<FlowsResult> {
  const url = `${API_BASE}/cbpf?country=${encodeURIComponent(zone)}`;

  const data = await fetchEnergyCharts<FlowsApiResponse>(url);

  if (!data.countries || data.countries.length === 0) {
    throw new Error(`No cross-border flow data returned for zone "${zone}".`);
  }

  const flows: FlowEntry[] = [];
  let netPosition = 0;

  for (const country of data.countries) {
    const mw = getLatestNonNull(country.data);
    if (mw == null) continue;

    const rounded = Math.round(mw);
    flows.push({ country: country.name, flow_mw: rounded });
    netPosition += rounded;
  }

  flows.sort((a, b) => Math.abs(b.flow_mw) - Math.abs(a.flow_mw));

  return {
    zone,
    source: "energy-charts.info",
    flows,
    net_position_mw: netPosition,
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

type EnergyChartsResult = PricesResult | GenerationResult | FlowsResult;

export async function getEnergyCharts(
  params: z.infer<typeof energyChartsSchema>
): Promise<EnergyChartsResult> {
  switch (params.dataset) {
    case "prices":
      return fetchPrices(params.zone, params.start_date, params.end_date);
    case "generation":
      return fetchGeneration(params.zone, params.start_date, params.end_date);
    case "flows":
      return fetchFlows(params.zone);
    default:
      throw new Error(
        `Unknown dataset "${params.dataset}". Use: prices, generation, flows.`
      );
  }
}
