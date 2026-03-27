'use client';

import React from 'react';
import type { ExpandedSeriesConfig } from '@/components/charts/ExpandedSeriesPanel';
import { COUNTRY_CENTROIDS } from '@/lib/countries';
import type {
  CountryForecast,
  CountryOutage,
  CountryPrice,
  CrossBorderFlow,
  PowerPlant,
} from '@/lib/data-fetcher';
import type { DetailSelection } from '@/lib/store';

import CorridorContextSection from './CorridorContextSection';
import CountryContextSection from './CountryContextSection';
import PlantContextSection from './PlantContextSection';

interface TopContextDockProps {
  detail: DetailSelection;
  plants: PowerPlant[];
  prices: CountryPrice[];
  flows: CrossBorderFlow[];
  outages: CountryOutage[];
  forecasts: CountryForecast[];
  onClose: () => void;
  onExpandSeries: (config: ExpandedSeriesConfig) => void;
}

function titleForDetail(detail: DetailSelection) {
  if (detail.kind === 'country') {
    return COUNTRY_CENTROIDS[detail.data.iso2]?.name ?? detail.data.country;
  }
  if (detail.kind === 'plant') {
    return detail.data.name;
  }
  if (detail.kind === 'corridor') {
    return `${detail.data.from} -> ${detail.data.to}`;
  }
  return '';
}

function subtitleForDetail(detail: DetailSelection) {
  if (detail.kind === 'country') {
    return 'Country context';
  }
  if (detail.kind === 'plant') {
    return `${detail.data.country} | ${detail.data.fuel}`;
  }
  if (detail.kind === 'corridor') {
    return 'Cross-border corridor';
  }
  return '';
}

export default function TopContextDock({
  detail,
  plants,
  prices,
  flows,
  outages,
  forecasts,
  onClose,
  onExpandSeries,
}: TopContextDockProps) {
  if (detail.kind === 'none' || detail.kind === 'tyndp') {
    return null;
  }

  return (
    <section
      data-tour-id="top-context-dock"
      className="top-context-dock absolute z-[16] rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(14,20,33,0.98),rgba(8,12,20,0.96))] p-4 shadow-2xl backdrop-blur-2xl"
    >
      <div className="mb-3 flex items-start justify-between gap-4 border-b border-white/[0.06] pb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
            Context Dock
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">{titleForDetail(detail)}</h2>
          <p className="mt-1 text-xs text-slate-400">{subtitleForDetail(detail)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/[0.08] px-3 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-white/[0.14] hover:text-white"
        >
          Close
        </button>
      </div>

      {detail.kind === 'country' && (
        <CountryContextSection
          data={detail.data}
          plants={plants}
          flows={flows}
          outages={outages}
          forecasts={forecasts}
          onExpandSeries={onExpandSeries}
        />
      )}

      {detail.kind === 'plant' && (
        <PlantContextSection
          data={detail.data}
          prices={prices}
          outages={outages}
          forecasts={forecasts}
          onExpandSeries={onExpandSeries}
        />
      )}

      {detail.kind === 'corridor' && (
        <CorridorContextSection
          data={detail.data}
          prices={prices}
          outages={outages}
          onExpandSeries={onExpandSeries}
        />
      )}
    </section>
  );
}
