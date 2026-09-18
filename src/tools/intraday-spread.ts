import { z } from "zod";
import { getDayAheadPrices, pricesSchema } from "./prices.js";
import { getIntradayPrices } from "./intraday-prices.js";
import { AVAILABLE_ZONES } from "../lib/zone-codes.js";

export const intradaySpreadSchema = z.object({
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

interface SpreadPoint {
  interval_start_utc: string;
  day_ahead: number;
  intraday: number;
  spread: number;
}

interface JoinablePoint {
  interval_start_utc: string;
  price: number;
}

type SpreadSignal = "intraday_premium" | "intraday_discount" | "neutral";

/** Average finer-grained points up to a coarser grid so DA/ID resolutions can be joined by start. */
function averageToGrid(points: JoinablePoint[], targetMinutes: number): JoinablePoint[] {
  const targetMs = targetMinutes * 60000;
  const buckets = new Map<number, number[]>();
  for (const p of points) {
    const startMs = Date.parse(p.interval_start_utc);
    const bucketStart = Math.floor(startMs / targetMs) * targetMs;
    const list = buckets.get(bucketStart) ?? [];
    list.push(p.price);
    buckets.set(bucketStart, list);
  }
  return [...buckets.entries()].map(([startMs, values]) => ({
    interval_start_utc: new Date(startMs).toISOString(),
    price: Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100,
  }));
}

export async function getIntradayDaSpread(
  params: z.infer<typeof intradaySpreadSchema>
): Promise<{
  zone: string;
  date: string;
  spreads: SpreadPoint[];
  unmatched_intervals: string[];
  stats: { mean_spread: number; max_spread: number; min_spread: number };
  signal: SpreadSignal;
}> {
  const date = params.date ?? new Date().toISOString().slice(0, 10);

  const [daResult, idResult] = await Promise.all([
    getDayAheadPrices(pricesSchema.parse({ zone: params.zone, start_date: date })),
    getIntradayPrices({ zone: params.zone, date }),
  ]);

  let daPoints: JoinablePoint[] = daResult.prices;
  let idPoints: JoinablePoint[] = idResult.prices;

  // Different resolutions can't join by start directly; average the finer series up.
  if (daResult.resolution_minutes && idResult.resolution_minutes && daResult.resolution_minutes !== idResult.resolution_minutes) {
    if (daResult.resolution_minutes < idResult.resolution_minutes) {
      daPoints = averageToGrid(daPoints, idResult.resolution_minutes);
    } else {
      idPoints = averageToGrid(idPoints, daResult.resolution_minutes);
    }
  }

  const daByStart = new Map(daPoints.map((p) => [p.interval_start_utc, p.price]));
  const idByStart = new Map(idPoints.map((p) => [p.interval_start_utc, p.price]));
  const allStarts = new Set([...daByStart.keys(), ...idByStart.keys()]);

  const spreads: SpreadPoint[] = [];
  const unmatchedIntervals: string[] = [];
  for (const start of allStarts) {
    const daPrice = daByStart.get(start);
    const idPrice = idByStart.get(start);
    if (daPrice == null || idPrice == null) {
      unmatchedIntervals.push(start);
      continue;
    }
    spreads.push({
      interval_start_utc: start,
      day_ahead: daPrice,
      intraday: idPrice,
      spread: Math.round((idPrice - daPrice) * 100) / 100,
    });
  }

  spreads.sort((a, b) => Date.parse(a.interval_start_utc) - Date.parse(b.interval_start_utc));
  unmatchedIntervals.sort();

  const spreadValues = spreads.map((s) => s.spread);
  const meanSpread =
    spreadValues.length > 0
      ? Math.round((spreadValues.reduce((s, v) => s + v, 0) / spreadValues.length) * 100) / 100
      : 0;
  const maxSpread = spreadValues.length > 0 ? Math.max(...spreadValues) : 0;
  const minSpread = spreadValues.length > 0 ? Math.min(...spreadValues) : 0;

  let signal: SpreadSignal = "neutral";
  if (meanSpread > 5) signal = "intraday_premium";
  else if (meanSpread < -5) signal = "intraday_discount";

  return {
    zone: params.zone.toUpperCase(),
    date,
    spreads,
    unmatched_intervals: unmatchedIntervals,
    stats: { mean_spread: meanSpread, max_spread: maxSpread, min_spread: minSpread },
    signal,
  };
}
