import { z } from "zod";
import { queryEntsoe, formatEntsoeDate } from "../lib/entsoe-client.js";
import { resolveZone, AVAILABLE_ZONES } from "../lib/zone-codes.js";
import { ensureArray } from "../lib/xml-parser.js";
import { TTL } from "../lib/cache.js";

export const hydroSchema = z.object({
  zone: z
    .string()
    .describe(
      `Country/zone code. Available: ${AVAILABLE_ZONES}. ` +
        "Best coverage: NO (Norway), SE (Sweden), AT (Austria), CH (Switzerland), ES (Spain), PT (Portugal)."
    ),
  start_date: z
    .string()
    .optional()
    .describe("Start date in YYYY-MM-DD format. Defaults to 4 weeks ago."),
  end_date: z
    .string()
    .optional()
    .describe("End date in YYYY-MM-DD format. Defaults to today."),
});

interface ReservoirPoint {
  week_start: string;
  stored_energy_mwh: number;
}

function parsePeriodStepDays(resolution: string | undefined): number {
  if (!resolution) return 7;

  const weekMatch = /^P(\d+)W$/i.exec(resolution);
  if (weekMatch) return Number(weekMatch[1]) * 7;

  const dayMatch = /^P(\d+)D$/i.exec(resolution);
  if (dayMatch) return Number(dayMatch[1]);

  return 7;
}

function addDays(isoStart: string, dayOffset: number): string {
  const date = new Date(isoStart);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

export async function getHydroReservoir(
  params: z.infer<typeof hydroSchema>
): Promise<{
  zone: string;
  start_date: string;
  end_date: string;
  reservoir: ReservoirPoint[];
  latest_stored_mwh: number;
}> {
  const eic = resolveZone(params.zone);

  const endDate = params.end_date
    ? new Date(params.end_date + "T00:00:00Z")
    : new Date();
  const startDate = params.start_date
    ? new Date(params.start_date + "T00:00:00Z")
    : new Date(endDate.getTime() - 28 * 24 * 60 * 60 * 1000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await queryEntsoe(
    {
      documentType: "A72",
      processType: "A16",
      in_Domain: eic,
      periodStart: formatEntsoeDate(startDate),
      periodEnd: formatEntsoeDate(endDate),
    },
    TTL.STORAGE
  );

  const doc = data.GL_MarketDocument;
  if (!doc) throw new Error("No hydro reservoir data returned for this zone/date range.");

  const timeSeries = ensureArray(doc.TimeSeries);
  const reservoir: ReservoirPoint[] = [];

  for (const ts of timeSeries) {
    const periods = ensureArray(ts.Period);
    for (const period of periods) {
      const start = period.timeInterval?.start ?? "";
      const startIso = typeof start === "string" ? start : "";
      const stepDays = parsePeriodStepDays(period.resolution);

      const points = ensureArray(period.Point);
      for (const point of points) {
        const storedMwh = Number(point.quantity ?? 0);
        const position = Math.max(1, Number(point.position ?? 1));
        reservoir.push({
          week_start: addDays(startIso, (position - 1) * stepDays),
          stored_energy_mwh: storedMwh,
        });
      }
    }
  }

  reservoir.sort((a, b) => a.week_start.localeCompare(b.week_start));

  const latestStored = reservoir.length > 0
    ? reservoir[reservoir.length - 1].stored_energy_mwh
    : 0;

  return {
    zone: params.zone.toUpperCase(),
    start_date: params.start_date ?? startDate.toISOString().slice(0, 10),
    end_date: params.end_date ?? endDate.toISOString().slice(0, 10),
    reservoir,
    latest_stored_mwh: latestStored,
  };
}
