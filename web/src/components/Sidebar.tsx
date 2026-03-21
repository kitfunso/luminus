'use client';

import { useMemo, useState } from 'react';
import {
  FUEL_COLORS,
  FILTER_FUELS,
  FUEL_FILTER_MAP,
  FILTER_FUEL_LABELS,
  normalizeFuel,
} from '@/lib/colors';
import type { PowerPlant, CountryPrice, CrossBorderFlow } from '@/lib/data-fetcher';
import SearchBar from './SearchBar';
import WatchlistPanel from './WatchlistPanel';
import type { WatchlistItem } from '@/lib/watchlist';
import {
  BUILT_IN_PRESETS,
  getAllPresets,
  savePreset,
  captureState,
  type WorkspacePreset,
} from '@/lib/workspace-presets';

export type LayerKey = 'plants' | 'prices' | 'flows' | 'lines' | 'tyndp' | 'genMix' | 'outages' | 'forecast' | 'history';

interface SidebarProps {
  plants: PowerPlant[];
  filteredPlants: PowerPlant[];
  prices: CountryPrice[];
  flows: CrossBorderFlow[];
  lastUpdate: string;
  layerVisibility: Record<LayerKey, boolean>;
  onToggleLayer: (layer: LayerKey) => void;
  isLoading: boolean;
  selectedFuels: Set<string>;
  onToggleFuel: (fuel: string) => void;
  minCapacity: number;
  onSetMinCapacity: (value: number) => void;
  selectedCountries: Set<string> | null;
  onToggleCountry: (code: string) => void;
  onSelectAllCountries: () => void;
  onClearCountries: () => void;
  availableCountries: { code: string; name: string }[];
  zoomLevel: number;
  onScreenshot: () => void;
  onExportCSV: () => void;
  mobileOpen: boolean;
  onToggleMobile: () => void;
  /** True when any right-side panel is visible; hides the floating Menu button on mobile to avoid overlap */
  hasRightPanel: boolean;
  // Sprint 4 additions
  onSelectPlant: (plant: PowerPlant) => void;
  onSelectCountry: (iso2: string) => void;
  onSelectCorridor: (from: string, to: string) => void;
  onSelectWatchlistPlant: (item: WatchlistItem) => void;
  onOpenAlerts: () => void;
  onOpenDashboard: () => void;
  onOpenPipeline: () => void;
  onOpenTimeSeries: (iso2: string) => void;
  watchlistVersion: number;
  onWatchlistChange: () => void;
  // Preset callbacks
  onApplyPreset: (preset: WorkspacePreset) => void;
  onDeletePreset: (id: string) => void;
  onPresetSaved: () => void;
  presetsVersion: number;
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
  plants,
  filteredPlants,
  prices,
  flows,
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
  onSelectAllCountries,
  onClearCountries,
  availableCountries,
  zoomLevel,
  onScreenshot,
  onExportCSV,
  mobileOpen,
  onToggleMobile,
  hasRightPanel: _hasRightPanel,
  onSelectPlant,
  onSelectCountry,
  onSelectCorridor,
  onSelectWatchlistPlant,
  onOpenAlerts,
  onOpenDashboard,
  onOpenPipeline,
  onOpenTimeSeries,
  watchlistVersion,
  onWatchlistChange,
  onApplyPreset,
  onDeletePreset,
  onPresetSaved,
  presetsVersion,
}: SidebarProps) {
  const [showCountries, setShowCountries] = useState(false);
  const selectedCountryCount = selectedCountries?.size ?? availableCountries.length;

  // Presets state
  const [saveLabel, setSaveLabel] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  // presetsVersion from parent triggers re-render, so getAllPresets() sees fresh localStorage
  const allPresets = useMemo(() => getAllPresets(), [presetsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const totalFlowMW = flows.reduce((s, f) => s + f.flowMW, 0);
    const totalCapMW = flows.reduce((s, f) => s + f.capacityMW, 0);
    const bottleneck = totalCapMW > 0 ? (totalFlowMW / totalCapMW) * 100 : 0;

    return {
      plantCount: filteredPlants.length,
      capacityGW: totalCapacityMW / 1000,
      countryCount: visibleCountryCodes.size,
      avgPrice,
      bottleneck,
    };
  }, [filteredPlants, prices, flows]);

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
    <div className="absolute inset-0 z-20 md:z-10 pointer-events-none">
      {/* Mobile trigger — hidden: the bottom action bar handles entry on mobile */}
      <button
        onClick={onToggleMobile}
        className={`hidden`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
        <span className="font-semibold tracking-tight">Luminus</span>
        {prices.length > 0 && (
          <span className="ml-0.5 text-[10px] text-emerald-400/80 font-medium tabular-nums">
            {prices.length} live
          </span>
        )}
      </button>

      {/* Backdrop — blurred for a more premium feel */}
      <button
        onClick={onToggleMobile}
        aria-label="Close menu"
        className={`md:hidden absolute inset-0 sidebar-backdrop transition-opacity duration-200 ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      <div className={`relative m-4 md:m-4 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 pointer-events-auto max-h-[calc(100vh-2rem)] overflow-y-auto sidebar-scroll transition-all duration-200 ease-out md:translate-x-0 ${
        mobileOpen ? 'translate-x-0 opacity-100' : '-translate-x-[calc(100%+1rem)] opacity-0 md:opacity-100'
      }`}>
        {/* Header */}
        <div className={`${CARD} p-5`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Luminus
              </h1>
              <p className="text-xs text-white/40 mt-1 font-medium tracking-widest uppercase">
                European Energy Grid
              </p>
            </div>
            <button
              onClick={onToggleMobile}
              className="md:hidden rounded-xl border border-white/[0.08] px-2 py-1 text-xs text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>

        {/* Search */}
        <div className={`${CARD} p-3`}>
          <SearchBar
            plants={plants}
            prices={prices}
            flows={flows}
            onSelectPlant={(plant) => { onSelectPlant(plant); if (mobileOpen) onToggleMobile(); }}
            onSelectCountry={(iso2) => { onSelectCountry(iso2); if (mobileOpen) onToggleMobile(); }}
            onSelectCorridor={(from, to) => { onSelectCorridor(from, to); if (mobileOpen) onToggleMobile(); }}
            onWatchlistChange={onWatchlistChange}
          />
        </div>

        {/* Watchlist */}
        <div className={`${CARD} p-4`}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Watchlist</h2>
            <div className="flex gap-2">
              <button
                onClick={onOpenDashboard}
                title="Morning brief"
                className="text-[10px] text-slate-500 hover:text-sky-400 transition-colors px-1.5 py-0.5 rounded border border-white/[0.06] hover:border-sky-500/30"
              >
                Brief
              </button>
              <button
                onClick={onOpenPipeline}
                title="Pipeline intelligence"
                className="text-[10px] text-slate-500 hover:text-emerald-400 transition-colors px-1.5 py-0.5 rounded border border-white/[0.06] hover:border-emerald-500/30"
              >
                Pipeline
              </button>
              <button
                onClick={onOpenAlerts}
                title="Alerts"
                className="text-[10px] text-slate-500 hover:text-amber-400 transition-colors px-1.5 py-0.5 rounded border border-white/[0.06] hover:border-amber-500/30"
              >
                Alerts
              </button>
            </div>
          </div>
          <WatchlistPanel
            prices={prices}
            flows={flows}
            onSelectCountry={(iso2) => { onSelectCountry(iso2); onOpenTimeSeries(iso2); if (mobileOpen) onToggleMobile(); }}
            onSelectCorridor={(from, to) => { onSelectCorridor(from, to); if (mobileOpen) onToggleMobile(); }}
            onSelectPlant={(item) => { onSelectWatchlistPlant(item); if (mobileOpen) onToggleMobile(); }}
            version={watchlistVersion}
          />
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
            <div>
              {isLoading ? (
                <Shimmer />
              ) : (
                <div
                  className="text-xl font-bold animate-pulse-glow"
                  style={{
                    color:
                      stats.bottleneck > 80
                        ? 'rgb(248, 113, 113)'
                        : stats.bottleneck > 50
                          ? 'rgb(250, 204, 21)'
                          : 'rgb(74, 222, 128)',
                  }}
                >
                  {stats.bottleneck.toFixed(0)}%
                </div>
              )}
              <div className="text-[11px] text-slate-500 mt-0.5">
                Bottleneck
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
                <span className="text-sky-400 ml-1">
                  ({selectedCountryCount})
                </span>
              </span>
              <span className="text-[10px]">
                {showCountries ? '\u25B4' : '\u25BE'}
              </span>
            </button>

            {showCountries && (
              <div className="mt-2">
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={onSelectAllCountries}
                    className="text-[10px] text-sky-400 hover:text-sky-300"
                  >
                    All
                  </button>
                  <button
                    onClick={onClearCountries}
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
                          selectedCountries === null ||
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
            <Toggle
              checked={layerVisibility.outages}
              onChange={() => onToggleLayer('outages')}
              label="Outage Radar"
            />
            <Toggle
              checked={layerVisibility.forecast}
              onChange={() => onToggleLayer('forecast')}
              label="Forecast vs Actual"
            />
            <Toggle
              checked={layerVisibility.history}
              onChange={() => onToggleLayer('history')}
              label="Time Replay"
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

        {/* Workspace Presets */}
        <div className={`${CARD} p-4`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
              Presets
            </h2>
            <button
              onClick={() => setShowSaveInput((v) => !v)}
              title="Save current workspace as preset"
              className="text-[10px] text-slate-500 hover:text-sky-400 transition-colors px-1.5 py-0.5 rounded border border-white/[0.06] hover:border-sky-500/30"
            >
              {showSaveInput ? 'Cancel' : '+ Save'}
            </button>
          </div>

          {showSaveInput && (
            <div className="mb-3 flex gap-1.5">
              <input
                type="text"
                value={saveLabel}
                onChange={(e) => setSaveLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const state = captureState(layerVisibility, selectedFuels, minCapacity, selectedCountries);
                    savePreset(saveLabel, state);
                    setSaveLabel('');
                    setShowSaveInput(false);
                    onPresetSaved();
                  }
                  if (e.key === 'Escape') { setShowSaveInput(false); setSaveLabel(''); }
                }}
                placeholder="Preset name…"
                autoFocus
                className="flex-1 min-w-0 bg-black/40 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[12px] text-slate-200 placeholder-slate-600 outline-none focus:border-sky-500/50"
              />
              <button
                onClick={() => {
                  const state = captureState(layerVisibility, selectedFuels, minCapacity, selectedCountries);
                  savePreset(saveLabel, state);
                  setSaveLabel('');
                  setShowSaveInput(false);
                  onPresetSaved();
                }}
                className="px-2.5 py-1.5 rounded-lg bg-sky-500/20 border border-sky-500/30 text-[11px] text-sky-400 hover:bg-sky-500/30 transition-colors"
              >
                Save
              </button>
            </div>
          )}

          {/* Built-in presets as quick-apply pills */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {BUILT_IN_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => onApplyPreset(preset)}
                title={preset.description}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-sky-400 hover:border-sky-500/30 hover:bg-sky-500/[0.08] transition-all"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* User-saved presets */}
          {allPresets.filter((p) => !p.builtIn).length > 0 && (
            <div className="space-y-1.5 pt-2.5 border-t border-white/[0.04]">
              {allPresets.filter((p) => !p.builtIn).map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center gap-2 group"
                >
                  <button
                    onClick={() => onApplyPreset(preset)}
                    className="flex-1 text-left text-[11px] text-slate-400 hover:text-white truncate transition-colors py-0.5"
                  >
                    {preset.label}
                  </button>
                  <button
                    onClick={() => onDeletePreset(preset.id)}
                    title="Delete preset"
                    className="opacity-0 group-hover:opacity-100 text-[10px] text-slate-600 hover:text-red-400 transition-all px-1 py-0.5 rounded"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
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
