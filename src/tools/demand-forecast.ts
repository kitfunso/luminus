import { z } from "zod";
import { queryEntsoe, dayRange } from "../lib/entsoe-client.js";
import { resolveZone, AVAILABLE_ZONES } from "../lib/zone-codes.js";
import { ensureArray } from "../lib/xml-parser.js";
import { TTL } from "../lib/cache.js";

export const demandForecastSchema = z.object({
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

interface DemandPoint {
  hour: number;
  mw: number;
}

export async function getDemandForecast(
  params: z.infer<typeof demandForecastSchema>
): Promise<{
  zone: string;
  date: string;
  forecast: DemandPoint[];
  stats: { min: number; max: number; mean: number; total_mwh: number };
}> {
  const eic = resolveZone(params.zone);
  const { periodStart, periodEnd } = dayRange(params.date);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await queryEntsoe(
    {
      documentType: "A65",
      processType: "A01",
      outBiddingZone_Domain: eic,
      periodStart,
      periodEnd,
    },
    TTL.FORECAST
  );

  const doc = data.GL_MarketDocument;
  if (!doc) throw new Error("No demand forecast data returned for this zone/date.");

  const timeSeries = ensureArray(doc.TimeSeries);
  const forecast: DemandPoint[] = [];

  for (const ts of timeSeries) {
    const periods = ensureArray(ts.Period);
    for (const period of periods) {
      const points = ensureArray(period.Point);
      for (const point of points) {
        const position = Number(point.position);
        const mw = Number(point.quantity ?? 0);
        forecast.push({ hour: position - 1, mw });
      }
    }
  }

  forecast.sort((a, b) => a.hour - b.hour);

  const values = forecast.map((f) => f.mw);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const mean =
    values.length > 0
      ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100
      : 0;
  const total_mwh = values.reduce((s, v) => s + v, 0);

  return {
    zone: params.zone.toUpperCase(),
    date: params.date ?? new Date().toISOString().slice(0, 10),
    forecast,
    stats: { min, max, mean, total_mwh },
  };
}
