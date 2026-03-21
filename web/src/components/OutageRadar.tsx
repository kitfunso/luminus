'use client';

import { useMemo, useState } from 'react';
import { COUNTRY_CENTROIDS } from '@/lib/countries';
import type { CountryOutage, PowerPlant } from '@/lib/data-fetcher';

interface OutageRadarProps {
  outages: CountryOutage[];
  plants: PowerPlant[];
  onClose: () => void;
}

// Rough installed capacity per country (GW) from plant data
function getInstalledCapacity(
  plants: PowerPlant[]
): Record<string, number> {
  const cap: Record<string, number> = {};
  for (const p of plants) {
    cap[p.country] = (cap[p.country] || 0) + p.capacity;
  }
  return cap;
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
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

function formatUtcShort(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date);
}

export default function OutageRadar({
  outages,
  plants,
  onClose,
}: OutageRadarProps) {
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);

  const installedCap = useMemo(() => getInstalledCapacity(plants), [plants]);

  const sorted = useMemo(
    () => [...outages].sort((a, b) => b.unavailableMW - a.unavailableMW),
    [outages]
  );

  const totalUnavailable = useMemo(
    () => sorted.reduce((s, o) => s + o.unavailableMW, 0),
    [sorted]
  );

  if (sorted.length === 0) {
    return (
      <div className="outage-panel">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors text-lg"
        >
          ✕
        </button>
        <h2 className="text-lg font-bold text-white mb-1">Outage Radar</h2>
        <p className="text-sm text-slate-400">No active generation outages in the current ENTSO-E window.</p>
      </div>
    );
  }

  return (
    <div className="outage-panel">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors text-lg"
      >
        ✕
      </button>

      <h2 className="text-lg font-bold text-white mb-1">Outage Radar</h2>
      <p className="text-xs text-slate-500 mb-4">
        Generation unavailability across Europe
      </p>

      {/* Total banner */}
      <div className="flex items-baseline gap-2 mb-4 pb-3 border-b border-white/[0.06]">
        <span className="text-2xl font-bold text-red-400">
          {(totalUnavailable / 1000).toFixed(1)}
        </span>
        <span className="text-sm text-slate-400">GW unavailable</span>
      </div>

      {/* Country rows */}
      <div className="space-y-1 max-h-[60vh] overflow-y-auto sidebar-scroll">
        {sorted.map((o) => {
          const capMW = installedCap[o.iso2] || 0;
          const pct = capMW > 0 ? (o.unavailableMW / capMW) * 100 : 0;
          const color = severityColor(pct);
          const isExpanded = expandedCountry === o.iso2;
          const countryName =
            COUNTRY_CENTROIDS[o.iso2]?.name || o.country;

          return (
            <div key={o.iso2}>
              <button
                onClick={() =>
                  setExpandedCountry(isExpanded ? null : o.iso2)
                }
                className="w-full text-left px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm">{countryFlag(o.iso2)}</span>
                  <span className="text-sm text-slate-200 font-medium flex-1">
                    {countryName}
                  </span>
                  <span
                    className="text-xs font-medium tabular-nums"
                    style={{ color }}
                  >
                    {o.unavailableMW.toLocaleString()} MW
                  </span>
                  <span className="text-[10px] text-slate-600 ml-1">
                    {isExpanded ? '\u25B4' : '\u25BE'}
                  </span>
                </div>

                {/* Severity bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 w-12 text-right tabular-nums">
                    {pct.toFixed(1)}%
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-slate-600">
                    {o.outageCount} outage{o.outageCount !== 1 ? 's' : ''}
                  </span>
                  <span
                    className="text-[10px] font-medium"
                    style={{ color }}
                  >
                    {severityLabel(pct)}
                  </span>
                </div>
              </button>

              {/* Expanded: top outages */}
              {isExpanded && o.topOutages.length > 0 && (
                <div className="ml-7 mr-2 mb-2 space-y-1">
                  {o.topOutages.map((entry, i) => (
                    <div
                      key={i}
                      className="py-1.5 px-2 rounded bg-white/[0.02] space-y-0.5"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor:
                              entry.type === 'unplanned'
                                ? 'rgb(248, 113, 113)'
                                : 'rgb(250, 204, 21)',
                          }}
                        />
                        <span className="text-[11px] text-slate-300 flex-1 truncate">
                          {entry.name}
                        </span>
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          {entry.unavailableMW.toLocaleString()} MW
                        </span>
                      </div>
                      <div className="flex items-center gap-2 ml-3.5">
                        <span className="text-[9px] text-slate-600 uppercase">
                          {entry.type === 'unplanned' ? 'UNP' : 'PLN'}
                        </span>
                        {entry.fuel && (
                          <span className="text-[9px] text-slate-600">
                            {entry.fuel}
                          </span>
                        )}
                        {entry.expectedReturn && (
                          <span className="text-[9px] text-slate-600">
                            ETA {formatUtcShort(entry.expectedReturn)}
                          </span>
                        )}
                      </div>
                    </div>
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
