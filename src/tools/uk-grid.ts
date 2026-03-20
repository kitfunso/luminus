import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const ELEXON_API = "https://data.elexon.co.uk/bmrs/api/v1";
const cache = new TtlCache();

export const ukGridSchema = z.object({
  action: z
    .enum(["demand", "frequency"])
    .describe(
      '"demand" = current GB demand actuals (MW) per settlement period. ' +
        '"frequency" = real-time grid frequency (~50 Hz; deviations indicate stress).'
    ),
});

interface DemandRecord {
  timestamp: string;
  settlement_period: number;
  demand_mw: number;
  transmission_demand_mw: number;
}

interface DemandResult {
  action: "demand";
  description: string;
  records: DemandRecord[];
}

interface FrequencyResult {
  action: "frequency";
  description: string;
  timestamp: string;
  frequency_hz: number;
  deviation_hz: number;
}

type UkGridResult = DemandResult | FrequencyResult;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchElexon(path: string): Promise<any> {
  const url = `${ELEXON_API}${path}`;

  const cached = cache.get(url);
  if (cached) return cached;

  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Elexon BMRS API returned ${response.status}: ${body.slice(0, 300)}`
    );
  }

  const json = await response.json();
  cache.set(url, json, TTL.REALTIME);
  return json;
}

async function getDemand(): Promise<DemandResult> {
  const today = new Date().toISOString().slice(0, 10);
  const data = await fetchElexon(
    `/demand/outturn?settlementDateFrom=${today}&settlementDateTo=${today}&format=json`
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = data?.data ?? [];

  // Take last 24 periods (12 hours) for a useful window
  const recent = rows.slice(-24);

  const records: DemandRecord[] = recent.map((r) => ({
    timestamp: r.startTime ?? "",
    settlement_period: Number(r.settlementPeriod ?? 0),
    demand_mw: Number(r.initialDemandOutturn ?? 0),
    transmission_demand_mw: Number(r.initialTransmissionSystemDemandOutturn ?? 0),
  }));

  return {
    action: "demand",
    description: "GB electricity demand outturn (MW), recent settlement periods",
    records,
  };
}

async function getFrequency(): Promise<FrequencyResult> {
  const data = await fetchElexon("/datasets/FREQ?format=json");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = data?.data ?? [];

  if (rows.length === 0) {
    throw new Error("No frequency data available from Elexon BMRS.");
  }

  // First record is the most recent
  const row = rows[0];
  const freq = Number(row.frequency ?? 50.0);

  return {
    action: "frequency",
    description:
      "GB grid frequency (Hz). Nominal 50 Hz; deviations indicate grid stress.",
    timestamp: row.measurementTime ?? new Date().toISOString(),
    frequency_hz: Math.round(freq * 1000) / 1000,
    deviation_hz: Math.round((freq - 50.0) * 1000) / 1000,
  };
}

export async function getUkGridDemand(
  params: z.infer<typeof ukGridSchema>
): Promise<UkGridResult> {
  switch (params.action) {
    case "demand":
      return getDemand();
    case "frequency":
      return getFrequency();
  }
}
