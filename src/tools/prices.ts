import { z } from "zod";
import { queryEntsoe, dayRange, formatEntsoeDate } from "../lib/entsoe-client.js";
import { resolvePriceZone, AVAILABLE_ZONES } from "../lib/zone-codes.js";
import { extractSeriesIntervals, entsoeStampToMs, type SeriesInterval } from "../lib/entsoe-timeseries.js";
import { ensureArray } from "../lib/xml-parser.js";
import { TTL } from "../lib/cache.js";

export const pricesSchema = z.object({
  zone: z
    .string()
    .describe(
      `Bidding zone code. Examples: DE, FR, GB. Available: ${AVAILABLE_ZONES}`
    ),
  start_date: z
    .string()
    .optional()
    .describe("Start date YYYY-MM-DD. Defaults to today."),
  end_date: z
    .string()
    .optional()
    .describe("End date YYYY-MM-DD. Defaults to start_date + 1 day."),
});

interface PricePoint {
  interval_start_utc: string;
  interval_end_utc: string;
  price: number;
}

interface Coverage {
  expected_intervals: number;
  returned_intervals: number;
  missing_interval_starts: string[];
  duplicates_dropped: number;
}

export async function getDayAheadPrices(
  params: z.infer<typeof pricesSchema>
): Promise<{
  zone: string;
  start_date: string;
  end_date: string;
  currency: string;
  unit: string;
  resolution_minutes: number;
  prices: PricePoint[];
  stats: { min: number; max: number; mean: number };
  coverage: Coverage;
  conflicts: number;
  notes?: string[];
}> {
  const eic = resolvePriceZone(params.zone);

  let periodStart: string;
  let periodEnd: string;

  if (params.start_date) {
    const startDt = new Date(params.start_date + "T00:00:00Z");
    periodStart = formatEntsoeDate(startDt);

    if (params.end_date) {
      const endDt = new Date(params.end_date + "T00:00:00Z");
      periodEnd = formatEntsoeDate(endDt);
    } else {
      periodEnd = formatEntsoeDate(
        new Date(startDt.getTime() + 24 * 60 * 60 * 1000)
      );
    }
  } else {
    const range = dayRange();
    periodStart = range.periodStart;
    periodEnd = range.periodEnd;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await queryEntsoe(
    {
      documentType: "A44",
      in_Domain: eic,
      out_Domain: eic,
      periodStart,
      periodEnd,
    },
    TTL.PRICES
  );

  const doc = data.Publication_MarketDocument;
  if (!doc) throw new Error("No price data returned for this zone/date range.");

  const built = buildIntervalPrices(doc, periodStart, periodEnd);

  const values = built.prices.map((p) => p.price);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const mean =
    values.length > 0
      ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100
      : 0;

  return {
    zone: params.zone.toUpperCase(),
    start_date: params.start_date ?? new Date().toISOString().slice(0, 10),
    end_date: params.end_date ?? params.start_date ?? new Date().toISOString().slice(0, 10),
    currency: built.currency,
    unit: built.unit,
    resolution_minutes: built.resolutionMinutes,
    prices: built.prices,
    stats: { min, max, mean },
    coverage: built.coverage,
    conflicts: built.conflicts,
    notes: built.notes.length > 0 ? built.notes : undefined,
  };
}

// Best-effort label for a conflict note; no live A44 fixture to verify field placement against.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeSeries(ts: any): string {
  const position = ts["classificationSequence_AttributeInstanceComponent.position"];
  const parts: string[] = [];
  if (position != null) parts.push(`position=${position}`);
  if (ts.businessType != null) parts.push(`businessType=${ts.businessType}`);
  const auctionCategory = ts.auction?.category ?? ts["auction.category"];
  if (auctionCategory != null) parts.push(`auction.category=${auctionCategory}`);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

/** Timestamped, deduplicated price points + currency/unit/coverage metadata; shared by prices.ts and intraday-prices.ts. */
export function buildIntervalPrices(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  periodStart: string,
  periodEnd: string
): {
  prices: PricePoint[];
  currency: string;
  unit: string;
  resolutionMinutes: number;
  coverage: Coverage;
  conflicts: number;
  notes: string[];
} {
  const timeSeriesList = ensureArray<Record<string, unknown>>(doc.TimeSeries);
  const notes: string[] = [];

  // Currency: series must agree; there is no honest default when they disagree.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currencies = new Set(timeSeriesList.map((ts: any) => ts["currency_Unit.name"]).filter((c) => c != null));
  if (currencies.size > 1) {
    throw new Error(`ENTSO-E series disagree on currency: ${[...currencies].join(", ")}`);
  }
  const currency = currencies.size === 1 ? ([...currencies][0] as string) : "EUR";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const measureUnits = new Set(timeSeriesList.map((ts: any) => ts["price_Measure_Unit.name"]).filter((u) => u != null));
  const measureUnit = measureUnits.size > 0 ? ([...measureUnits][0] as string) : "MWh";
  const unit = `${currency}/${measureUnit}`;

  const intervals = extractSeriesIntervals(doc, ["price.amount"]);
  if (intervals.length === 0) {
    notes.push("Document contained no price points; resolution unknown, so expected_intervals cannot be computed.");
    return {
      prices: [],
      currency,
      unit,
      resolutionMinutes: 0,
      coverage: { expected_intervals: 0, returned_intervals: 0, missing_interval_starts: [], duplicates_dropped: 0 },
      conflicts: 0,
      notes,
    };
  }

  // Overlap policy: a coarser point is dropped only where a finer series covers the same span;
  // outside the overlap (e.g. a range crossing a 60m->15m go-live) it is the only data there.
  const minutesOf = (iv: { start_ms: number; end_ms: number }) => Math.round((iv.end_ms - iv.start_ms) / 60000);
  const distinctMinutes = [...new Set(intervals.map(minutesOf))].sort((a, b) => a - b);
  const resolutionMinutes = distinctMinutes[0];
  const stepMs = resolutionMinutes * 60000;
  const covered = new Set<number>();
  const kept: SeriesInterval[] = [];
  let coarseDropped = 0;
  for (const m of distinctMinutes) {
    const group = intervals.filter((iv) => minutesOf(iv) === m);
    const keptHere: SeriesInterval[] = [];
    for (const iv of group) {
      let overlapped = false;
      for (let t = iv.start_ms; t < iv.end_ms && !overlapped; t += stepMs) overlapped = covered.has(t);
      if (overlapped) coarseDropped++;
      else keptHere.push(iv);
    }
    for (const iv of keptHere) {
      for (let t = iv.start_ms; t < iv.end_ms; t += stepMs) covered.add(t);
    }
    kept.push(...keptHere);
  }
  if (coarseDropped > 0) {
    notes.push(
      `Dropped ${coarseDropped} coarser-resolution point(s) overlapped by a finer series (finest ${resolutionMinutes}min).`
    );
  }

  // Same-start collisions: equal values dedup silently; differing values keep
  // the first series and are flagged so a distinct product is never silently lost.
  const byStart = new Map<number, typeof kept>();
  for (const iv of kept) {
    const list = byStart.get(iv.start_ms) ?? [];
    list.push(iv);
    byStart.set(iv.start_ms, list);
  }

  let duplicatesDropped = 0;
  let conflicts = 0;
  const prices: PricePoint[] = [];

  for (const group of byStart.values()) {
    const first = group[0];
    if (group.length > 1) {
      const distinctValues = new Set(group.map((iv) => iv.value));
      if (distinctValues.size === 1) {
        duplicatesDropped += group.length - 1;
      } else {
        conflicts += group.length - 1;
        for (const iv of group.slice(1)) {
          notes.push(
            `Conflicting value at ${new Date(first.start_ms).toISOString()}: kept series ${first.series_idx}, dropped series ${iv.series_idx}${describeSeries(timeSeriesList[iv.series_idx])}.`
          );
        }
      }
    }
    prices.push({
      interval_start_utc: new Date(first.start_ms).toISOString(),
      interval_end_utc: new Date(first.end_ms).toISOString(),
      price: first.value,
    });
  }

  prices.sort((a, b) => Date.parse(a.interval_start_utc) - Date.parse(b.interval_start_utc));

  const rangeStartMs = entsoeStampToMs(periodStart);
  const rangeEndMs = entsoeStampToMs(periodEnd);
  const expectedIntervals = Math.round((rangeEndMs - rangeStartMs) / stepMs);
  const missingIntervalStarts: string[] = [];
  for (let t = rangeStartMs; t < rangeEndMs; t += stepMs) {
    if (!covered.has(t)) missingIntervalStarts.push(new Date(t).toISOString());
  }

  return {
    prices,
    currency,
    unit,
    resolutionMinutes,
    coverage: {
      expected_intervals: expectedIntervals,
      returned_intervals: prices.length,
      missing_interval_starts: missingIntervalStarts,
      duplicates_dropped: duplicatesDropped,
    },
    conflicts,
    notes,
  };
}
