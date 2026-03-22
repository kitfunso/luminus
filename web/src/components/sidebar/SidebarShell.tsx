'use client';

import type { PowerPlant, CountryPrice, CrossBorderFlow } from '@/lib/data-fetcher';
import type { WatchlistItem } from '@/lib/watchlist';
import type { WorkspacePreset } from '@/lib/workspace-presets';
import type { LayerKey, SidebarTab } from '@/lib/store';
import { useMapStore } from '@/lib/store';
import { type ReactNode, useState, useEffect } from 'react';
import SearchBar from '../SearchBar';
import OverviewTab from './OverviewTab';
import LayersTab from './LayersTab';
import FiltersTab from './FiltersTab';

// ---------- Props interface (matches what Map.tsx passes) ----------

export interface SidebarProps {
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
  hasRightPanel: boolean;
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
  onApplyPreset: (preset: WorkspacePreset) => void;
  onDeletePreset: (id: string) => void;
  onPresetSaved: () => void;
  presetsVersion: number;
}

// ---------- Constants ----------

const CARD = 'bg-black/60 backdrop-blur-xl border border-white/[0.06] rounded-2xl shadow-2xl';

const TABS: { key: SidebarTab; label: string; icon: ReactNode }[] = [
  {
    key: 'overview',
    label: 'Overview',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    key: 'layers',
    label: 'Layers',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2 2 7l10 5 10-5-10-5Z" />
        <path d="m2 17 10 5 10-5" />
        <path d="m2 12 10 5 10-5" />
      </svg>
    ),
  },
  {
    key: 'filters',
    label: 'Filters',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
      </svg>
    ),
  },
];

// ---------- Component ----------

export default function SidebarShell(props: SidebarProps) {
  const {
    plants, prices, flows,
    mobileOpen, onToggleMobile,
    onSelectPlant, onSelectCountry, onSelectCorridor, onWatchlistChange,
  } = props;

  const [activeTab, setActiveTab] = useState<SidebarTab>('overview');

  const isMobile = useMapStore((s) => s.isMobile);
  const sidebarCollapsed = useMapStore((s) => s.sidebarCollapsed);
  const sidebarTab = useMapStore((s) => s.sidebarTab);
  const setSidebarCollapsed = useMapStore((s) => s.setSidebarCollapsed);
  const setSidebarTab = useMapStore((s) => s.setSidebarTab);
  const setIsMobile = useMapStore((s) => s.setIsMobile);

  // Track viewport width for isMobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [setIsMobile]);

  // Desktop collapsed icon rail
  if (sidebarCollapsed && !isMobile) {
    return (
      <div className="absolute inset-0 z-10 pointer-events-none">
        <div className="absolute top-4 left-4 z-10 pointer-events-auto">
          <div className={`${CARD} p-2 flex flex-col gap-2`}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setSidebarTab(tab.key);
                  setActiveTab(tab.key);
                  setSidebarCollapsed(false);
                }}
                className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${
                  sidebarTab === tab.key
                    ? 'bg-white/[0.08] text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title={tab.label}
              >
                {tab.icon}
              </button>
            ))}

            {/* Expand toggle */}
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-600 hover:text-slate-300 transition-colors border-t border-white/[0.04] mt-1 pt-1"
              title="Expand sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-20 md:z-10 pointer-events-none">
      {/* Mobile trigger (hidden -- bottom action bar handles entry) */}
      <button onClick={onToggleMobile} className="hidden">
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

      {/* Mobile backdrop */}
      <button
        onClick={onToggleMobile}
        aria-label="Close menu"
        className={`md:hidden absolute inset-0 sidebar-backdrop transition-opacity duration-200 ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Sidebar panel */}
      <div
        className={`relative m-4 md:m-4 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 pointer-events-auto max-h-[calc(100vh-2rem)] overflow-y-auto sidebar-scroll transition-all duration-200 ease-out md:translate-x-0 ${
          mobileOpen ? 'translate-x-0 opacity-100' : '-translate-x-[calc(100%+1rem)] opacity-0 md:opacity-100'
        }`}
      >
        {/* Header */}
        <div className={`${CARD} p-5`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Luminus</h1>
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

        {/* Tab bar */}
        <div className={`${CARD} p-1.5`}>
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white/[0.08] text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Active tab content */}
        {activeTab === 'overview' && <OverviewTab {...props} />}
        {activeTab === 'layers' && <LayersTab {...props} />}
        {activeTab === 'filters' && <FiltersTab {...props} />}

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={() => setSidebarCollapsed(true)}
          className="hidden md:flex items-center justify-center w-full py-2 text-slate-600 hover:text-slate-300 transition-colors"
          title="Collapse sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
