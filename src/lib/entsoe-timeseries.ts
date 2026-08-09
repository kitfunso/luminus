import { ensureArray } from "./xml-parser.js";

/**
 * Shared ENTSO-E TimeSeries/Period/Point extraction with curveType A03 support.
 *
 * ENTSO-E step curves (curveType A03) omit a Point when its value repeats the
 * previous position, so reading only explicit points under-reports a day
 * (e.g. 41 rows instead of 96 quarter-hours). Per the ENTSO-E curve-type spec
 * the omitted positions carry the last seen value forward until the period end.
 * This helper expands every period to its full slot count from timeInterval /
 * resolution and forward-fills the gaps.
 *
 * Period numbering is anchored to the period's timeInterval relative to the
 * earliest interval in the document: two TimeSeries covering the SAME interval
 * (e.g. A85 price categories) share period numbers, while sequential periods
 * (multi-period days, ZIP-merged pages) number continuously (1..96 for a PT15M
 * day). Documents without parseable intervals fall back to sequential offsets.
 */

interface SeriesPoint {
  period: number;
  value: number;
}

/** Parse an ENTSO-E resolution (PT15M, PT30M, PT60M, P1D, P7D) to minutes. 0 = unknown. */
export function resolutionToMinutes(resolution: string | undefined): number {
  if (!resolution) return 0;
  const m = /^PT(\d+)M$/.exec(resolution);
  if (m) return Number(m[1]);
  const h = /^PT(\d+)H$/.exec(resolution);
  if (h) return Number(h[1]) * 60;
  const d = /^P(\d+)D$/.exec(resolution);
  if (d) return Number(d[1]) * 24 * 60;
  return 0;
}

/**
 * Extract points from every TimeSeries/Period of a parsed ENTSO-E document,
 * reading the value from the first key in `valueKeys` present on a Point.
 * Points without any of the keys are skipped (never coerced to 0).
 */
interface ParsedPeriod {
  explicit: Map<number, number>;
  slots: number;
  startMs: number; // NaN when the interval is unparseable
  minutes: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractSeriesPoints(doc: any, valueKeys: string[]): SeriesPoint[] {
  const periods: ParsedPeriod[] = [];

  for (const ts of ensureArray<Record<string, unknown>>(doc.TimeSeries)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const period of ensureArray<Record<string, unknown>>(ts.Period as any)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = period as any;
      const explicit = new Map<number, number>();
      let maxPosition = 0;

      for (const point of ensureArray<Record<string, unknown>>(p.Point)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pt = point as any;
        const position = Number(pt.position);
        if (!Number.isFinite(position)) continue;
        for (const key of valueKeys) {
          const raw = pt[key];
          if (raw != null) {
            explicit.set(position, Number(raw));
            break;
          }
        }
        if (position > maxPosition) maxPosition = position;
      }

      // Full slot count for the period from its time interval and resolution;
      // fall back to the highest explicit position when either is missing.
      const minutes = resolutionToMinutes(p.resolution);
      const start = p.timeInterval?.start ? Date.parse(p.timeInterval.start) : NaN;
      const end = p.timeInterval?.end ? Date.parse(p.timeInterval.end) : NaN;
      let slots = maxPosition;
      if (minutes > 0 && Number.isFinite(start) && Number.isFinite(end) && end > start) {
        slots = Math.round((end - start) / 60000 / minutes);
      }

      periods.push({ explicit, slots, startMs: start, minutes });
    }
  }

  // Anchor period numbering to timestamps so overlapping TimeSeries (same
  // interval, different category) share numbers instead of stacking offsets.
  const anchored = periods.filter((p) => Number.isFinite(p.startMs) && p.minutes > 0);
  const docStartMs = anchored.length > 0 ? Math.min(...anchored.map((p) => p.startMs)) : NaN;

  const out: SeriesPoint[] = [];
  let sequentialOffset = 0;

  for (const p of periods) {
    const base =
      Number.isFinite(docStartMs) && Number.isFinite(p.startMs) && p.minutes > 0
        ? Math.round((p.startMs - docStartMs) / 60000 / p.minutes)
        : sequentialOffset;

    // Forward-fill A03 gaps: an omitted position repeats the last seen value.
    let last: number | undefined;
    for (let pos = 1; pos <= p.slots; pos++) {
      const value = p.explicit.get(pos) ?? last;
      if (value == null) continue; // gap before the first explicit point
      out.push({ period: base + pos, value });
      last = value;
    }
    sequentialOffset = base + p.slots;
  }

  return out;
}
