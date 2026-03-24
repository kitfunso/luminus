'use client';

import { useMemo } from 'react';
import {
  FUEL_COLORS,
  FILTER_FUELS,
  FUEL_FILTER_MAP,
  FILTER_FUEL_LABELS,
  normalizeFuel,
} from '@/lib/colors';
import WatchlistPanel from '../WatchlistPanel';
import type { SidebarProps } from './SidebarShell';

const CARD = 'bg-black/60 backdrop-blur-xl border border-white/[0.06] rounded-2xl shadow-2xl';

function Shimmer() {
  return <div className="h-6 w-16 rounded bg-slate-800 animate-shimmer" />;
}

function priceColor(price: number): string {
  if (price < 50) return 'rgb(74, 222, 128)';
  if (price <= 100) return 'rgb(250, 204, 21)';
  return 'rgb(248, 113, 113)';
}

function gridColor(pct: number): string {
  if (pct < 50) return 'rgb(74, 222, 128)';
  if (pct <= 80) return 'rgb(250, 204, 21)';
  return 'rgb(248, 113, 113)';
}

function gridLabel(pct: number): string {
  if (pct < 50) return 'Normal';
  if (pct <= 80) return 'Stressed';
  return 'Congested';
}

export default function OverviewTab({
  filteredPlants,
  prices,
  flows,
  lastUpdate,
  isLoading,
  mobileOpen,
  onToggleMobile,
  onSelectCountry,
  onSelectCorridor,
  onSelectWatchlistPlant,
  onOpenAlerts,
  onOpenDashboard,
  onOpenPipeline,
  onOpenTimeSeries,
  watchlistVersion,
}: SidebarProps) {
  const stats = useMemo(() => {
    const totalCapacityMW = filteredPlants.reduce((s, p) => s + p.capacity, 0);
    const visibleCountryCodes = new Set(filteredPlants.map((p) => p.country));
    const relevantPrices = prices.filter((p) => visibleCountryCodes.has(p.iso2));
    const avgPrice =
      relevantPrices.length > 0
        ? relevantPrices.reduce((s, p) => s + p.price, 0) / relevantPrices.length
        : 0;

    const totalFlowMW = flows.reduce((s, f) => s + f.flowMW, 0);
    const totalCapMW = flows.reduce((s, f) => s + f.capacityMW, 0);
    const utilisation = totalCapMW > 0 ? (totalFlowMW / totalCapMW) * 100 : 0;

    return {
      capacityGW: totalCapacityMW / 1000,
      avgPrice,
      utilisation,
    };
  }, [filteredPlants, prices, flows]);

  // Top 4 fuels for compact stacked bar
  const fuelBar = useMemo(() => {
    const breakdown: Record<string, number> = {};
    for (const p of filteredPlants) {
      const cat = FUEL_FILTER_MAP[normalizeFuel(p.fuel)] || 'other';
      breakdown[cat] = (breakdown[cat] || 0) + p.capacity;
    }
    const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
    return FILTER_FUELS
      .filter((f) => (breakdown[f] || 0) > 0)
      .map((fuel) => ({
        fuel,
        pct: total > 0 ? ((breakdown[fuel] || 0) / total) * 100 : 0,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 4);
  }, [filteredPlants]);

  const replayTour = () => {
    window.dispatchEvent(new CustomEvent('luminus:replay-tour'));
    if (mobileOpen) onToggleMobile();
  };

  return (
    <>
      {/* Metrics grid */}
      <div className={`${CARD} p-4`}>
        <div className="grid grid-cols-3 gap-3">
          {/* Avg Price */}
          <div>
            {isLoading ? (
              <Shimmer />
            ) : (
              <div
                className="text-xl font-bold tabular-nums"
                style={{ color: stats.avgPrice > 0 ? priceColor(stats.avgPrice) : '#94a3b8' }}
              >
                {stats.avgPrice > 0 ? `\u20AC${stats.avgPrice.toFixed(0)}` : '\u2014'}
              </div>
            )}
            <div className="text-[10px] text-slate-500 mt-0.5">EUR/MWh</div>
          </div>

          {/* Grid Utilisation */}
          <div>
            {isLoading ? (
              <Shimmer />
            ) : (
              <div
                className="text-xl font-bold tabular-nums"
                style={{ color: gridColor(stats.utilisation) }}
              >
                {stats.utilisation.toFixed(0)}%
              </div>
            )}
            <div className="text-[10px] text-slate-500 mt-0.5">
              {isLoading ? 'Grid' : gridLabel(stats.utilisation)}
            </div>
          </div>

          {/* Online Capacity */}
          <div>
            {isLoading ? (
              <Shimmer />
            ) : (
              <div className="text-xl font-bold text-sky-400 tabular-nums">
                {stats.capacityGW.toFixed(1)}
              </div>
            )}
            <div className="text-[10px] text-slate-500 mt-0.5">GW Online</div>
          </div>
        </div>

        {/* Compact stacked fuel bar */}
        {!isLoading && fuelBar.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/[0.04]">
            <div className="flex h-2 rounded-full overflow-hidden gap-px">
              {fuelBar.map(({ fuel, pct }) => {
                const c = FUEL_COLORS[fuel] || FUEL_COLORS.other;
                return (
                  <div
                    key={fuel}
                    className="h-full first:rounded-l-full last:rounded-r-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: `rgb(${c[0]},${c[1]},${c[2]})`,
                    }}
                    title={`${FILTER_FUEL_LABELS[fuel] || fuel}: ${pct.toFixed(0)}%`}
                  />
                );
              })}
            </div>
            <div className="flex gap-2 mt-1.5">
              {fuelBar.map(({ fuel, pct }) => {
                const c = FUEL_COLORS[fuel] || FUEL_COLORS.other;
                return (
                  <span key={fuel} className="flex items-center gap-1 text-[10px] text-slate-500">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: `rgb(${c[0]},${c[1]},${c[2]})` }}
                    />
                    {FILTER_FUEL_LABELS[fuel] || fuel}
                    <span className="tabular-nums">{pct.toFixed(0)}%</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Updated footer */}
        <div className="text-[10px] text-slate-600 mt-3 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
          Updated {lastUpdate}
        </div>
      </div>

      {/* Quick-access buttons */}
      <div className={`${CARD} p-3`}>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={onOpenDashboard}
            className="flex-1 text-[10px] text-slate-500 hover:text-sky-400 transition-colors py-1.5 rounded-lg border border-white/[0.06] hover:border-sky-500/30 hover:bg-sky-500/[0.06]"
          >
            Brief
          </button>
          <button
            onClick={onOpenAlerts}
            className="flex-1 text-[10px] text-slate-500 hover:text-amber-400 transition-colors py-1.5 rounded-lg border border-white/[0.06] hover:border-amber-500/30 hover:bg-amber-500/[0.06]"
          >
            Alerts
          </button>
          <button
            onClick={onOpenPipeline}
            className="flex-1 text-[10px] text-slate-500 hover:text-emerald-400 transition-colors py-1.5 rounded-lg border border-white/[0.06] hover:border-emerald-500/30 hover:bg-emerald-500/[0.06]"
          >
            Pipeline
          </button>
          <button
            onClick={replayTour}
            className="flex-1 text-[10px] text-slate-500 hover:text-cyan-300 transition-colors py-1.5 rounded-lg border border-white/[0.06] hover:border-cyan-300/30 hover:bg-cyan-300/[0.06]"
          >
            Guided Tour
          </button>
        </div>
      </div>

      {/* Watchlist */}
      <div className={`${CARD} p-4`}>
        <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
          Watchlist
        </h2>
        <WatchlistPanel
          prices={prices}
          flows={flows}
          onSelectCountry={(iso2) => { onSelectCountry(iso2); onOpenTimeSeries(iso2); if (mobileOpen) onToggleMobile(); }}
          onSelectCorridor={(from, to) => { onSelectCorridor(from, to); if (mobileOpen) onToggleMobile(); }}
          onSelectPlant={(item) => { onSelectWatchlistPlant(item); if (mobileOpen) onToggleMobile(); }}
          version={watchlistVersion}
        />
      </div>
    </>
  );
}
