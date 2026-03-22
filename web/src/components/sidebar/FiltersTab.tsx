'use client';

import { useMemo, useState } from 'react';
import { FUEL_COLORS, FILTER_FUELS, FILTER_FUEL_LABELS } from '@/lib/colors';
import {
  BUILT_IN_PRESETS,
  getAllPresets,
  savePreset,
  captureState,
} from '@/lib/workspace-presets';
import type { SidebarProps } from './SidebarShell';

const CARD = 'bg-black/60 backdrop-blur-xl border border-white/[0.06] rounded-2xl shadow-2xl';

export default function FiltersTab({
  selectedFuels,
  onToggleFuel,
  minCapacity,
  onSetMinCapacity,
  selectedCountries,
  onToggleCountry,
  onSelectAllCountries,
  onClearCountries,
  availableCountries,
  layerVisibility,
  onScreenshot,
  onExportCSV,
  onApplyPreset,
  onDeletePreset,
  onPresetSaved,
  presetsVersion,
}: SidebarProps) {
  const [showCountries, setShowCountries] = useState(false);
  const [saveLabel, setSaveLabel] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const selectedCountryCount = selectedCountries?.size ?? availableCountries.length;
  const allPresets = useMemo(() => getAllPresets(), [presetsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSavePreset() {
    const state = captureState(layerVisibility, selectedFuels, minCapacity, selectedCountries);
    savePreset(saveLabel, state);
    setSaveLabel('');
    setShowSaveInput(false);
    onPresetSaved();
  }

  return (
    <>
      {/* Fuel + Capacity + Country filters */}
      <div className={`${CARD} p-4`}>
        <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
          Fuel Types
        </h2>

        {/* Fuel pills */}
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
                  color: active ? `rgb(${color[0]},${color[1]},${color[2]})` : '#64748b',
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
              <span className="text-sky-400 ml-1">({selectedCountryCount})</span>
            </span>
            <span className="text-[10px]">{showCountries ? '\u25B4' : '\u25BE'}</span>
          </button>

          {showCountries && (
            <div className="mt-2">
              <div className="flex gap-2 mb-2">
                <button onClick={onSelectAllCountries} className="text-[10px] text-sky-400 hover:text-sky-300">
                  All
                </button>
                <button onClick={onClearCountries} className="text-[10px] text-slate-500 hover:text-slate-400">
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
                      checked={selectedCountries === null || selectedCountries.has(code)}
                      onChange={() => onToggleCountry(code)}
                      className="accent-sky-500 w-3 h-3"
                    />
                    <span className="text-[11px] text-slate-400">{name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Presets */}
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
                if (e.key === 'Enter') handleSavePreset();
                if (e.key === 'Escape') { setShowSaveInput(false); setSaveLabel(''); }
              }}
              placeholder="Preset name..."
              autoFocus
              className="flex-1 min-w-0 bg-black/40 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[12px] text-slate-200 placeholder-slate-600 outline-none focus:border-sky-500/50"
            />
            <button
              onClick={handleSavePreset}
              className="px-2.5 py-1.5 rounded-lg bg-sky-500/20 border border-sky-500/30 text-[11px] text-sky-400 hover:bg-sky-500/30 transition-colors"
            >
              Save
            </button>
          </div>
        )}

        {/* Built-in preset pills */}
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
              <div key={preset.id} className="flex items-center gap-2 group">
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

      {/* Export */}
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
            onClick={() => { navigator.clipboard.writeText(window.location.href); }}
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
    </>
  );
}
