'use client';

import React from 'react';
import LiveStatusStrip from './LiveStatusStrip';
import ForecastPanel from './ForecastPanel';
import OutageRadar from './OutageRadar';
import TraderDashboard from './TraderDashboard';
import SpreadMatrix from './SpreadMatrix';
import type { ExpandedSeriesConfig } from './charts/ExpandedSeriesPanel';
import type {
  CountryForecast,
  CountryOutage,
  OutageEntry,
  CountryPrice,
  CrossBorderFlow,
  PowerPlant,
} from '@/lib/data-fetcher';
import type { LiveStatusSummary } from '@/lib/live-data-store';
import type { IntelligenceView } from '@/lib/store';
import type { TyndpProject } from '@/lib/tyndp';

interface MarketIntelligenceRailProps {
  activeView: IntelligenceView;
  prices: CountryPrice[];
  flows: CrossBorderFlow[];
  outages: CountryOutage[];
  forecasts: CountryForecast[];
  plants: PowerPlant[];
  projects: TyndpProject[];
  liveStatus: LiveStatusSummary;
  onViewChange: (view: Exclude<IntelligenceView, 'none'>) => void;
  onRefresh: () => void;
  onSelectCountry: (iso2: string) => void;
  onSelectCorridor: (from: string, to: string) => void;
  onSelectPlant: (entry: OutageEntry) => void;
  onExpandSeries: (config: ExpandedSeriesConfig) => void;
  onClose: () => void;
}

const TAB_LABELS: Record<Exclude<IntelligenceView, 'none'>, string> = {
  brief: 'Morning Brief',
  outages: 'Outage Radar',
  forecast: 'Forecast vs Actual',
  spreads: 'Spread Desk',
};

export default function MarketIntelligenceRail({
  activeView,
  prices,
  flows,
  outages,
  forecasts,
  plants,
  projects,
  liveStatus,
  onViewChange,
  onRefresh,
  onSelectCountry,
  onSelectCorridor,
  onSelectPlant,
  onExpandSeries,
  onClose,
}: MarketIntelligenceRailProps) {
  if (activeView === 'none') {
    return null;
  }

  return (
    <aside
      data-tour-id="intelligence-rail"
      className="right-panel absolute right-4 top-4 z-[15] flex max-h-[calc(100vh-32px)] w-[360px] flex-col rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(14,20,33,0.97),rgba(8,12,20,0.94))] p-4 shadow-2xl backdrop-blur-2xl"
      style={{ animation: 'slideInRight 0.22s ease-out' }}
    >
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-white/[0.06] pb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-cyan-300/80">
            Market Intelligence
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            {TAB_LABELS[activeView]}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/[0.08] px-2.5 py-1 text-xs text-slate-400 transition-colors hover:border-white/[0.14] hover:text-white"
          aria-label="Close market intelligence rail"
        >
          Close
        </button>
      </div>

      <LiveStatusStrip summary={liveStatus} onRefresh={onRefresh} />

      <div className="mt-3 grid grid-cols-4 gap-2">
        {(Object.keys(TAB_LABELS) as Exclude<IntelligenceView, 'none'>[]).map((view) => (
          <button
            key={view}
            type="button"
            data-tour-id={`rail-${view}`}
            onClick={() => onViewChange(view)}
            className={`rounded-2xl border px-2.5 py-2 text-left transition-colors ${
              activeView === view
                ? 'border-cyan-300/35 bg-cyan-300/12 text-white'
                : 'border-white/[0.06] bg-white/[0.03] text-slate-400 hover:border-white/[0.12] hover:text-white'
            }`}
            aria-pressed={activeView === view}
          >
            <span className="block text-[10px] font-medium">{TAB_LABELS[view]}</span>
            <span className="mt-1 block text-[9px] text-slate-500">
              {view === 'brief'
                ? `${prices.length} markets`
                : view === 'outages'
                  ? `${outages.length} windows`
                  : view === 'forecast'
                    ? `${forecasts.length} sets`
                    : `${flows.length} corridors`}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-[24px] border border-white/[0.06] bg-white/[0.025] p-4">
        {activeView === 'brief' && (
          <TraderDashboard
            embedded
            prices={prices}
            flows={flows}
            outages={outages}
            forecasts={forecasts}
            projects={projects}
            onSelectCountry={onSelectCountry}
            onSelectCorridor={onSelectCorridor}
            onClose={onClose}
          />
        )}

        {activeView === 'outages' && (
          <OutageRadar
            embedded
            outages={outages}
            plants={plants}
            onSelectCountry={onSelectCountry}
            onSelectPlant={onSelectPlant}
            onClose={onClose}
          />
        )}

        {activeView === 'forecast' && (
          <ForecastPanel
            embedded
            forecasts={forecasts}
            onClose={onClose}
            onExpandSeries={onExpandSeries}
          />
        )}

        {activeView === 'spreads' && (
          <SpreadMatrix
            embedded
            prices={prices}
            flows={flows}
            onSelectCorridor={onSelectCorridor}
          />
        )}
      </div>
    </aside>
  );
}
