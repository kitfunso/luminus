import { z } from "zod";
import { queryEntsoe, formatEntsoeDate } from "../lib/entsoe-client.js";
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
  B09: "Geothermal",
  B10: "Hydro Pumped Storage",
  B11: "Hydro Run-of-river",
  B12: "Hydro Reservoir",
  B14: "Nuclear",
  B16: "Solar",
  B18: "Wind Offshore",
  B19: "Wind Onshore",
};

export const remitMessagesSchema = z.object({
  zone: z
    .string()
    .describe(
      `Bidding zone code. Examples: DE, FR, GB. Available: ${AVAILABLE_ZONES}`
    ),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
});

interface RemitMessage {
  id: string;
  plant: string;
  fuel: string | null;
  type: "planned" | "unplanned" | string;
  availableMW: number | null;
  unavailableMW: number | null;
  start: string;
  end: string;
  reason: string | null;
}

export async function getRemitMessages(
  params: z.infer<typeof remitMessagesSchema>
): Promise<{
  zone: string;
  date: string;
  messageCount: number;
  messages: RemitMessage[];
}> {
  const eic = resolveZone(params.zone);
  const date = params.date ?? new Date().toISOString().slice(0, 10);

  const base = new Date(date + "T00:00:00Z");
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  let data: Record<string, unknown>;
  try {
    data = await queryEntsoe(
      {
        documentType: "A80",
        processType: "A26",
        biddingZone_Domain: eic,
        periodStart: formatEntsoeDate(start),
        periodEnd: formatEntsoeDate(end),
      },
      TTL.OUTAGES
    );
  } catch {
    // API error or no data = empty result, not a thrown error
    return { zone: params.zone.toUpperCase(), date, messageCount: 0, messages: [] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = (data as any).UnavailabilityMarketDocument ??
    (data as any).Unavailability_MarketDocument;
  if (!doc) {
    return { zone: params.zone.toUpperCase(), date, messageCount: 0, messages: [] };
  }

  const timeSeries = ensureArray(doc.TimeSeries);
  const messages: RemitMessage[] = [];

  for (const ts of timeSeries) {
    const resource = ts.production_RegisteredResource ?? ts.Asset_RegisteredResource ?? {};
    const plant = resource.name ?? resource.mRID ?? "Unknown";
    const psrCode = resource.pSRType?.psrType ?? null;
    const fuel = psrCode ? (PSR_TYPES[psrCode] ?? psrCode) : null;
    const nominalMw = resource.pSRType?.powerSystemResources?.nominalP
      ? Number(resource.pSRType.powerSystemResources.nominalP)
      : null;

    const businessType = ts.businessType ?? "";
    const outageType = businessType === "A53" ? "planned"
      : businessType === "A54" ? "unplanned"
      : businessType;

    const startDate = ts.start_DateAndOrTime?.date ?? ts.start_DateAndOrTime ?? "";
    const endDate = ts.end_DateAndOrTime?.date ?? ts.end_DateAndOrTime ?? "";
    const reason = ts.Reason?.text ?? null;
    const id = ts.mRID ?? "";

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
      ? Math.round(nominalMw - availableMw)
      : null;

    messages.push({
      id,
      plant,
      fuel,
      type: outageType,
      availableMW: availableMw != null ? Math.round(availableMw) : null,
      unavailableMW: unavailableMw,
      start: startDate,
      end: endDate,
      reason,
    });
  }

  // Sort by unavailableMW descending, nulls last
  messages.sort((a, b) => (b.unavailableMW ?? 0) - (a.unavailableMW ?? 0));

  // Limit to first 20
  const limited = messages.slice(0, 20);

  return {
    zone: params.zone.toUpperCase(),
    date,
    messageCount: limited.length,
    messages: limited,
  };
}
