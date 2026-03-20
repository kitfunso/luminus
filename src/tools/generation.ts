import { z } from "zod";
import { queryEntsoe, dayRange } from "../lib/entsoe-client.js";
import { resolveZone, AVAILABLE_ZONES } from "../lib/zone-codes.js";
import { ensureArray } from "../lib/xml-parser.js";
import { TTL } from "../lib/cache.js";

export const generationSchema = z.object({
  zone: z
    .string()
    .describe(
      `Country/zone code. Examples: DE, FR, GB, NL, ES. Available: ${AVAILABLE_ZONES}`
    ),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
});

/** ENTSO-E PSR type codes to human-readable fuel names */
const PSR_TYPES: Record<string, string> = {
  B01: "Biomass",
  B02: "Fossil Brown coal/Lignite",
  B03: "Fossil Coal-derived gas",
  B04: "Fossil Gas",
  B05: "Fossil Hard coal",
  B06: "Fossil Oil",
  B07: "Fossil Oil shale",
  B08: "Fossil Peat",
  B09: "Geothermal",
  B10: "Hydro Pumped Storage",
  B11: "Hydro Run-of-river and poundage",
  B12: "Hydro Water Reservoir",
  B13: "Marine",
  B14: "Nuclear",
  B15: "Other renewable",
  B16: "Solar",
  B17: "Waste",
  B18: "Wind Offshore",
  B19: "Wind Onshore",
  B20: "Other",
};

interface GenerationEntry {
  fuel_type: string;
  psr_code: string;
  mw: number;
}

export async function getGenerationMix(
  params: z.infer<typeof generationSchema>
): Promise<{ zone: string; date: string; generation: GenerationEntry[]; total_mw: number }> {
  const eic = resolveZone(params.zone);
  const { periodStart, periodEnd } = dayRange(params.date);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await queryEntsoe(
    {
      documentType: "A75",
      processType: "A16",
      in_Domain: eic,
      periodStart,
      periodEnd,
    },
    TTL.REALTIME
  );

  const doc = data.GL_MarketDocument;
  if (!doc) throw new Error("No generation data returned for this zone/date.");

  const timeSeries = ensureArray(doc.TimeSeries);
  const generation: GenerationEntry[] = [];

  for (const ts of timeSeries) {
    const psrCode = ts.MktPSRType?.psrType ?? "unknown";
    const fuelType = PSR_TYPES[psrCode] ?? psrCode;

    const periods = ensureArray(ts.Period);
    // Take the latest period's points and average them
    const lastPeriod = periods[periods.length - 1];
    if (!lastPeriod) continue;

    const points = ensureArray(lastPeriod.Point);
    if (points.length === 0) continue;

    // Use the most recent point's quantity
    const latestPoint = points[points.length - 1];
    const mw = Number(latestPoint["quantity"] ?? 0);

    if (mw > 0) {
      generation.push({ fuel_type: fuelType, psr_code: psrCode, mw });
    }
  }

  generation.sort((a, b) => b.mw - a.mw);
  const total_mw = generation.reduce((sum, g) => sum + g.mw, 0);

  return {
    zone: params.zone.toUpperCase(),
    date: params.date ?? new Date().toISOString().slice(0, 10),
    generation,
    total_mw,
  };
}
