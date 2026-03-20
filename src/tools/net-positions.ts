import { z } from "zod";
import { queryEntsoe, dayRange } from "../lib/entsoe-client.js";
import { resolveZone, AVAILABLE_ZONES, ZONE_NEIGHBOURS } from "../lib/zone-codes.js";
import { ensureArray } from "../lib/xml-parser.js";
import { TTL } from "../lib/cache.js";

export const netPositionsSchema = z.object({
  zone: z
    .string()
    .describe(
      `Country/zone code. Available: ${AVAILABLE_ZONES}. ` +
        "Net position = total imports minus total exports across all borders."
    ),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
});

interface BorderFlow {
  neighbour: string;
  import_mw: number;
  export_mw: number;
  net_mw: number;
}

async function queryFlow(
  fromEic: string,
  toEic: string,
  periodStart: string,
  periodEnd: string
): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await queryEntsoe(
      { documentType: "A11", in_Domain: toEic, out_Domain: fromEic, periodStart, periodEnd },
      TTL.OUTAGES
    );

    const doc = data.GL_MarketDocument;
    if (!doc) return 0;

    const timeSeries = ensureArray(doc.TimeSeries);
    let total = 0;
    let count = 0;

    for (const ts of timeSeries) {
      const periods = ensureArray(ts.Period);
      for (const period of periods) {
        const points = ensureArray(period.Point);
        for (const point of points) {
          total += Number(point.quantity ?? 0);
          count++;
        }
      }
    }

    return count > 0 ? Math.round(total / count) : 0;
  } catch {
    return 0;
  }
}

export async function getNetPositions(
  params: z.infer<typeof netPositionsSchema>
): Promise<{
  zone: string;
  date: string;
  net_position_mw: number;
  status: string;
  borders: BorderFlow[];
}> {
  const zoneUpper = params.zone.toUpperCase();
  const neighbours = ZONE_NEIGHBOURS[zoneUpper];
  if (!neighbours) {
    throw new Error(
      `No neighbour mapping for "${zoneUpper}". Available: ${Object.keys(ZONE_NEIGHBOURS).join(", ")}`
    );
  }

  const zoneEic = resolveZone(zoneUpper);
  const { periodStart, periodEnd } = dayRange(params.date);

  // Query import and export flows for each neighbour in parallel
  const borderPromises = neighbours.map(async (neighbour): Promise<BorderFlow> => {
    const neighbourEic = resolveZone(neighbour);

    const [importMw, exportMw] = await Promise.all([
      queryFlow(neighbourEic, zoneEic, periodStart, periodEnd),
      queryFlow(zoneEic, neighbourEic, periodStart, periodEnd),
    ]);

    return {
      neighbour,
      import_mw: importMw,
      export_mw: exportMw,
      net_mw: importMw - exportMw,
    };
  });

  const borders = await Promise.all(borderPromises);
  const netPosition = borders.reduce((sum, b) => sum + b.net_mw, 0);
  const status = netPosition > 0 ? "net importer" : netPosition < 0 ? "net exporter" : "balanced";

  return {
    zone: zoneUpper,
    date: params.date ?? new Date().toISOString().slice(0, 10),
    net_position_mw: netPosition,
    status,
    borders: borders.filter((b) => b.import_mw !== 0 || b.export_mw !== 0),
  };
}
