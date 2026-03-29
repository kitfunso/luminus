import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const API_BASE = "https://api.esios.ree.es";
const REE_PUBLIC = "https://www.ree.es/en/datos/apidatos";
const cache = new TtlCache();

/** ESIOS indicator IDs for key datasets */
const INDICATORS: Record<string, number> = {
  day_ahead_price: 600,
  intraday_price: 612,
  demand_forecast: 460,
  demand_actual: 1293,
  wind_forecast: 541,
  wind_actual: 551,
  solar_forecast: 542,
  solar_actual: 552,
  generation_mix: 1295,
  interconnector_flows: 10210,
};

export const reeEsiosSchema = z.object({
  dataset: z
    .enum([
      "day_ahead_price",
      "demand",
      "generation",
      "wind_solar",
      "interconnectors",
    ])
    .describe(
      '"day_ahead_price" = Spanish day-ahead electricity prices (EUR/MWh). ' +
        '"demand" = forecast and actual demand (MW). ' +
        '"generation" = generation mix by technology. ' +
        '"wind_solar" = wind and solar forecast vs actual (MW). ' +
        '"interconnectors" = cross-border flows with France, Portugal, Morocco.'
    ),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
});

function getApiToken(): string {
  const token = process.env.ESIOS_API_TOKEN;
  if (!token) {
    throw new Error(
      "ESIOS_API_TOKEN environment variable is required. " +
        "Request a free token by emailing consultasios@ree.es or via " +
        REE_PUBLIC
    );
  }
  return token;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchEsios(indicatorId: number, startDate: string, endDate: string): Promise<any[]> {
  const url =
    `${API_BASE}/indicators/${indicatorId}?` +
    `start_date=${encodeURIComponent(startDate + "T00:00:00Z")}&` +
    `end_date=${encodeURIComponent(endDate + "T23:59:59Z")}`;

  const cached = cache.get<{ values: unknown[] }>(url);
  if (cached) return cached.values as unknown[];

  const response = await fetch(url, {
    headers: {
      Accept: "application/json; application/vnd.esios-api-v1+json",
      Authorization: `Token token="${getApiToken()}"`,
      "User-Agent": "luminus-mcp/0.1",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ESIOS API returned ${response.status}: ${body.slice(0, 300)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();
  const values = json?.indicator?.values ?? [];
  cache.set(url, { values }, TTL.PRICES);
  return values;
}

interface PriceRecord {
  timestamp: string;
  price_eur_mwh: number;
}

interface SpainPricesResult {
  dataset: "day_ahead_price";
  source: string;
  date: string;
  records: PriceRecord[];
  stats: { min: number; max: number; mean: number };
}

async function fetchPrices(date: string): Promise<SpainPricesResult> {
  const values = await fetchEsios(INDICATORS.day_ahead_price, date, date);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const records: PriceRecord[] = values.slice(0, 48).map((v: any) => ({
    timestamp: v.datetime ?? v.date ?? "",
    price_eur_mwh: Math.round((Number(v.value ?? 0)) * 100) / 100,
  }));

  const prices = records.map((r) => r.price_eur_mwh);

  return {
    dataset: "day_ahead_price",
    source: "REE ESIOS (Red Eléctrica de España)",
    date,
    records,
    stats: {
      min: prices.length > 0 ? Math.round(Math.min(...prices) * 100) / 100 : 0,
      max: prices.length > 0 ? Math.round(Math.max(...prices) * 100) / 100 : 0,
      mean:
        prices.length > 0
          ? Math.round((prices.reduce((s, v) => s + v, 0) / prices.length) * 100) / 100
          : 0,
    },
  };
}

interface DemandRecord {
  timestamp: string;
  forecast_mw: number;
  actual_mw: number;
  error_mw: number;
}

interface SpainDemandResult {
  dataset: "demand";
  source: string;
  date: string;
  records: DemandRecord[];
}

async function fetchDemand(date: string): Promise<SpainDemandResult> {
  const [forecastValues, actualValues] = await Promise.all([
    fetchEsios(INDICATORS.demand_forecast, date, date),
    fetchEsios(INDICATORS.demand_actual, date, date),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actualMap = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actualValues.forEach((v: any) => {
    const ts = (v.datetime ?? "").slice(0, 16);
    actualMap.set(ts, Number(v.value ?? 0));
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const records: DemandRecord[] = forecastValues.slice(0, 48).map((v: any) => {
    const ts = (v.datetime ?? "").slice(0, 16);
    const forecast = Number(v.value ?? 0);
    const actual = actualMap.get(ts) ?? 0;
    return {
      timestamp: v.datetime ?? "",
      forecast_mw: Math.round(forecast),
      actual_mw: Math.round(actual),
      error_mw: Math.round(actual - forecast),
    };
  });

  return {
    dataset: "demand",
    source: "REE ESIOS",
    date,
    records,
  };
}

interface GenMixRecord {
  timestamp: string;
  technology: string;
  generation_mw: number;
}

interface SpainGenerationResult {
  dataset: "generation";
  source: string;
  date: string;
  records: GenMixRecord[];
}

async function fetchGeneration(date: string): Promise<SpainGenerationResult> {
  const values = await fetchEsios(INDICATORS.generation_mix, date, date);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const records: GenMixRecord[] = values.slice(0, 50).map((v: any) => ({
    timestamp: v.datetime ?? "",
    technology: v.geo_name ?? v.name ?? "Unknown",
    generation_mw: Math.round(Number(v.value ?? 0)),
  }));

  return {
    dataset: "generation",
    source: "REE ESIOS",
    date,
    records,
  };
}

interface WindSolarRecord {
  timestamp: string;
  wind_forecast_mw: number;
  wind_actual_mw: number;
  solar_forecast_mw: number;
  solar_actual_mw: number;
}

interface SpainWindSolarResult {
  dataset: "wind_solar";
  source: string;
  date: string;
  records: WindSolarRecord[];
}

async function fetchWindSolar(date: string): Promise<SpainWindSolarResult> {
  const [windFc, windAct, solarFc, solarAct] = await Promise.all([
    fetchEsios(INDICATORS.wind_forecast, date, date),
    fetchEsios(INDICATORS.wind_actual, date, date),
    fetchEsios(INDICATORS.solar_forecast, date, date),
    fetchEsios(INDICATORS.solar_actual, date, date),
  ]);

  // Build a time-aligned merge
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toMap = (arr: any[]) => {
    const m = new Map<string, number>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    arr.forEach((v: any) => {
      const ts = (v.datetime ?? "").slice(0, 16);
      m.set(ts, Number(v.value ?? 0));
    });
    return m;
  };

  const windActMap = toMap(windAct);
  const solarFcMap = toMap(solarFc);
  const solarActMap = toMap(solarAct);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const records: WindSolarRecord[] = windFc.slice(0, 48).map((v: any) => {
    const ts = (v.datetime ?? "").slice(0, 16);
    return {
      timestamp: v.datetime ?? "",
      wind_forecast_mw: Math.round(Number(v.value ?? 0)),
      wind_actual_mw: Math.round(windActMap.get(ts) ?? 0),
      solar_forecast_mw: Math.round(solarFcMap.get(ts) ?? 0),
      solar_actual_mw: Math.round(solarActMap.get(ts) ?? 0),
    };
  });

  return {
    dataset: "wind_solar",
    source: "REE ESIOS",
    date,
    records,
  };
}

interface InterconnectorRecord {
  border: string;
  flow_mw: number;
  direction: string;
  timestamp: string;
}

interface SpainInterconnectorsResult {
  dataset: "interconnectors";
  source: string;
  date: string;
  records: InterconnectorRecord[];
  net_import_mw: number;
}

async function fetchInterconnectors(date: string): Promise<SpainInterconnectorsResult> {
  const values = await fetchEsios(INDICATORS.interconnector_flows, date, date);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const records: InterconnectorRecord[] = values.slice(0, 30).map((v: any) => {
    const flow = Number(v.value ?? 0);
    return {
      border: v.geo_name ?? v.name ?? "Unknown",
      flow_mw: Math.round(flow),
      direction: flow >= 0 ? "import" : "export",
      timestamp: v.datetime ?? "",
    };
  });

  const netImport = records.reduce((s, r) => s + r.flow_mw, 0);

  return {
    dataset: "interconnectors",
    source: "REE ESIOS",
    date,
    records,
    net_import_mw: netImport,
  };
}

type ReeEsiosResult =
  | SpainPricesResult
  | SpainDemandResult
  | SpainGenerationResult
  | SpainWindSolarResult
  | SpainInterconnectorsResult;

export async function getReeEsios(
  params: z.infer<typeof reeEsiosSchema>
): Promise<ReeEsiosResult> {
  const date = params.date ?? new Date().toISOString().slice(0, 10);

  switch (params.dataset) {
    case "day_ahead_price":
      return fetchPrices(date);
    case "demand":
      return fetchDemand(date);
    case "generation":
      return fetchGeneration(date);
    case "wind_solar":
      return fetchWindSolar(date);
    case "interconnectors":
      return fetchInterconnectors(date);
  }
}
