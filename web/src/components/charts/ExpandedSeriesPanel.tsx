'use client';

import React from 'react';
import { useMemo, useState } from 'react';

import InteractiveTimeSeriesChart, {
  type InteractiveSeries,
} from './InteractiveTimeSeriesChart';

export interface ExpandedSeriesConfig {
  title: string;
  unitLabel?: string;
  timestampsUtc?: string[];
  series: InteractiveSeries[];
  candidates?: InteractiveSeries[];
}

interface ExpandedSeriesPanelProps extends ExpandedSeriesConfig {
  onClose: () => void;
}

export default function ExpandedSeriesPanel({
  title,
  unitLabel,
  timestampsUtc,
  series,
  candidates = [],
  onClose,
}: ExpandedSeriesPanelProps) {
  const [activeIds, setActiveIds] = useState<string[]>([
    ...series.map((line) => line.id),
    ...candidates.slice(0, 2).map((line) => line.id),
  ]);

  const allSeries = useMemo(() => [...series, ...candidates], [candidates, series]);
  const visibleSeries = allSeries.filter((line) => activeIds.includes(line.id));

  return (
    <aside className="right-panel expanded-series-panel absolute right-4 top-4 z-[18] flex w-[min(38rem,calc(100vw-2rem))] flex-col rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(14,20,33,0.98),rgba(8,12,20,0.96))] p-4 shadow-2xl backdrop-blur-2xl">
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-white/[0.06] pb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
            Expanded Analysis
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/[0.08] px-3 py-1 text-[11px] text-slate-300 transition-colors hover:text-white"
        >
          Close
        </button>
      </div>

      <InteractiveTimeSeriesChart
        title="Tracked comparison"
        subtitle="Hover to inspect aligned values through time"
        unitLabel={unitLabel}
        timestampsUtc={timestampsUtc}
        series={visibleSeries}
        height={220}
      />

      {allSeries.length > 1 && (
        <div className="mt-4 rounded-[24px] border border-white/[0.06] bg-white/[0.025] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Series
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {allSeries.map((line) => {
              const active = activeIds.includes(line.id);
              return (
                <button
                  key={line.id}
                  type="button"
                  onClick={() => {
                    setActiveIds((current) =>
                      current.includes(line.id)
                        ? current.filter((id) => id !== line.id)
                        : [...current, line.id],
                    );
                  }}
                  className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                    active
                      ? 'border-white/[0.16] bg-white/[0.08] text-white'
                      : 'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />
                  {line.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
