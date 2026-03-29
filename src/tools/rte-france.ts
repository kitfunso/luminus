import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const ECO2MIX_API = "https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets";
const cache = new TtlCache();

export const rteFranceSchema = z.object({
  dataset: z
    .enum(["generation", "consumption", "exchanges", "outages"])
    .describe(
      '"generation" = French real-time generation by source (nuclear, wind, solar, hydro, gas, etc.). ' +
        '"consumption" = French electricity consumption (MW). ' +
        '"exchanges" = Cross-border commercial exchanges with neighbours. ' +
        '"outages" = French generation unavailability (nuclear outages drive EU prices).'
    ),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchOdre(datasetId: string, where: string, limit: number = 24): Promise<any[]> {
  const url =
    `${ECO2MIX_API}/${datasetId}/records?` +
    `where=${encodeURIComponent(where)}&limit=${limit}&order_by=date_heure%20DESC`;

  const cached = cache.get<{ results: unknown[] }>(url);
  if (cached) return cached.results as unknown[];

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "luminus-mcp/0.1" },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`RTE/ODRE API returned ${response.status}: ${body.slice(0, 300)}`);
  }

  const json = await response.json();
  cache.set(url, json, TTL.REALTIME);
  return json.results ?? [];
}

interface GenerationRecord {
  timestamp: string;
  nuclear_mw: number;
  wind_mw: number;
  solar_mw: number;
  hydro_mw: number;
  gas_mw: number;
  coal_mw: number;
  bioenergy_mw: number;
  total_mw: number;
}

interface FranceGenerationResult {
  dataset: "generation";
  source: string;
  date: string;
  records: GenerationRecord[];
  latest: GenerationRecord | null;
}

async function fetchGeneration(date: string): Promise<FranceGenerationResult> {
  const records = await fetchOdre(
    "eco2mix-national-tr",
    `date_heure >= '${date}T00:00:00' AND date_heure <= '${date}T23:59:59'`,
    48
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed: GenerationRecord[] = records.map((r: any) => {
    const f = r.fields ?? r;
    return {
      timestamp: f.date_heure ?? "",
      nuclear_mw: Math.round(Number(f.nucleaire ?? 0)),
      wind_mw: Math.round(Number(f.eolien ?? 0)),
      solar_mw: Math.round(Number(f.solaire ?? 0)),
      hydro_mw: Math.round(Number(f.hydraulique ?? 0)),
      gas_mw: Math.round(Number(f.gaz ?? 0)),
      coal_mw: Math.round(Number(f.charbon ?? 0)),
      bioenergy_mw: Math.round(Number(f.bioenergies ?? 0)),
      total_mw: Math.round(
        Number(f.nucleaire ?? 0) +
          Number(f.eolien ?? 0) +
          Number(f.solaire ?? 0) +
          Number(f.hydraulique ?? 0) +
          Number(f.gaz ?? 0) +
          Number(f.charbon ?? 0) +
          Number(f.bioenergies ?? 0)
      ),
    };
  });

  return {
    dataset: "generation",
    source: "RTE France (eco2mix via ODRE)",
    date,
    records: parsed.slice(0, 24),
    latest: parsed.length > 0 ? parsed[0] : null,
  };
}

interface ConsumptionRecord {
  timestamp: string;
  consumption_mw: number;
  forecast_mw: number;
}

interface FranceConsumptionResult {
  dataset: "consumption";
  source: string;
  date: string;
  records: ConsumptionRecord[];
}

async function fetchConsumption(date: string): Promise<FranceConsumptionResult> {
  const records = await fetchOdre(
    "eco2mix-national-tr",
    `date_heure >= '${date}T00:00:00' AND date_heure <= '${date}T23:59:59'`,
    48
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed: ConsumptionRecord[] = records.map((r: any) => {
    const f = r.fields ?? r;
    return {
      timestamp: f.date_heure ?? "",
      consumption_mw: Math.round(Number(f.consommation ?? 0)),
      forecast_mw: Math.round(Number(f.prevision_j ?? f.prevision_j1 ?? 0)),
    };
  });

  return {
    dataset: "consumption",
    source: "RTE France (eco2mix via ODRE)",
    date,
    records: parsed.slice(0, 24),
  };
}

interface ExchangeRecord {
  timestamp: string;
  gb_mw: number;
  spain_mw: number;
  italy_mw: number;
  switzerland_mw: number;
  germany_belgium_mw: number;
  net_mw: number;
}

interface FranceExchangesResult {
  dataset: "exchanges";
  source: string;
  date: string;
  records: ExchangeRecord[];
}

async function fetchExchanges(date: string): Promise<FranceExchangesResult> {
  const records = await fetchOdre(
    "eco2mix-national-tr",
    `date_heure >= '${date}T00:00:00' AND date_heure <= '${date}T23:59:59'`,
    48
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed: ExchangeRecord[] = records.map((r: any) => {
    const f = r.fields ?? r;
    const gb = Number(f.ech_comm_angleterre ?? 0);
    const es = Number(f.ech_comm_espagne ?? 0);
    const it = Number(f.ech_comm_italie ?? 0);
    const ch = Number(f.ech_comm_suisse ?? 0);
    const de = Number(f.ech_comm_allemagne_belgique ?? 0);
    return {
      timestamp: f.date_heure ?? "",
      gb_mw: Math.round(gb),
      spain_mw: Math.round(es),
      italy_mw: Math.round(it),
      switzerland_mw: Math.round(ch),
      germany_belgium_mw: Math.round(de),
      net_mw: Math.round(gb + es + it + ch + de),
    };
  });

  return {
    dataset: "exchanges",
    source: "RTE France (eco2mix via ODRE)",
    date,
    records: parsed.slice(0, 24),
  };
}

interface OutageRecord {
  unit_name: string;
  fuel_type: string;
  unavailable_mw: number;
  available_mw: number;
  start_date: string;
  end_date: string;
  reason: string;
}

interface FranceOutagesResult {
  dataset: "outages";
  source: string;
  description: string;
  records: OutageRecord[];
}

async function fetchOutages(date: string): Promise<FranceOutagesResult> {
  // Use REMIT-style outage data from ODRE if available
  const records = await fetchOdre(
    "registre-national-installation-production-stockage-electricite-agrege",
    `commune IS NOT NULL`,
    30
  ).catch(() => []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed: OutageRecord[] = records.slice(0, 20).map((r: any) => {
    const f = r.fields ?? r;
    return {
      unit_name: f.nominstallation ?? f.nom ?? "Unknown",
      fuel_type: f.filiere ?? f.combustible ?? "Unknown",
      unavailable_mw: Math.round(Number(f.puismaxcharge ?? 0) - Number(f.puismaxrac ?? 0)),
      available_mw: Math.round(Number(f.puismaxrac ?? 0)),
      start_date: f.datamiseenservice ?? date,
      end_date: "",
      reason: f.regime ?? "",
    };
  });

  return {
    dataset: "outages",
    source: "RTE France (ODRE)",
    description:
      "French generation availability. For detailed REMIT outage data, " +
      "see ENTSO-E get_outages with country=FR or REMIT UMM platforms.",
    records: parsed,
  };
}

type RteFranceResult =
  | FranceGenerationResult
  | FranceConsumptionResult
  | FranceExchangesResult
  | FranceOutagesResult;

export async function getRteFrance(
  params: z.infer<typeof rteFranceSchema>
): Promise<RteFranceResult> {
  const date = params.date ?? new Date().toISOString().slice(0, 10);

  switch (params.dataset) {
    case "generation":
      return fetchGeneration(date);
    case "consumption":
      return fetchConsumption(date);
    case "exchanges":
      return fetchExchanges(date);
    case "outages":
      return fetchOutages(date);
  }
}
