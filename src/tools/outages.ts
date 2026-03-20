import { z } from "zod";
import { queryEntsoe, formatEntsoeDate, EntsoeParams } from "../lib/entsoe-client.js";
import { resolveZone, AVAILABLE_ZONES } from "../lib/zone-codes.js";
import { ensureArray } from "../lib/xml-parser.js";
import { TTL } from "../lib/cache.js";

/** PSR type codes to human-readable fuel names */
const PSR_TYPES: Record<string, string> = {
  B01: "Biomass",
  B02: "Lignite",
  B03: "Coal-derived gas",
  B04: "Gas",
  B05: "Hard coal",
  B06: "Oil",
  B07: "Oil shale",
  B08: "Peat",
  B09: "Geothermal",
  B10: "Hydro Pumped Storage",
  B11: "Hydro Run-of-river",
  B12: "Hydro Reservoir",
  B14: "Nuclear",
  B16: "Solar",
  B18: "Wind Offshore",
  B19: "Wind Onshore",
};

export const outagesSchema = z.object({
  zone: z
    .string()
    .describe(`Country/zone code. Available: ${AVAILABLE_ZONES}`),
  type: z
    .enum(["generation", "transmission"])
    .describe("Type of outage: 'generation' for power plant outages, 'transmission' for grid outages."),
  date: z
    .string()
    .optional()
    .describe("Start date in YYYY-MM-DD format. Returns outages active within 7 days from this date. Defaults to today."),
});

interface OutageEntry {
  unit_name: string;
  fuel_type: string | null;
  available_mw: number | null;
  unavailable_mw: number | null;
  nominal_mw: number | null;
  start_date: string;
  end_date: string;
  reason: string | null;
  outage_type: string;
}

export async function getOutages(
  params: z.infer<typeof outagesSchema>
): Promise<{
  zone: string;
  type: string;
  outages: OutageEntry[];
  total_unavailable_mw: number;
  count: number;
}> {
  const eic = resolveZone(params.zone);
  const documentType = params.type === "generation" ? "A80" : "A78";

  const base = params.date ? new Date(params.date + "T00:00:00Z") : new Date();
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

  const queryParams: EntsoeParams = {
    documentType,
    periodStart: formatEntsoeDate(start),
    periodEnd: formatEntsoeDate(end),
  };

  if (params.type === "generation") {
    queryParams.biddingZone_Domain = eic;
  } else {
    queryParams.in_Domain = eic;
    queryParams.out_Domain = eic;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await queryEntsoe(queryParams, TTL.OUTAGES);

  const doc = data.Unavailability_MarketDocument;
  if (!doc) throw new Error("No outage data returned for this zone/date.");

  const timeSeries = ensureArray(doc.TimeSeries);
  const outages: OutageEntry[] = [];

  for (const ts of timeSeries) {
    const resource = ts.production_RegisteredResource ?? ts.Asset_RegisteredResource ?? {};
    const unitName = resource.name ?? resource.mRID ?? "Unknown";
    const psrCode = resource.pSRType?.psrType ?? null;
    const fuelType = psrCode ? (PSR_TYPES[psrCode] ?? psrCode) : null;
    const nominalMw = resource.pSRType?.powerSystemResources?.nominalP
      ? Number(resource.pSRType.powerSystemResources.nominalP)
      : null;

    const businessType = ts.businessType ?? "";
    const outageType = businessType === "A53" ? "planned" : businessType === "A54" ? "forced" : businessType;

    const startDate = ts.start_DateAndOrTime?.date ?? ts.start_DateAndOrTime ?? "";
    const endDate = ts.end_DateAndOrTime?.date ?? ts.end_DateAndOrTime ?? "";
    const reason = ts.Reason?.text ?? null;

    const availPeriods = ensureArray(ts.Available_Period);
    let availableMw: number | null = null;
    for (const period of availPeriods) {
      const points = ensureArray(period.Point);
      if (points.length > 0) {
        availableMw = Number(points[0].quantity ?? 0);
        break;
      }
    }

    const unavailableMw = nominalMw != null && availableMw != null
      ? nominalMw - availableMw
      : null;

    outages.push({
      unit_name: unitName,
      fuel_type: fuelType,
      available_mw: availableMw,
      unavailable_mw: unavailableMw,
      nominal_mw: nominalMw,
      start_date: startDate,
      end_date: endDate,
      reason,
      outage_type: outageType,
    });
  }

  const totalUnavailable = outages.reduce(
    (sum, o) => sum + (o.unavailable_mw ?? 0),
    0
  );

  return {
    zone: params.zone.toUpperCase(),
    type: params.type,
    outages,
    total_unavailable_mw: totalUnavailable,
    count: outages.length,
  };
}
