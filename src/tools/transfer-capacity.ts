import { z } from "zod";
import { queryEntsoe, dayRange } from "../lib/entsoe-client.js";
import { resolveZone, AVAILABLE_ZONES } from "../lib/zone-codes.js";
import { ensureArray } from "../lib/xml-parser.js";
import { TTL } from "../lib/cache.js";

export const transferCapacitySchema = z.object({
  from_zone: z
    .string()
    .describe(`Exporting zone. Available: ${AVAILABLE_ZONES}`),
  to_zone: z
    .string()
    .describe(`Importing zone. Available: ${AVAILABLE_ZONES}`),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
});

interface CapacityPoint {
  hour: number;
  ntc_mw: number;
}

export async function getTransferCapacity(
  params: z.infer<typeof transferCapacitySchema>
): Promise<{
  from_zone: string;
  to_zone: string;
  date: string;
  capacities: CapacityPoint[];
  stats: { min: number; max: number; mean: number };
}> {
  const fromEic = resolveZone(params.from_zone);
  const toEic = resolveZone(params.to_zone);
  const { periodStart, periodEnd } = dayRange(params.date);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await queryEntsoe(
    {
      documentType: "A61",
      processType: "A01",
      in_Domain: toEic,
      out_Domain: fromEic,
      periodStart,
      periodEnd,
    },
    TTL.PRICES
  );

  const doc = data.Publication_MarketDocument;
  if (!doc) throw new Error("No transfer capacity data returned for this corridor/date.");

  const timeSeries = ensureArray(doc.TimeSeries);
  const capacities: CapacityPoint[] = [];

  for (const ts of timeSeries) {
    const periods = ensureArray(ts.Period);
    for (const period of periods) {
      const points = ensureArray(period.Point);
      for (const point of points) {
        const position = Number(point.position);
        const ntcMw = Number(point.quantity ?? 0);
        capacities.push({ hour: position - 1, ntc_mw: ntcMw });
      }
    }
  }

  capacities.sort((a, b) => a.hour - b.hour);

  const values = capacities.map((c) => c.ntc_mw);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const mean =
    values.length > 0
      ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100
      : 0;

  return {
    from_zone: params.from_zone.toUpperCase(),
    to_zone: params.to_zone.toUpperCase(),
    date: params.date ?? new Date().toISOString().slice(0, 10),
    capacities,
    stats: { min, max, mean },
  };
}
