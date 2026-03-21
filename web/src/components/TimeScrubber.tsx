'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PriceHistory } from '@/lib/data-fetcher';

interface TimeScrubberProps {
  history: PriceHistory;
  onHourChange: (priceSnapshot: Record<string, number> | null) => void;
  onClose: () => void;
}

function formatHour(startUtc: string, hourIndex: number): string {
  const d = new Date(startUtc);
  d.setUTCHours(d.getUTCHours() + hourIndex);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(d);
}

export default function TimeScrubber({ history, onHourChange, onClose }: TimeScrubberProps) {
  const maxHours = useMemo(() => {
    if (history.countries.length === 0) return 0;
    return Math.max(...history.countries.map((c) => c.hourly.length));
  }, [history]);

  const [hour, setHour] = useState(maxHours - 1);
  const [playing, setPlaying] = useState(false);
  const playRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Compute price snapshot for current hour
  const snapshot = useMemo(() => {
    const snap: Record<string, number> = {};
    for (const c of history.countries) {
      if (hour < c.hourly.length) {
        snap[c.iso2] = c.hourly[hour];
      }
    }
    return snap;
  }, [history, hour]);

  // Notify parent of price changes
  useEffect(() => {
    onHourChange(snapshot);
  }, [snapshot, onHourChange]);

  // Reset to live on close
  useEffect(() => {
    return () => onHourChange(null);
  }, [onHourChange]);

  // Play/pause
  useEffect(() => {
    playRef.current = playing;
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
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, maxHours]);

  const handleSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setHour(Number(e.target.value));
    setPlaying(false);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (hour >= maxHours - 1) {
      setHour(0);
      setPlaying(true);
    } else {
      setPlaying((prev) => !prev);
    }
  }, [hour, maxHours]);

  // Sparkline for aggregate EU price
  const avgPrices = useMemo(() => {
    const result: number[] = [];
    for (let h = 0; h < maxHours; h++) {
      let sum = 0;
      let count = 0;
      for (const c of history.countries) {
        if (h < c.hourly.length) {
          sum += c.hourly[h];
          count++;
        }
      }
      result.push(count > 0 ? sum / count : 0);
    }
    return result;
  }, [history, maxHours]);

  const sparkW = 600;
  const sparkH = 40;
  const sparkPad = 2;
  const sparkMin = Math.min(...avgPrices);
  const sparkMax = Math.max(...avgPrices);
  const sparkRange = sparkMax - sparkMin || 1;

  const sparkPoints = avgPrices
    .map((v, i) => {
      const x = sparkPad + (i / (maxHours - 1 || 1)) * (sparkW - sparkPad * 2);
      const y = sparkH - sparkPad - ((v - sparkMin) / sparkRange) * (sparkH - sparkPad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const cursorX = sparkPad + (hour / (maxHours - 1 || 1)) * (sparkW - sparkPad * 2);

  if (maxHours === 0) return null;

  return (
    <div className="time-scrubber">
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={handlePlayPause}
          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
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

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-medium text-white">
              {formatHour(history.startUtc, hour)}
            </span>
            <span className="text-[10px] text-slate-500">UTC</span>
            <span className="text-xs text-slate-400 tabular-nums ml-auto">
              Avg: {snapshot ? (Object.values(snapshot).reduce((a, b) => a + b, 0) / Object.values(snapshot).length).toFixed(0) : '---'} EUR/MWh
            </span>
          </div>

          <div className="relative">
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
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
            <span>{formatHour(history.startUtc, 0)}</span>
            <span>{formatHour(history.startUtc, maxHours - 1)}</span>
          </div>
        </div>

        <button
          onClick={() => {
            setPlaying(false);
            setHour(maxHours - 1);
            onClose();
          }}
          className="text-[10px] text-slate-500 hover:text-white transition-colors flex-shrink-0 px-2 py-1 rounded bg-white/5 hover:bg-white/10"
        >
          LIVE
        </button>
      </div>
    </div>
  );
}
