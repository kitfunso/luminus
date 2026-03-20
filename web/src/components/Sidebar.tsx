'use client';

import { useMemo, useState } from 'react';
import {
  FUEL_COLORS,
  FILTER_FUELS,
  FUEL_FILTER_MAP,
  FILTER_FUEL_LABELS,
  normalizeFuel,
} from '@/lib/colors';
import type { PowerPlant, CountryPrice } from '@/lib/data-fetcher';

export type LayerKey = 'plants' | 'prices' | 'flows' | 'lines' | 'tyndp' | 'genMix';

interface SidebarProps {
  plants: PowerPlant[];
  filteredPlants: PowerPlant[];
  prices: CountryPrice[];
  lastUpdate: string;
  layerVisibility: Record<LayerKey, boolean>;
  onToggleLayer: (layer: LayerKey) => void;
  isLoading: boolean;
  selectedFuels: Set<string>;
  onToggleFuel: (fuel: string) => void;
  minCapacity: number;
  onSetMinCapacity: (value: number) => void;
  selectedCountries: Set<string>;
  onToggleCountry: (code: string) => void;
  availableCountries: { code: string; name: string }[];
  zoomLevel: number;
  onScreenshot: () => void;
  onExportCSV: () => void;
}

const CARD =
  'bg-black/60 backdrop-blur-xl border border-white/[0.06] rounded-2xl shadow-2xl';

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="toggle-label">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="toggle-input"
      />
      <span className="toggle-track" />
      <span className="text-sm text-slate-300">{label}</span>
    </label>
  );
}

function PriceBar() {
  return (
    <div className="mt-2 space-y-1">
      <div
        className="h-3.5 rounded-full"
        style={{
          background:
            'linear-gradient(to right, #00c850 0%, #cccc00 50%, #ff4400 100%)',
        }}
      />
      <div className="flex justify-between text-[10px] text-slate-500 px-0.5">
        <span>0</span>
        <span>50</span>
        <span>100</span>
        <span>150</span>
        <span>200+</span>
      </div>
    </div>
  );
}

function Shimmer() {
  return <div className="h-6 w-16 rounded bg-slate-800 animate-shimmer" />;
}

export default function Sidebar({
  filteredPlants,
  prices,
  lastUpdate,
  layerVisibility,
  onToggleLayer,
  isLoading,
  selectedFuels,
  onToggleFuel,
  minCapacity,
  onSetMinCapacity,
  selectedCountries,
  onToggleCountry,
  availableCountries,
  zoomLevel,
  onScreenshot,
  onExportCSV,
}: SidebarProps) {
  const [showCountries, setShowCountries] = useState(false);

  // Aggregate stats from filtered data
  const stats = useMemo(() => {
    const totalCapacityMW = filteredPlants.reduce(
      (s, p) => s + p.capacity,
      0
    );
    const visibleCountryCodes = new Set(filteredPlants.map((p) => p.country));
    const relevantPrices = prices.filter((p) =>
      visibleCountryCodes.has(p.iso2)
    );
    const avgPrice =
      relevantPrices.length > 0
        ? relevantPrices.reduce((s, p) => s + p.price, 0) /
          relevantPrices.length
        : 0;

    return {
      plantCount: filteredPlants.length,
      capacityGW: totalCapacityMW / 1000,
      countryCount: visibleCountryCodes.size,
      avgPrice,
    };
  }, [filteredPlants, prices]);

  // Fuel breakdown for the bar chart
  const fuelBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    for (const p of filteredPlants) {
      const fuel = normalizeFuel(p.fuel);
      const cat = FUEL_FILTER_MAP[fuel] || 'other';
      breakdown[cat] = (breakdown[cat] || 0) + p.capacity;
    }
    const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
    return FILTER_FUELS.filter((f) => (breakdown[f] || 0) > 0).map((fuel) => ({
      fuel,
      capacityGW: (breakdown[fuel] || 0) / 1000,
      pct: total > 0 ? ((breakdown[fuel] || 0) / total) * 100 : 0,
    }));
  }, [filteredPlants]);

  return (
    <div className="absolute top-0 left-0 w-72 h-full z-10 pointer-events-none">
      <div className="m-4 flex flex-col gap-3 pointer-events-auto max-h-[calc(100vh-2rem)] overflow-y-auto sidebar-scroll">
        {/* Header */}
        <div className={`${CARD} p-5`}>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Luminus
          </h1>
          <p className="text-xs text-white/40 mt-1 font-medium tracking-widest uppercase">
            European Energy Grid
          </p>
        </div>

        {/* Stats Dashboard */}
        <div className={`${CARD} p-4`}>
          <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Overview
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              {isLoading ? (
                <Shimmer />
              ) : (
                <div className="text-xl font-bold text-sky-400 animate-pulse-glow">
                  {stats.plantCount.toLocaleString()}
                </div>
              )}
              <div className="text-[11px] text-slate-500 mt-0.5">
                Plants
              </div>
            </div>
            <div>
              {isLoading ? (
                <Shimmer />
              ) : (
                <div className="text-xl font-bold text-sky-400 animate-pulse-glow">
                  {stats.capacityGW.toFixed(1)}
                </div>
              )}
              <div className="text-[11px] text-slate-500 mt-0.5">
                Capacity GW
              </div>
            </div>
            <div>
              {isLoading ? (
                <Shimmer />
              ) : (
                <div className="text-xl font-bold text-emerald-400 animate-pulse-glow">
                  {stats.avgPrice > 0
                    ? `\u20AC${stats.avgPrice.toFixed(0)}`
                    : '\u2014'}
                </div>
              )}
              <div className="text-[11px] text-slate-500 mt-0.5">
                Avg EUR/MWh
              </div>
            </div>
            <div>
              {isLoading ? (
                <Shimmer />
              ) : (
                <div className="text-xl font-bold text-sky-400 animate-pulse-glow">
                  {stats.countryCount}
                </div>
              )}
              <div className="text-[11px] text-slate-500 mt-0.5">
                Countries
              </div>
            </div>
          </div>

          {/* Fuel breakdown bars */}
          {!isLoading && fuelBreakdown.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-1.5">
              {fuelBreakdown.map(({ fuel, capacityGW, pct }) => {
                const color = FUEL_COLORS[fuel] || FUEL_COLORS.other;
                return (
                  <div key={fuel} className="flex items-center gap-2 text-xs">
                    <span className="w-12 text-slate-500 truncate">
                      {FILTER_FUEL_LABELS[fuel] || fuel}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: `rgb(${color[0]},${color[1]},${color[2]})`,
                        }}
                      />
                    </div>
                    <span className="w-14 text-right text-slate-600 tabular-nums">
                      {capacityGW.toFixed(1)} GW
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="text-[11px] text-slate-600 mt-3 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
            Updated {lastUpdate}
            <span className="ml-auto text-slate-700 tabular-nums">
              z{zoomLevel.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className={`${CARD} p-4`}>
          <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Filters
          </h2>

          {/* Fuel type pills */}
          <div className="flex flex-wrap gap-1.5">
            {FILTER_FUELS.map((fuel) => {
              const color = FUEL_COLORS[fuel] || FUEL_COLORS.other;
              const active = selectedFuels.has(fuel);
              return (
                <button
                  key={fuel}
                  onClick={() => onToggleFuel(fuel)}
                  className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all"
                  style={{
                    border: `1px solid rgba(${color[0]},${color[1]},${color[2]},${active ? 0.5 : 0.15})`,
                    backgroundColor: `rgba(${color[0]},${color[1]},${color[2]},${active ? 0.15 : 0.03})`,
                    color: active
                      ? `rgb(${color[0]},${color[1]},${color[2]})`
                      : '#64748b',
                    opacity: active ? 1 : 0.5,
                  }}
                >
                  {FILTER_FUEL_LABELS[fuel] || fuel}
                </button>
              );
            })}
          </div>

          {/* Capacity slider */}
          <div className="mt-4">
            <div className="flex justify-between items-baseline mb-1.5">
              <span className="text-[11px] text-slate-400">Min Capacity</span>
              <span className="text-[11px] text-slate-300 font-medium tabular-nums">
                {minCapacity} MW
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={2000}
              step={50}
              value={minCapacity}
              onChange={(e) => onSetMinCapacity(Number(e.target.value))}
              className="range-slider w-full"
            />
            <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
              <span>0</span>
              <span>500</span>
              <span>1000</span>
              <span>2000</span>
            </div>
          </div>

          {/* Country filter */}
          <div className="mt-4">
            <button
              onClick={() => setShowCountries(!showCountries)}
              className="flex items-center justify-between w-full text-[11px] text-slate-400 hover:text-slate-300 transition-colors"
            >
              <span>
                Countries{' '}
                {selectedCountries.size > 0 && (
                  <span className="text-sky-400 ml-1">
                    ({selectedCountries.size})
                  </span>
                )}
              </span>
              <span className="text-[10px]">
                {showCountries ? '\u25B4' : '\u25BE'}
              </span>
            </button>

            {showCountries && (
              <div className="mt-2">
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => {
                      for (const c of availableCountries) {
                        if (selectedCountries.has(c.code)) {
                          onToggleCountry(c.code);
                        }
                      }
                    }}
                    className="text-[10px] text-sky-400 hover:text-sky-300"
                  >
                    All
                  </button>
                  <button
                    onClick={() => {
                      for (const c of availableCountries) {
                        if (!selectedCountries.has(c.code)) {
                          onToggleCountry(c.code);
                        }
                      }
                    }}
                    className="text-[10px] text-slate-500 hover:text-slate-400"
                  >
                    None
                  </button>
                </div>
                <div className="max-h-36 overflow-y-auto sidebar-scroll space-y-0.5">
                  {availableCountries.map(({ code, name }) => (
                    <label
                      key={code}
                      className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-white/[0.02] rounded px-1 -mx-1"
                    >
                      <input
                        type="checkbox"
                        checked={
                          selectedCountries.size === 0 ||
                          selectedCountries.has(code)
                        }
                        onChange={() => onToggleCountry(code)}
                        className="accent-sky-500 w-3 h-3"
                      />
                      <span className="text-[11px] text-slate-400">
                        {name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Layer toggles */}
        <div className={`${CARD} p-4`}>
          <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Layers
          </h2>
          <div className="flex flex-col gap-2.5">
            <Toggle
              checked={layerVisibility.plants}
              onChange={() => onToggleLayer('plants')}
              label="Power Plants"
            />
            <Toggle
              checked={layerVisibility.prices}
              onChange={() => onToggleLayer('prices')}
              label="Price Heatmap"
            />
            <Toggle
              checked={layerVisibility.flows}
              onChange={() => onToggleLayer('flows')}
              label="Cross-border Flows"
            />
            <Toggle
              checked={layerVisibility.lines}
              onChange={() => onToggleLayer('lines')}
              label="Transmission Lines"
            />
            <Toggle
              checked={layerVisibility.tyndp}
              onChange={() => onToggleLayer('tyndp')}
              label="TYNDP Pipeline"
            />
            <Toggle
              checked={layerVisibility.genMix}
              onChange={() => onToggleLayer('genMix')}
              label="Generation Mix"
            />
          </div>
        </div>

        {/* Price legend */}
        <div className={`${CARD} p-4`}>
          <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
            Day-Ahead Price (EUR/MWh)
          </h2>
          <PriceBar />
        </div>

        {/* Export & Share */}
        <div className={`${CARD} p-4`}>
          <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Export
          </h2>
          <div className="flex flex-col gap-2">
            <button onClick={onScreenshot} className="export-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
              Screenshot
            </button>
            <button onClick={onExportCSV} className="export-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Export CSV
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
              }}
              className="export-btn"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              Copy Link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
