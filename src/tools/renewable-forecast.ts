import { z } from "zod";
import { queryEntsoe, dayRange } from "../lib/entsoe-client.js";
import { resolveZone, AVAILABLE_ZONES } from "../lib/zone-codes.js";
import { ensureArray } from "../lib/xml-parser.js";
import { TTL } from "../lib/cache.js";

/** PSR type codes for renewable sources */
const RENEWABLE_PSR: Record<string, string> = {
  B16: "Solar",
  B18: "Wind Offshore",
  B19: "Wind Onshore",
};

export const renewableForecastSchema = z.object({
  zone: z
    .string()
    .describe(
      `Country/zone code. Examples: DE, FR, ES. Available: ${AVAILABLE_ZONES}`
    ),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
});

interface ForecastPoint {
  hour: number;
  mw: number;
}

interface RenewableForecastEntry {
  source: string;
  psr_code: string;
  forecast: ForecastPoint[];
  peak_mw: number;
  total_mwh: number;
}

export async function getRenewableForecast(
  params: z.infer<typeof renewableForecastSchema>
): Promise<{
  zone: string;
  date: string;
  forecasts: RenewableForecastEntry[];
  total_peak_mw: number;
}> {
  const eic = resolveZone(params.zone);
  const { periodStart, periodEnd } = dayRange(params.date);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await queryEntsoe(
    {
      documentType: "A69",
      processType: "A01",
      in_Domain: eic,
      periodStart,
      periodEnd,
    },
    TTL.FORECAST
  );

  const doc = data.GL_MarketDocument;
  if (!doc) throw new Error("No renewable forecast data returned for this zone/date.");

  const timeSeries = ensureArray(doc.TimeSeries);
  const forecastMap = new Map<string, ForecastPoint[]>();

  for (const ts of timeSeries) {
    const psrCode = ts.MktPSRType?.psrType ?? "unknown";
    const source = RENEWABLE_PSR[psrCode] ?? psrCode;

    const periods = ensureArray(ts.Period);
    for (const period of periods) {
      const points = ensureArray(period.Point);
      for (const point of points) {
        const position = Number(point.position);
        const mw = Number(point.quantity ?? 0);
        if (!forecastMap.has(source)) forecastMap.set(source, []);
        forecastMap.get(source)!.push({ hour: position - 1, mw });
      }
    }
  }

  const forecasts: RenewableForecastEntry[] = [];
  for (const [source, points] of forecastMap) {
    points.sort((a, b) => a.hour - b.hour);
    const values = points.map((p) => p.mw);
    const peak_mw = values.length > 0 ? Math.max(...values) : 0;
    const total_mwh = values.reduce((s, v) => s + v, 0);
    const psrEntry = Object.entries(RENEWABLE_PSR).find(([, v]) => v === source);
    forecasts.push({
      source,
      psr_code: psrEntry ? psrEntry[0] : "unknown",
      forecast: points,
      peak_mw,
      total_mwh,
    });
  }

  forecasts.sort((a, b) => b.peak_mw - a.peak_mw);
  const total_peak_mw = forecasts.reduce((s, f) => s + f.peak_mw, 0);

  return {
    zone: params.zone.toUpperCase(),
    date: params.date ?? new Date().toISOString().slice(0, 10),
    forecasts,
    total_peak_mw,
  };
}
