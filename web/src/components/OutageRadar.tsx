'use client';

import React, { useMemo, useState } from 'react';
import { COUNTRY_CENTROIDS } from '@/lib/countries';
import type { CountryOutage, OutageEntry, PowerPlant } from '@/lib/data-fetcher';

interface OutageRadarProps {
  outages: CountryOutage[];
  plants: PowerPlant[];
  onClose: () => void;
  embedded?: boolean;
  onSelectCountry?: (iso2: string) => void;
  onSelectPlant?: (entry: OutageEntry) => void;
}

function getInstalledCapacity(plants: PowerPlant[]): Record<string, number> {
  const capacity: Record<string, number> = {};
  for (const plant of plants) {
    capacity[plant.country] = (capacity[plant.country] || 0) + plant.capacity;
  }
  return capacity;
}

function severityColor(pct: number): string {
  if (pct > 15) return 'rgb(248, 113, 113)';
  if (pct > 5) return 'rgb(250, 204, 21)';
  return 'rgb(74, 222, 128)';
}

function severityLabel(pct: number): string {
  if (pct > 15) return 'High';
  if (pct > 5) return 'Moderate';
  return 'Low';
}

function countryFlag(iso2: string): string {
  return iso2
    .toUpperCase()
    .split('')
    .map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65))
    .join('');
}

function formatUtcShort(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(new Date(iso));
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="absolute right-4 top-4 text-lg text-slate-500 transition-colors hover:text-white"
      aria-label="Close outage radar"
    >
      &times;
    </button>
  );
}

export default function OutageRadar({
  outages,
  plants,
  onClose,
  embedded = false,
  onSelectCountry,
  onSelectPlant,
}: OutageRadarProps) {
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);
  const installedCap = useMemo(() => getInstalledCapacity(plants), [plants]);
  const sorted = useMemo(
    () => [...outages].sort((a, b) => b.unavailableMW - a.unavailableMW),
    [outages],
  );
  const totalUnavailable = useMemo(
    () => sorted.reduce((sum, outage) => sum + outage.unavailableMW, 0),
    [sorted],
  );

  const containerClass = embedded ? 'flex h-full flex-col' : 'outage-panel';

  if (sorted.length === 0) {
    return (
      <div className={embedded ? 'space-y-2' : containerClass}>
        {!embedded && <CloseButton onClose={onClose} />}
        <h2 className="text-lg font-bold text-white">Outage Radar</h2>
        <p className="text-sm text-slate-400">
          No active generation outages in the current ENTSO-E window.
        </p>
      </div>
    );
  }

  return (
    <div className={containerClass}>
      {!embedded && <CloseButton onClose={onClose} />}

      <h2 className="text-lg font-bold text-white">Outage Radar</h2>
      <p className="mb-4 text-xs text-slate-500">
        Generation unavailability across Europe
      </p>

      <div className="mb-4 flex items-baseline gap-2 border-b border-white/[0.06] pb-3">
        <span className="text-2xl font-bold text-red-400">
          {(totalUnavailable / 1000).toFixed(1)}
        </span>
        <span className="text-sm text-slate-400">GW unavailable</span>
      </div>

      <div className={`space-y-1 overflow-y-auto sidebar-scroll ${embedded ? 'flex-1 pr-1' : 'max-h-[60vh]'}`}>
        {sorted.map((outage) => {
          const capMW = installedCap[outage.iso2] || 0;
          const pct = capMW > 0 ? (outage.unavailableMW / capMW) * 100 : 0;
          const color = severityColor(pct);
          const isExpanded = expandedCountry === outage.iso2;
          const countryName = COUNTRY_CENTROIDS[outage.iso2]?.name || outage.country;

          return (
            <div key={outage.iso2}>
              <button
                type="button"
                onClick={() => setExpandedCountry(isExpanded ? null : outage.iso2)}
                className="w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.03]"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm">{countryFlag(outage.iso2)}</span>
                  <span className="flex-1 text-sm font-medium text-slate-200">
                    {countryName}
                  </span>
                  {onSelectCountry && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectCountry(outage.iso2);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          onSelectCountry(outage.iso2);
                        }
                      }}
                      className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-slate-400 transition-colors hover:text-white"
                    >
                      Open
                    </span>
                  )}
                  <span className="text-xs font-medium tabular-nums" style={{ color }}>
                    {outage.unavailableMW.toLocaleString()} MW
                  </span>
                  <span className="ml-1 text-[10px] text-slate-600">
                    {isExpanded ? '\u25B4' : '\u25BE'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800/80">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span className="w-12 text-right text-[10px] tabular-nums text-slate-500">
                    {pct.toFixed(1)}%
                  </span>
                </div>

                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-[10px] text-slate-600">
                    {outage.outageCount} outage{outage.outageCount !== 1 ? 's' : ''}
                  </span>
                  <span className="text-[10px] font-medium" style={{ color }}>
                    {severityLabel(pct)}
                  </span>
                </div>
              </button>

              {isExpanded && outage.topOutages.length > 0 && (
                <div className="mb-2 ml-7 mr-2 space-y-1">
                  {outage.topOutages.map((entry, index) => (
                    <button
                      key={`${outage.iso2}-${index}`}
                      type="button"
                      onClick={() => onSelectPlant?.(entry)}
                      className="w-full space-y-0.5 rounded bg-white/[0.02] px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              entry.type === 'unplanned'
                                ? 'rgb(248, 113, 113)'
                                : 'rgb(250, 204, 21)',
                          }}
                        />
                        <span className="flex-1 truncate text-[11px] text-slate-300">
                          {entry.name}
                        </span>
                        <span className="text-[11px] tabular-nums text-slate-400">
                          {entry.unavailableMW.toLocaleString()} MW
                        </span>
                      </div>
                      <div className="ml-3.5 flex items-center gap-2">
                        <span className="text-[9px] uppercase text-slate-600">
                          {entry.type === 'unplanned' ? 'UNP' : 'PLN'}
                        </span>
                        {entry.fuel && (
                          <span className="text-[9px] text-slate-600">{entry.fuel}</span>
                        )}
                        {entry.expectedReturn && (
                          <span className="text-[9px] text-slate-600">
                            ETA {formatUtcShort(entry.expectedReturn)}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
