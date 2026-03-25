'use client';

import React, { useMemo } from 'react';
import type {
  CountryForecast,
  CountryOutage,
  CountryPrice,
  CrossBorderFlow,
} from '@/lib/data-fetcher';
import { COUNTRY_CENTROIDS } from '@/lib/countries';
import { identifyMarketReads } from '@/lib/pipeline-intel';
import type { TyndpProject } from '@/lib/tyndp';
import { formatPriceValue, MIXED_PRICE_UNIT_LABEL } from '@/lib/price-format';

interface TraderDashboardProps {
  prices: CountryPrice[];
  flows: CrossBorderFlow[];
  outages: CountryOutage[];
  forecasts: CountryForecast[];
  projects: TyndpProject[];
  onSelectCountry: (iso2: string) => void;
  onSelectCorridor: (from: string, to: string) => void;
  onClose: () => void;
  embedded?: boolean;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
      {children}
    </h4>
  );
}

function PriceRow({
  iso2,
  name,
  price,
  delta,
  onClick,
}: {
  iso2: string;
  name: string;
  price: number;
  delta?: number;
  onClick: () => void;
}) {
  const deltaColor = delta === undefined
    ? ''
    : delta > 0
      ? 'text-red-400'
      : delta < 0
        ? 'text-emerald-400'
        : 'text-slate-500';
  const priceColor = price > 100 ? 'text-red-400' : price > 60 ? 'text-yellow-400' : 'text-emerald-400';

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
    >
      <span className="truncate text-[12px] text-slate-300 group-hover:text-white">{name}</span>
      <div className="ml-2 flex flex-shrink-0 items-center gap-2">
        {delta !== undefined && (
          <span className={`text-[10px] tabular-nums ${deltaColor}`}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(0)}
          </span>
        )}
        <span className={`text-[12px] font-medium tabular-nums ${priceColor}`}>
          {formatPriceValue(price, iso2, 0)}
        </span>
      </div>
    </button>
  );
}

export default function TraderDashboard({
  prices,
  flows,
  outages,
  forecasts,
  projects,
  onSelectCountry,
  onSelectCorridor,
  onClose,
  embedded = false,
}: TraderDashboardProps) {
  const topPrices = useMemo(
    () => [...prices].sort((a, b) => b.price - a.price).slice(0, 5),
    [prices],
  );
  const bottomPrices = useMemo(
    () => [...prices].sort((a, b) => a.price - b.price).slice(0, 5),
    [prices],
  );
  const avgPrice = useMemo(() => {
    if (prices.length === 0) {
      return 0;
    }
    return prices.reduce((sum, price) => sum + price.price, 0) / prices.length;
  }, [prices]);
  const topCongested = useMemo(
    () =>
      [...flows]
        .map((flow) => ({
          ...flow,
          util: flow.capacityMW > 0 ? flow.flowMW / flow.capacityMW : 0,
        }))
        .filter((flow) => flow.util > 0.3)
        .sort((a, b) => b.util - a.util)
        .slice(0, 4),
    [flows],
  );
  const topOutages = useMemo(
    () =>
      [...outages]
        .filter((outage) => outage.unavailableMW > 0)
        .sort((a, b) => b.unavailableMW - a.unavailableMW)
        .slice(0, 4),
    [outages],
  );
  const topForecastMisses = useMemo(() => {
    const entries: { name: string; iso2: string; source: string; mape: number; direction: string }[] = [];
    for (const forecast of forecasts) {
      if (forecast.wind.mape > 5) {
        entries.push({
          name: forecast.country,
          iso2: forecast.iso2,
          source: 'Wind',
          mape: forecast.wind.mape,
          direction: forecast.wind.surpriseDirection,
        });
      }
      if (forecast.solar.mape > 5) {
        entries.push({
          name: forecast.country,
          iso2: forecast.iso2,
          source: 'Solar',
          mape: forecast.solar.mape,
          direction: forecast.solar.surpriseDirection,
        });
      }
    }
    return entries.sort((a, b) => b.mape - a.mape).slice(0, 4);
  }, [forecasts]);
  const marketReads = useMemo(
    () => identifyMarketReads(projects, prices, flows).slice(0, 3),
    [projects, prices, flows],
  );

  const wrapperClass = embedded
    ? 'flex h-full flex-col'
    : 'right-panel absolute right-4 flex max-h-[calc(100vh-32px)] w-[300px] flex-col rounded-2xl border border-white/[0.06] bg-[#0a0e17]/92 shadow-2xl backdrop-blur-xl';

  return (
    <div
      className={wrapperClass}
      style={embedded ? undefined : { top: 16, zIndex: 15, animation: 'slideInRight 0.2s ease-out' }}
    >
      <div className={`flex flex-shrink-0 items-center justify-between border-b border-white/[0.04] ${embedded ? 'pb-3' : 'px-4 pb-2 pt-4'}`}>
        <div>
          <h3 className="text-sm font-bold text-white">Morning Brief</h3>
          <p className="mt-0.5 text-[10px] text-slate-500">
            EU avg <span className="font-medium text-slate-400">{avgPrice.toFixed(0)} {MIXED_PRICE_UNIT_LABEL}</span>
            {' | '}{prices.length} zones
          </p>
        </div>
        {!embedded && (
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-500 transition-colors hover:text-white"
            aria-label="Close morning brief"
          >
            &times;
          </button>
        )}
      </div>

      <div className={`flex-1 space-y-4 overflow-y-auto sidebar-scroll ${embedded ? 'pr-1 pt-3' : 'px-4 py-3'}`}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <SectionTitle>Most expensive</SectionTitle>
            {topPrices.map((price) => (
              <PriceRow
                key={price.iso2}
                iso2={price.iso2}
                name={price.country}
                price={price.price}
                delta={price.price - avgPrice}
                onClick={() => onSelectCountry(price.iso2)}
              />
            ))}
          </div>
          <div>
            <SectionTitle>Cheapest</SectionTitle>
            {bottomPrices.map((price) => (
              <PriceRow
                key={price.iso2}
                iso2={price.iso2}
                name={price.country}
                price={price.price}
                delta={price.price - avgPrice}
                onClick={() => onSelectCountry(price.iso2)}
              />
            ))}
          </div>
        </div>

        {topCongested.length > 0 && (
          <div>
            <SectionTitle>Congested corridors</SectionTitle>
            {topCongested.map((flow) => {
              const fromName = COUNTRY_CENTROIDS[flow.from]?.name ?? flow.from;
              const toName = COUNTRY_CENTROIDS[flow.to]?.name ?? flow.to;
              const pct = (flow.util * 100).toFixed(0);
              return (
                <button
                  key={`${flow.from}-${flow.to}`}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
                  onClick={() => onSelectCorridor(flow.from, flow.to)}
                >
                  <span className="truncate text-[11px] text-slate-400">{fromName} -&gt; {toName}</span>
                  <span className={`ml-2 flex-shrink-0 text-[11px] font-medium tabular-nums ${
                    flow.util > 0.8 ? 'text-red-400' : flow.util > 0.5 ? 'text-yellow-400' : 'text-emerald-400'
                  }`}>
                    {pct}%
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {topOutages.length > 0 && (
          <div>
            <SectionTitle>Largest outages</SectionTitle>
            {topOutages.map((outage) => (
              <button
                key={outage.iso2}
                type="button"
                className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
                onClick={() => onSelectCountry(outage.iso2)}
              >
                <span className="truncate text-[11px] text-slate-400">{outage.country}</span>
                <span className="ml-2 flex-shrink-0 text-[11px] font-medium tabular-nums text-amber-400">
                  {outage.unavailableMW.toLocaleString()} MW
                </span>
              </button>
            ))}
          </div>
        )}

        {topForecastMisses.length > 0 && (
          <div>
            <SectionTitle>Forecast misses</SectionTitle>
            {topForecastMisses.map((forecast, index) => (
              <button
                key={`${forecast.iso2}-${forecast.source}-${index}`}
                type="button"
                className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
                onClick={() => onSelectCountry(forecast.iso2)}
              >
                <span className="truncate text-[11px] text-slate-400">{forecast.name} {forecast.source}</span>
                <div className="ml-2 flex flex-shrink-0 items-center gap-1.5">
                  <span className="text-[10px] text-slate-600">
                    {forecast.direction === 'above' ? '^' : forecast.direction === 'below' ? 'v' : '-'}
                  </span>
                  <span className="text-[11px] font-medium tabular-nums text-orange-400">
                    {forecast.mape.toFixed(1)}%
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {marketReads.length > 0 && (
          <div>
            <SectionTitle>Pipeline reads</SectionTitle>
            <div className="space-y-1.5">
              {marketReads.map((read, index) => {
                const color =
                  read.type === 'congestion_price_driver'
                    ? '#f87171'
                    : read.type === 'pipeline_near_term'
                      ? '#4ade80'
                      : '#38bdf8';
                return (
                  <button
                    key={`${read.label}-${index}`}
                    type="button"
                    onClick={() => read.iso2 && onSelectCountry(read.iso2)}
                    disabled={!read.iso2}
                    className="w-full rounded-xl border px-2.5 py-2 text-left transition-colors hover:bg-white/[0.03]"
                    style={{ borderColor: `${color}28`, backgroundColor: `${color}0a` }}
                  >
                    <p className="text-[11px] font-medium leading-tight" style={{ color }}>
                      {read.label}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600">
                      {read.detail}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {topCongested.length === 0 && topOutages.length === 0 && topForecastMisses.length === 0 && marketReads.length === 0 && (
          <div className="py-2 text-center">
            <p className="text-[11px] text-slate-600">
              Enable outage and forecast layers to see market intelligence here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
