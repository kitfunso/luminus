import { z } from "zod";
import { queryEntsoe, dayRange } from "../lib/entsoe-client.js";
import { resolveZone, AVAILABLE_ZONES } from "../lib/zone-codes.js";
import { ensureArray } from "../lib/xml-parser.js";
import { TTL } from "../lib/cache.js";

export const flowsSchema = z.object({
  from_zone: z
    .string()
    .describe(
      `Exporting zone. Examples: FR, DE. Available: ${AVAILABLE_ZONES}`
    ),
  to_zone: z
    .string()
    .describe(
      `Importing zone. Examples: DE, GB. Available: ${AVAILABLE_ZONES}`
    ),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
});

interface FlowPoint {
  hour: number;
  mw: number;
}

export async function getCrossBorderFlows(
  params: z.infer<typeof flowsSchema>
): Promise<{
  from_zone: string;
  to_zone: string;
  date: string;
  flows: FlowPoint[];
  stats: { min: number; max: number; mean: number; net_mwh: number };
}> {
  const fromEic = resolveZone(params.from_zone);
  const toEic = resolveZone(params.to_zone);
  const { periodStart, periodEnd } = dayRange(params.date);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await queryEntsoe(
    {
      documentType: "A11",
      in_Domain: toEic,
      out_Domain: fromEic,
      periodStart,
      periodEnd,
    },
    TTL.FLOWS
  );

  const doc = data.GL_MarketDocument;
  if (!doc) throw new Error("No flow data returned for this corridor/date.");

  const timeSeries = ensureArray(doc.TimeSeries);
  const flows: FlowPoint[] = [];

  for (const ts of timeSeries) {
    const periods = ensureArray(ts.Period);
    for (const period of periods) {
      const points = ensureArray(period.Point);
      for (const point of points) {
        const position = Number(point.position);
        const mw = Number(point.quantity);
        flows.push({ hour: position - 1, mw });
      }
    }
  }

  flows.sort((a, b) => a.hour - b.hour);

  const values = flows.map((f) => f.mw);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean =
    values.length > 0
      ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100
      : 0;
  const net_mwh = values.reduce((s, v) => s + v, 0);

  return {
    from_zone: params.from_zone.toUpperCase(),
    to_zone: params.to_zone.toUpperCase(),
    date: params.date ?? new Date().toISOString().slice(0, 10),
    flows,
    stats: { min, max, mean, net_mwh },
  };
}
