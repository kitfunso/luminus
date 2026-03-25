'use client';

import React from 'react';
import { useMemo, useState } from 'react';

export interface InteractiveSeries {
  id: string;
  label: string;
  values: number[];
  color: string;
  dashed?: boolean;
  formatValue?: (value: number) => string;
}

interface InteractiveTimeSeriesChartProps {
  title?: string;
  subtitle?: string;
  unitLabel?: string;
  timestampsUtc?: string[];
  series: InteractiveSeries[];
  height?: number;
  ceiling?: number;
  onExpand?: () => void;
  className?: string;
}

function formatTimestamp(timestamp: string | undefined) {
  if (!timestamp) {
    return 'Latest';
  }
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(new Date(timestamp));
}

export default function InteractiveTimeSeriesChart({
  title,
  subtitle,
  unitLabel,
  timestampsUtc,
  series,
  height = 120,
  ceiling,
  onExpand,
  className = '',
}: InteractiveTimeSeriesChartProps) {
  const maxLength = Math.max(...series.map((line) => line.values.length), 0);
  const [hoveredIndex, setHoveredIndex] = useState(maxLength > 0 ? maxLength - 1 : 0);

  const allValues = useMemo(() => {
    const values = series.flatMap((line) => line.values);
    if (ceiling != null) {
      values.push(ceiling);
    }
    return values;
  }, [ceiling, series]);

  if (maxLength < 2 || allValues.length === 0) {
    return null;
  }

  const width = 600;
  const paddingX = 8;
  const paddingY = 10;
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const activeIndex = Math.max(0, Math.min(hoveredIndex, maxLength - 1));
  const currentTimestamp = timestampsUtc?.[activeIndex];
  const currentValues = series.map((line) => ({
    ...line,
    value: line.values[Math.min(activeIndex, line.values.length - 1)],
  }));

  const toX = (index: number) =>
    paddingX + (index / (maxLength - 1)) * (width - paddingX * 2);
  const toY = (value: number) =>
    height - paddingY - ((value - min) / range) * (height - paddingY * 2);

  return (
    <section className={`rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-4 ${className}`}>
      {(title || onExpand) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-sm font-medium text-white">{title}</h3>}
            {subtitle && <p className="mt-1 text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              className="rounded-full border border-white/[0.08] px-3 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:border-white/[0.14] hover:text-white"
            >
              Expand
            </button>
          )}
        </div>
      )}

      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium text-slate-200">{formatTimestamp(currentTimestamp)}</p>
          {unitLabel && <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">{unitLabel}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
          {currentValues.map((line) => (
            <div key={line.id} className="flex items-center gap-1.5 text-[11px]">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />
              <span className="text-slate-400">{line.label}</span>
              <span className="font-medium tabular-nums text-white">
                {Number.isFinite(line.value)
                  ? (line.formatValue ? line.formatValue(line.value) : line.value.toFixed(1))
                  : 'N/A'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div
        data-testid="timeseries-track"
        className="relative"
        onMouseLeave={() => setHoveredIndex(maxLength - 1)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const nativeOffsetX = 'offsetX' in event.nativeEvent ? Number(event.nativeEvent.offsetX) : NaN;
          const relativeX = Number.isFinite(nativeOffsetX) ? nativeOffsetX : event.clientX - rect.left;
          const width = rect.width > 0 ? rect.width : 1;
          const nextIndex = Math.round((relativeX / width) * (maxLength - 1));
          setHoveredIndex(Math.max(0, Math.min(nextIndex, maxLength - 1)));
        }}
      >
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="w-full"
        >
          {ceiling != null && (
            <line
              x1={paddingX}
              y1={toY(ceiling)}
              x2={width - paddingX}
              y2={toY(ceiling)}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          )}

          {series[0]?.values.length > 1 && (
            <polygon
              points={`${paddingX},${height - paddingY} ${series[0].values.map((value, index) => `${toX(index)},${toY(value)}`).join(' ')} ${width - paddingX},${height - paddingY}`}
              fill={`${series[0].color}18`}
            />
          )}

          {series.map((line) => (
            <polyline
              key={line.id}
              points={line.values.map((value, index) => `${toX(index)},${toY(value)}`).join(' ')}
              fill="none"
              stroke={line.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={line.dashed ? '5 4' : undefined}
            />
          ))}

          <line
            x1={toX(activeIndex)}
            y1={paddingY}
            x2={toX(activeIndex)}
            y2={height - paddingY}
            stroke="rgba(255,255,255,0.26)"
            strokeWidth="1"
          />

          {currentValues.map((line) => (
            <circle
              key={line.id}
              cx={toX(Math.min(activeIndex, line.values.length - 1))}
              cy={toY(line.value)}
              r="3"
              fill={line.color}
              stroke="rgba(10,14,23,0.9)"
              strokeWidth="1"
            />
          ))}
        </svg>
      </div>

      <div className="mt-2 flex justify-between text-[10px] text-slate-600">
        <span>{formatTimestamp(timestampsUtc?.[0])}</span>
        <span>{formatTimestamp(timestampsUtc?.[maxLength - 1])}</span>
      </div>
    </section>
  );
}
