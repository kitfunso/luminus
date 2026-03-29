import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const API_BASE = "https://api.energidataservice.dk/dataset";
const cache = new TtlCache();

const DATASETS = [
  "co2_emissions",
  "electricity_production",
  "electricity_prices",
  "electricity_balance",
] as const;

export const energiDataSchema = z.object({
  dataset: z
    .enum(DATASETS)
    .describe(
      '"co2_emissions" = real-time CO2 emissions intensity for DK1/DK2 (gCO2/kWh). ' +
        '"electricity_production" = Danish electricity production by source (MW). ' +
        '"electricity_prices" = day-ahead spot prices for DK1/DK2 (DKK & EUR/MWh). ' +
        '"electricity_balance" = production, consumption, import/export balance.'
    ),
  zone: z
    .enum(["DK1", "DK2", "DK"])
    .optional()
    .describe("DK1 = West Denmark, DK2 = East Denmark, DK = both. Defaults to DK."),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
});

const DATASET_NAMES: Record<string, string> = {
  co2_emissions: "CO2Emis",
  electricity_production: "ElectricityProdex5MinRealtime",
  electricity_prices: "Elspotprices",
  electricity_balance: "ElectricityBalanceNonv",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchEnergiData(datasetName: string, filter: string, limit: number = 48): Promise<any[]> {
  const url =
    `${API_BASE}/${datasetName}?limit=${limit}&offset=0&sort=Minutes5UTC%20DESC` +
    `&filter=${encodeURIComponent(filter)}`;

  const cached = cache.get<{ records: unknown[] }>(url);
  if (cached) return cached.records as unknown[];

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    // Try alternative sort column
    const altUrl =
      `${API_BASE}/${datasetName}?limit=${limit}&offset=0&sort=HourUTC%20DESC` +
      `&filter=${encodeURIComponent(filter)}`;

    const altResponse = await fetch(altUrl, {
      headers: { Accept: "application/json" },
    });

    if (!altResponse.ok) {
      const body = await altResponse.text();
      throw new Error(
        `Energi Data Service returned ${altResponse.status}: ${body.slice(0, 300)}`
      );
    }

    const altJson = await altResponse.json();
    cache.set(url, altJson, TTL.REALTIME);
    return altJson.records ?? [];
  }

  const json = await response.json();
  cache.set(url, json, TTL.REALTIME);
  return json.records ?? [];
}

interface Co2Record {
  timestamp: string;
  zone: string;
  co2_gkwh: number;
}

interface Co2Result {
  dataset: "co2_emissions";
  source: string;
  zone: string;
  records: Co2Record[];
}

async function fetchCo2(zone: string, date: string): Promise<Co2Result> {
  const filter =
    zone === "DK"
      ? `{"Minutes5UTC": {"$gte": "${date}T00:00"}}`
      : `{"PriceArea": "${zone}", "Minutes5UTC": {"$gte": "${date}T00:00"}}`;

  const records = await fetchEnergiData("CO2Emis", filter, 48);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed: Co2Record[] = records.map((r: any) => ({
    timestamp: r.Minutes5UTC ?? r.Minutes5DK ?? "",
    zone: r.PriceArea ?? zone,
    co2_gkwh: Math.round((Number(r.CO2Emission ?? 0)) * 10) / 10,
  }));

  return {
    dataset: "co2_emissions",
    source: "Energi Data Service (Energinet)",
    zone,
    records: parsed,
  };
}

interface ProductionRecord {
  timestamp: string;
  zone: string;
  wind_onshore_mw: number;
  wind_offshore_mw: number;
  solar_mw: number;
  thermal_mw: number;
  hydro_mw: number;
  total_mw: number;
}

interface ProductionResult {
  dataset: "electricity_production";
  source: string;
  zone: string;
  records: ProductionRecord[];
}

async function fetchProduction(zone: string, date: string): Promise<ProductionResult> {
  const filter =
    zone === "DK"
      ? `{"Minutes5UTC": {"$gte": "${date}T00:00"}}`
      : `{"PriceArea": "${zone}", "Minutes5UTC": {"$gte": "${date}T00:00"}}`;

  const records = await fetchEnergiData("ElectricityProdex5MinRealtime", filter, 48);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed: ProductionRecord[] = records.map((r: any) => {
    const windOn = Number(r.OnshoreWindPower ?? r.OnshoreWindGe100MW_MWh ?? 0);
    const windOff = Number(r.OffshoreWindPower ?? r.OffshoreWindGe100MW_MWh ?? 0);
    const solar = Number(r.SolarPower ?? r.SolarGe100MW_MWh ?? 0);
    const thermal = Number(r.ThermalPower ?? r.CentralPowerMWh ?? 0);
    const hydro = Number(r.HydroPower ?? 0);
    return {
      timestamp: r.Minutes5UTC ?? r.Minutes5DK ?? "",
      zone: r.PriceArea ?? zone,
      wind_onshore_mw: Math.round(windOn),
      wind_offshore_mw: Math.round(windOff),
      solar_mw: Math.round(solar),
      thermal_mw: Math.round(thermal),
      hydro_mw: Math.round(hydro),
      total_mw: Math.round(windOn + windOff + solar + thermal + hydro),
    };
  });

  return {
    dataset: "electricity_production",
    source: "Energi Data Service (Energinet)",
    zone,
    records: parsed,
  };
}

interface PriceRecord {
  timestamp: string;
  zone: string;
  price_eur_mwh: number;
  price_dkk_mwh: number;
}

interface PricesResult {
  dataset: "electricity_prices";
  source: string;
  zone: string;
  records: PriceRecord[];
}

async function fetchPrices(zone: string, date: string): Promise<PricesResult> {
  const filter =
    zone === "DK"
      ? `{"HourUTC": {"$gte": "${date}T00:00"}}`
      : `{"PriceArea": "${zone}", "HourUTC": {"$gte": "${date}T00:00"}}`;

  const records = await fetchEnergiData("Elspotprices", filter, 48);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed: PriceRecord[] = records.map((r: any) => ({
    timestamp: r.HourUTC ?? r.HourDK ?? "",
    zone: r.PriceArea ?? zone,
    price_eur_mwh: Math.round((Number(r.SpotPriceEUR ?? 0)) * 100) / 100,
    price_dkk_mwh: Math.round((Number(r.SpotPriceDKK ?? 0)) * 100) / 100,
  }));

  return {
    dataset: "electricity_prices",
    source: "Energi Data Service (Energinet)",
    zone,
    records: parsed,
  };
}

interface BalanceRecord {
  timestamp: string;
  zone: string;
  production_mwh: number;
  consumption_mwh: number;
  import_mwh: number;
  export_mwh: number;
  net_exchange_mwh: number;
}

interface BalanceResult {
  dataset: "electricity_balance";
  source: string;
  zone: string;
  records: BalanceRecord[];
}

async function fetchBalance(zone: string, date: string): Promise<BalanceResult> {
  const filter =
    zone === "DK"
      ? `{"HourUTC": {"$gte": "${date}T00:00"}}`
      : `{"PriceArea": "${zone}", "HourUTC": {"$gte": "${date}T00:00"}}`;

  const records = await fetchEnergiData("ElectricityBalanceNonv", filter, 48);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed: BalanceRecord[] = records.map((r: any) => {
    const prod = Number(r.ProductionGe100MW ?? r.GrossCon ?? 0);
    const cons = Number(r.GrossCon ?? 0);
    const imp = Number(r.ExchangeContinent ?? 0) > 0 ? Number(r.ExchangeContinent ?? 0) : 0;
    const exp = Number(r.ExchangeContinent ?? 0) < 0 ? Math.abs(Number(r.ExchangeContinent ?? 0)) : 0;
    return {
      timestamp: r.HourUTC ?? r.HourDK ?? "",
      zone: r.PriceArea ?? zone,
      production_mwh: Math.round(prod),
      consumption_mwh: Math.round(cons),
      import_mwh: Math.round(imp),
      export_mwh: Math.round(exp),
      net_exchange_mwh: Math.round(Number(r.ExchangeContinent ?? 0)),
    };
  });

  return {
    dataset: "electricity_balance",
    source: "Energi Data Service (Energinet)",
    zone,
    records: parsed,
  };
}

type EnergiDataResult = Co2Result | ProductionResult | PricesResult | BalanceResult;

export async function getEnergiData(
  params: z.infer<typeof energiDataSchema>
): Promise<EnergiDataResult> {
  const zone = params.zone ?? "DK";
  const date = params.date ?? new Date().toISOString().slice(0, 10);

  switch (params.dataset) {
    case "co2_emissions":
      return fetchCo2(zone, date);
    case "electricity_production":
      return fetchProduction(zone, date);
    case "electricity_prices":
      return fetchPrices(zone, date);
    case "electricity_balance":
      return fetchBalance(zone, date);
  }
}
