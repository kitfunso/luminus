import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const API_BASE = "https://data.elexon.co.uk/bmrs/api/v1";
const cache = new TtlCache();

export const elexonBmrsSchema = z.object({
  dataset: z
    .enum([
      "imbalance_prices",
      "generation_by_fuel",
      "balancing_bids",
      "system_warnings",
      "interconnector_flows",
    ])
    .describe(
      '"imbalance_prices" = GB settlement-period imbalance/cashout prices. ' +
        '"generation_by_fuel" = half-hourly generation by fuel type (MW). ' +
        '"balancing_bids" = balancing mechanism bids and offers. ' +
        '"system_warnings" = system operator warnings and notifications. ' +
        '"interconnector_flows" = cross-border interconnector flows (MW).'
    ),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchBmrs(path: string): Promise<any> {
  const url = `${API_BASE}${path}`;

  const cached = cache.get(url);
  if (cached) return cached;

  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Elexon BMRS returned ${response.status}: ${body.slice(0, 300)}`);
  }

  const json = await response.json();
  cache.set(url, json, TTL.BALANCING);
  return json;
}

interface ImbalancePriceRecord {
  settlement_date: string;
  settlement_period: number;
  imbalance_price_gbp: number;
  system_sell_price_gbp: number;
  system_buy_price_gbp: number;
}

interface ImbalanceResult {
  dataset: "imbalance_prices";
  source: string;
  records: ImbalancePriceRecord[];
}

async function fetchImbalancePrices(date: string): Promise<ImbalanceResult> {
  const data = await fetchBmrs(
    `/balancing/settlement/system-prices?settlementDate=${date}&format=json`
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = data?.data ?? [];
  const recent = rows.slice(-24);

  const records: ImbalancePriceRecord[] = recent.map((r) => ({
    settlement_date: r.settlementDate ?? date,
    settlement_period: Number(r.settlementPeriod ?? 0),
    imbalance_price_gbp: Math.round((Number(r.systemSellPrice ?? 0)) * 100) / 100,
    system_sell_price_gbp: Math.round((Number(r.systemSellPrice ?? 0)) * 100) / 100,
    system_buy_price_gbp: Math.round((Number(r.systemBuyPrice ?? 0)) * 100) / 100,
  }));

  return { dataset: "imbalance_prices", source: "Elexon BMRS", records };
}

interface FuelGenRecord {
  fuel_type: string;
  generation_mw: number;
  settlement_period: number;
}

interface GenerationByFuelResult {
  dataset: "generation_by_fuel";
  source: string;
  date: string;
  records: FuelGenRecord[];
}

async function fetchGenerationByFuel(date: string): Promise<GenerationByFuelResult> {
  const data = await fetchBmrs(
    `/generation/outturn/summary?settlementDate=${date}&format=json`
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = data?.data ?? [];
  const recent = rows.slice(-20);

  const records: FuelGenRecord[] = recent.map((r) => ({
    fuel_type: r.fuelType ?? "Unknown",
    generation_mw: Math.round(Number(r.currentMw ?? r.generation ?? 0)),
    settlement_period: Number(r.settlementPeriod ?? 0),
  }));

  return { dataset: "generation_by_fuel", source: "Elexon BMRS", date, records };
}

interface BalancingBidRecord {
  bmu_id: string;
  bid_offer: string;
  level_mw: number;
  price_gbp: number;
  settlement_period: number;
}

interface BalancingBidsResult {
  dataset: "balancing_bids";
  source: string;
  date: string;
  records: BalancingBidRecord[];
}

async function fetchBalancingBids(date: string): Promise<BalancingBidsResult> {
  const data = await fetchBmrs(
    `/balancing/physical?settlementDate=${date}&format=json`
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = data?.data ?? [];
  const recent = rows.slice(-30);

  const records: BalancingBidRecord[] = recent.map((r) => ({
    bmu_id: r.bmUnit ?? r.nationalGridBmUnit ?? "Unknown",
    bid_offer: r.bidOfferPairId ?? "unknown",
    level_mw: Math.round(Number(r.levelMw ?? r.pnLevelMw ?? 0)),
    price_gbp: Math.round((Number(r.price ?? 0)) * 100) / 100,
    settlement_period: Number(r.settlementPeriod ?? 0),
  }));

  return { dataset: "balancing_bids", source: "Elexon BMRS", date, records };
}

interface SystemWarning {
  warning_type: string;
  message: string;
  published: string;
}

interface SystemWarningsResult {
  dataset: "system_warnings";
  source: string;
  warnings: SystemWarning[];
}

async function fetchSystemWarnings(): Promise<SystemWarningsResult> {
  const data = await fetchBmrs(`/system/warnings?format=json`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = data?.data ?? [];

  const warnings: SystemWarning[] = rows.slice(0, 20).map((r) => ({
    warning_type: r.warningType ?? "unknown",
    message: r.description ?? r.message ?? "",
    published: r.publishTime ?? r.createdDateTime ?? "",
  }));

  return { dataset: "system_warnings", source: "Elexon BMRS", warnings };
}

interface InterconnectorRecord {
  interconnector: string;
  flow_mw: number;
  direction: string;
  settlement_period: number;
}

interface InterconnectorResult {
  dataset: "interconnector_flows";
  source: string;
  date: string;
  records: InterconnectorRecord[];
}

async function fetchInterconnectors(date: string): Promise<InterconnectorResult> {
  const data = await fetchBmrs(
    `/generation/outturn/interconnectors?settlementDate=${date}&format=json`
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = data?.data ?? [];
  const recent = rows.slice(-20);

  const records: InterconnectorRecord[] = recent.map((r) => ({
    interconnector: r.interconnectorName ?? r.interconnectorId ?? "Unknown",
    flow_mw: Math.round(Number(r.generation ?? r.estimate ?? 0)),
    direction: Number(r.generation ?? 0) >= 0 ? "import" : "export",
    settlement_period: Number(r.settlementPeriod ?? 0),
  }));

  return { dataset: "interconnector_flows", source: "Elexon BMRS", date, records };
}

type ElexonResult =
  | ImbalanceResult
  | GenerationByFuelResult
  | BalancingBidsResult
  | SystemWarningsResult
  | InterconnectorResult;

export async function getElexonBmrs(
  params: z.infer<typeof elexonBmrsSchema>
): Promise<ElexonResult> {
  const date = params.date ?? new Date().toISOString().slice(0, 10);

  switch (params.dataset) {
    case "imbalance_prices":
      return fetchImbalancePrices(date);
    case "generation_by_fuel":
      return fetchGenerationByFuel(date);
    case "balancing_bids":
      return fetchBalancingBids(date);
    case "system_warnings":
      return fetchSystemWarnings();
    case "interconnector_flows":
      return fetchInterconnectors(date);
  }
}
