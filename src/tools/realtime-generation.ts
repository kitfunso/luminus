import { z } from "zod";
import { queryEntsoe, dayRange } from "../lib/entsoe-client.js";
import { resolveZone, AVAILABLE_ZONES } from "../lib/zone-codes.js";
import { ensureArray } from "../lib/xml-parser.js";
import { TtlCache, TTL } from "../lib/cache.js";

const ELEXON_API = "https://data.elexon.co.uk/bmrs/api/v1";
const cache = new TtlCache();

export const realtimeGenerationSchema = z.object({
  zone: z
    .string()
    .describe(
      `Country/zone code. Examples: DE, FR, GB. Available: ${AVAILABLE_ZONES}`
    ),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
});

/** ENTSO-E PSR type codes to human-readable fuel names */
const PSR_TYPES: Record<string, string> = {
  B01: "Biomass",
  B02: "Lignite",
  B04: "Gas",
  B05: "Coal",
  B06: "Oil",
  B09: "Geothermal",
  B10: "Hydro Pumped Storage",
  B11: "Hydro Run-of-river",
  B12: "Hydro Reservoir",
  B14: "Nuclear",
  B15: "Other",
  B16: "Solar",
  B17: "Waste",
  B18: "Wind Offshore",
  B19: "Wind Onshore",
};

interface GenerationEntry {
  fuel: string;
  fuel_code: string;
  generation_mw: number;
}

interface RealtimeGenerationResult {
  zone: string;
  date: string;
  generation: GenerationEntry[];
  total_mw: number;
  timestamp: string;
}

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

async function getGbGeneration(date: string): Promise<RealtimeGenerationResult> {
  const data = await fetchElexon(`/datasets/FUELHH?format=json`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = data?.data ?? [];
  if (rows.length === 0) {
    throw new Error("No GB generation data available from Elexon BMRS.");
  }

  // Group by fuelType, take latest settlement period
  const latestPeriod = Math.max(
    ...rows.map((r) => Number(r.settlementPeriod ?? 0))
  );
  const latestRows = rows.filter(
    (r) => Number(r.settlementPeriod) === latestPeriod
  );

  const generation: GenerationEntry[] = [];
  for (const row of latestRows) {
    const fuelType = String(row.fuelType ?? "Unknown");
    const mw = Number(row.generation ?? 0);
    if (mw > 0) {
      generation.push({
        fuel: fuelType,
        fuel_code: fuelType,
        generation_mw: Math.round(mw),
      });
    }
  }

  generation.sort((a, b) => b.generation_mw - a.generation_mw);
  const total_mw = generation.reduce((sum, g) => sum + g.generation_mw, 0);

  const timestamp =
    latestRows[0]?.startTime ?? new Date().toISOString();

  return {
    zone: "GB",
    date,
    generation,
    total_mw,
    timestamp,
  };
}

async function getEntsoeGeneration(
  zone: string,
  date?: string
): Promise<RealtimeGenerationResult> {
  const eic = resolveZone(zone);
  const { periodStart, periodEnd } = dayRange(date);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await queryEntsoe(
    {
      documentType: "A75",
      processType: "A16",
      outBiddingZone_Domain: eic,
      periodStart,
      periodEnd,
    },
    TTL.REALTIME
  );

  const doc = data.GL_MarketDocument;
  if (!doc) throw new Error("No realtime generation data returned for this zone/date.");

  const timeSeries = ensureArray(doc.TimeSeries);
  const generation: GenerationEntry[] = [];
  let latestTimestamp = "";

  for (const ts of timeSeries) {
    const psrCode = ts.MktPSRType?.psrType ?? "unknown";
    const fuel = PSR_TYPES[psrCode] ?? psrCode;

    const periods = ensureArray(ts.Period);
    const lastPeriod = periods[periods.length - 1];
    if (!lastPeriod) continue;

    // Track the period start for timestamp
    const periodStartStr = lastPeriod.timeInterval?.start ?? "";
    if (periodStartStr > latestTimestamp) {
      latestTimestamp = periodStartStr;
    }

    const points = ensureArray(lastPeriod.Point);
    if (points.length === 0) continue;

    const latestPoint = points[points.length - 1];
    const mw = Number(latestPoint.quantity ?? 0);

    if (mw > 0) {
      generation.push({
        fuel,
        fuel_code: psrCode,
        generation_mw: Math.round(mw),
      });
    }
  }

  generation.sort((a, b) => b.generation_mw - a.generation_mw);
  const total_mw = generation.reduce((sum, g) => sum + g.generation_mw, 0);

  return {
    zone: zone.toUpperCase(),
    date: date ?? new Date().toISOString().slice(0, 10),
    generation,
    total_mw,
    timestamp: latestTimestamp || new Date().toISOString(),
  };
}

export async function getRealtimeGeneration(
  params: z.infer<typeof realtimeGenerationSchema>
): Promise<RealtimeGenerationResult> {
  const date = params.date ?? new Date().toISOString().slice(0, 10);

  if (params.zone.toUpperCase() === "GB") {
    return getGbGeneration(date);
  }

  return getEntsoeGeneration(params.zone, params.date);
}
