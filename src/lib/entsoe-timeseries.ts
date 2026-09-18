import { ensureArray } from "./xml-parser.js";

/** Shared ENTSO-E TimeSeries/Period/Point extraction, forward-filling A03 step curves. */

interface SeriesPoint {
  period: number;
  value: number;
}

export interface SeriesInterval {
  start_ms: number;
  end_ms: number;
  value: number;
  series_idx: number;
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

// YYYYMMDDHHmm (UTC) -> epoch ms, the format entsoe-client's formatEntsoeDate produces.
export function entsoeStampToMs(stamp: string): number {
  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:00Z`;
  return Date.parse(iso);
}

interface ParsedPeriod {
  explicit: Map<number, number>;
  slots: number;
  startMs: number; // NaN when the interval is unparseable
  minutes: number;
  seriesIdx: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsePeriods(doc: any, valueKeys: string[]): ParsedPeriod[] {
  const periods: ParsedPeriod[] = [];
  let seriesIdx = -1;

  for (const ts of ensureArray<Record<string, unknown>>(doc.TimeSeries)) {
    seriesIdx++;
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

      const minutes = resolutionToMinutes(p.resolution);
      const start = p.timeInterval?.start ? Date.parse(p.timeInterval.start) : NaN;
      const end = p.timeInterval?.end ? Date.parse(p.timeInterval.end) : NaN;
      let slots = maxPosition;
      if (minutes > 0 && Number.isFinite(start) && Number.isFinite(end) && end > start) {
        slots = Math.round((end - start) / 60000 / minutes);
      }

      periods.push({ explicit, slots, startMs: start, minutes, seriesIdx });
    }
  }

  return periods;
}

/** Extract points per TimeSeries/Period, skipping points missing all `valueKeys` (never coerced to 0). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractSeriesPoints(doc: any, valueKeys: string[]): SeriesPoint[] {
  const periods = parsePeriods(doc, valueKeys);

  // Anchor period numbering to timestamps so overlapping TimeSeries (same
  // interval, different category) share numbers instead of stacking offsets.
  const anchored = periods.filter((p) => Number.isFinite(p.startMs) && p.minutes > 0);
  const docStartMs = anchored.length > 0 ? Math.min(...anchored.map((p) => p.startMs)) : NaN;

  const out: SeriesPoint[] = [];
  let sequentialOffset = 0;
  let last: number | undefined;
  let lastSeriesIdx = -1;

  for (const p of periods) {
    const base =
      Number.isFinite(docStartMs) && Number.isFinite(p.startMs) && p.minutes > 0
        ? Math.round((p.startMs - docStartMs) / 60000 / p.minutes)
        : sequentialOffset;

    // Forward-fill A03 gaps within one series only; a different series is a different curve.
    if (p.seriesIdx !== lastSeriesIdx) {
      last = undefined;
      lastSeriesIdx = p.seriesIdx;
    }
    for (let pos = 1; pos <= p.slots; pos++) {
      const value = p.explicit.get(pos) ?? last;
      if (value == null) continue;
      out.push({ period: base + pos, value });
      last = value;
    }
    sequentialOffset = base + p.slots;
  }

  return out;
}

/** Timestamped sibling of extractSeriesPoints; throws on an unparseable timeInterval/resolution (no honest fallback for timestamps). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractSeriesIntervals(doc: any, valueKeys: string[]): SeriesInterval[] {
  const periods = parsePeriods(doc, valueKeys);
  const out: SeriesInterval[] = [];
  let last: number | undefined;
  let lastSeriesIdx = -1;

  for (const p of periods) {
    if (!Number.isFinite(p.startMs) || p.minutes <= 0) {
      throw new Error(
        `ENTSO-E period (series ${p.seriesIdx}) has no parseable timeInterval/resolution; cannot assign interval timestamps.`
      );
    }
    if (p.seriesIdx !== lastSeriesIdx) {
      last = undefined;
      lastSeriesIdx = p.seriesIdx;
    }
    const stepMs = p.minutes * 60000;
    for (let pos = 1; pos <= p.slots; pos++) {
      const value = p.explicit.get(pos) ?? last;
      if (value == null) continue;
      const start_ms = p.startMs + (pos - 1) * stepMs;
      out.push({ start_ms, end_ms: start_ms + stepMs, value, series_idx: p.seriesIdx });
      last = value;
    }
  }

  return out;
}
