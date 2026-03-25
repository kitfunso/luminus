'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { PriceHistory } from '@/lib/data-fetcher';
import { MIXED_PRICE_UNIT_LABEL } from '@/lib/price-format';

interface TimeScrubberProps {
  history: PriceHistory;
  onHourChange: (priceSnapshot: Record<string, number> | null) => void;
  onClose: () => void;
}

const REPLAY_OFFSET_HOURS = 24;
const TRACKING_INTERVAL_MS = 60_000;

function formatHour(timestamp: string | undefined): string {
  if (!timestamp) {
    return 'No timestamp';
  }

  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(new Date(timestamp));
}

function buildFallbackTimestamps(startUtc: string, length: number) {
  const start = new Date(startUtc);
  return Array.from({ length }, (_, index) => {
    const point = new Date(start.getTime() + index * 60 * 60 * 1000);
    return point.toISOString();
  });
}

function findNearestHourIndex(timestampsUtc: string[], targetMs: number) {
  if (timestampsUtc.length === 0) {
    return 0;
  }

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  timestampsUtc.forEach((timestamp, index) => {
    const distance = Math.abs(Date.parse(timestamp) - targetMs);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

export default function TimeScrubber({ history, onHourChange, onClose }: TimeScrubberProps) {
  const maxHours = useMemo(() => {
    if (history.countries.length === 0) return 0;
    return Math.max(...history.countries.map((country) => country.hourly.length));
  }, [history]);

  const timelineTimestamps = useMemo(() => {
    const richestTimeline = history.countries.find(
      (country) => country.timestampsUtc && country.timestampsUtc.length === maxHours,
    );
    return richestTimeline?.timestampsUtc ?? buildFallbackTimestamps(history.startUtc, maxHours);
  }, [history.countries, history.startUtc, maxHours]);

  const trackedHour = useCallback(
    () => findNearestHourIndex(timelineTimestamps, Date.now() - REPLAY_OFFSET_HOURS * 60 * 60 * 1000),
    [timelineTimestamps],
  );

  const [hour, setHour] = useState(() => (maxHours > 0 ? trackedHour() : 0));
  const [playing, setPlaying] = useState(false);
  const [trackingAnchor, setTrackingAnchor] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (maxHours === 0) {
      setHour(0);
      return;
    }
    setTrackingAnchor(true);
    setPlaying(false);
    setHour(trackedHour());
  }, [maxHours, trackedHour]);

  const snapshot = useMemo(() => {
    const snap: Record<string, number> = {};
    for (const country of history.countries) {
      if (hour < country.hourly.length) {
        snap[country.iso2] = country.hourly[hour];
      }
    }
    return snap;
  }, [history, hour]);

  useEffect(() => {
    onHourChange(snapshot);
  }, [snapshot, onHourChange]);

  useEffect(() => {
    return () => onHourChange(null);
  }, [onHourChange]);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (playing) {
      timerRef.current = setInterval(() => {
        setHour((prev) => {
          if (prev >= maxHours - 1) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 500);
    } else if (trackingAnchor && maxHours > 0) {
      timerRef.current = setInterval(() => {
        setHour(trackedHour());
      }, TRACKING_INTERVAL_MS);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [maxHours, playing, trackedHour, trackingAnchor]);

  const handleSlider = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setHour(Number(event.target.value));
    setPlaying(false);
    setTrackingAnchor(false);
  }, []);

  const handlePlayPause = useCallback(() => {
    setTrackingAnchor(false);
    if (hour >= maxHours - 1) {
      setHour(0);
      setPlaying(true);
      return;
    }
    setPlaying((prev) => !prev);
  }, [hour, maxHours]);

  const handleTrackAnchor = useCallback(() => {
    setPlaying(false);
    setTrackingAnchor(true);
    setHour(trackedHour());
  }, [trackedHour]);

  const avgPrices = useMemo(() => {
    const result: number[] = [];
    for (let index = 0; index < maxHours; index += 1) {
      let sum = 0;
      let count = 0;
      for (const country of history.countries) {
        if (index < country.hourly.length) {
          sum += country.hourly[index];
          count += 1;
        }
      }
      result.push(count > 0 ? sum / count : 0);
    }
    return result;
  }, [history, maxHours]);

  if (maxHours === 0) return null;

  const sparkW = 600;
  const sparkH = 40;
  const sparkPad = 2;
  const sparkMin = Math.min(...avgPrices);
  const sparkMax = Math.max(...avgPrices);
  const sparkRange = sparkMax - sparkMin || 1;

  const sparkPoints = avgPrices
    .map((value, index) => {
      const x = sparkPad + (index / (maxHours - 1 || 1)) * (sparkW - sparkPad * 2);
      const y = sparkH - sparkPad - ((value - sparkMin) / sparkRange) * (sparkH - sparkPad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const cursorX = sparkPad + (hour / (maxHours - 1 || 1)) * (sparkW - sparkPad * 2);
  const snapshotValues = Object.values(snapshot);
  const avgSnapshot = snapshotValues.length > 0
    ? (snapshotValues.reduce((sum, value) => sum + value, 0) / snapshotValues.length).toFixed(0)
    : '---';

  return (
    <div className="time-scrubber">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
            Time Replay
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Anchored 24 hours behind live and refreshed every minute
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTrackAnchor}
            className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
              trackingAnchor
                ? 'border border-cyan-300/35 bg-cyan-300/12 text-white'
                : 'border border-white/[0.08] bg-white/[0.03] text-slate-300 hover:text-white'
            }`}
          >
            NOW -24H
          </button>
          <button
            onClick={() => {
              setPlaying(false);
              onClose();
            }}
            className="rounded-full border border-white/[0.08] px-3 py-1 text-[11px] text-slate-300 transition-colors hover:text-white"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handlePlayPause}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
        >
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="white">
              <rect x="1" y="1" width="3.5" height="10" rx="0.5" />
              <rect x="7.5" y="1" width="3.5" height="10" rx="0.5" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="white">
              <polygon points="2,0 12,6 2,12" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-sm font-medium text-white">
              {formatHour(timelineTimestamps[hour])}
            </span>
            <span className="text-[10px] text-slate-500">UTC</span>
            <span className="ml-auto text-right text-xs text-slate-400 tabular-nums">
              Avg: {avgSnapshot}
            </span>
          </div>
          <div className="text-[10px] text-slate-600">{MIXED_PRICE_UNIT_LABEL}</div>

          <div className="relative mt-2">
            <svg
              width="100%"
              height={sparkH}
              viewBox={`0 0 ${sparkW} ${sparkH}`}
              preserveAspectRatio="none"
              className="w-full"
            >
              <polyline
                points={sparkPoints}
                fill="none"
                stroke="rgba(56, 189, 248, 0.3)"
                strokeWidth="1.5"
              />
              <line
                x1={cursorX}
                y1={0}
                x2={cursorX}
                y2={sparkH}
                stroke="rgb(56, 189, 248)"
                strokeWidth="1"
              />
            </svg>
            <input
              type="range"
              min={0}
              max={maxHours - 1}
              value={hour}
              onChange={handleSlider}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>

          <div className="mt-0.5 flex justify-between text-[9px] text-slate-600">
            <span>{formatHour(timelineTimestamps[0])}</span>
            <span>{formatHour(timelineTimestamps[maxHours - 1])}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
