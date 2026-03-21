'use client';

import { useMemo } from 'react';
import type { CountryPrice, CrossBorderFlow, CountryOutage, CountryForecast } from '@/lib/data-fetcher';
import { COUNTRY_CENTROIDS } from '@/lib/countries';

interface TraderDashboardProps {
  prices: CountryPrice[];
  flows: CrossBorderFlow[];
  outages: CountryOutage[];
  forecasts: CountryForecast[];
  onSelectCountry: (iso2: string) => void;
  onSelectCorridor: (from: string, to: string) => void;
  onClose: () => void;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-2">{children}</h4>
  );
}

function PriceRow({
  name,
  price,
  delta,
  onClick,
}: {
  name: string;
  price: number;
  delta?: number;
  onClick: () => void;
}) {
  const deltaColor = delta === undefined ? '' : delta > 0 ? 'text-red-400' : delta < 0 ? 'text-emerald-400' : 'text-slate-500';
  const priceColor = price > 100 ? 'text-red-400' : price > 60 ? 'text-yellow-400' : 'text-emerald-400';

  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between w-full py-1.5 hover:bg-white/[0.03] rounded-lg px-1 transition-colors group text-left"
    >
      <span className="text-[12px] text-slate-300 group-hover:text-white truncate">{name}</span>
      <div className="flex items-center gap-2 flex-shrink-0">
        {delta !== undefined && (
          <span className={`text-[10px] tabular-nums ${deltaColor}`}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(0)}
          </span>
        )}
        <span className={`text-[12px] font-medium tabular-nums ${priceColor}`}>€{price.toFixed(0)}</span>
      </div>
    </button>
  );
}

export default function TraderDashboard({
  prices,
  flows,
  outages,
  forecasts,
  onSelectCountry,
  onClose,
}: TraderDashboardProps) {
  // Top 5 highest prices
  const topPrices = useMemo(() => {
    return [...prices]
      .sort((a, b) => b.price - a.price)
      .slice(0, 5)
      .map((p) => ({
        iso2: p.iso2,
        name: p.country,
        price: p.price,
      }));
  }, [prices]);

  // Top 5 lowest prices
  const bottomPrices = useMemo(() => {
    return [...prices]
      .sort((a, b) => a.price - b.price)
      .slice(0, 5)
      .map((p) => ({
        iso2: p.iso2,
        name: p.country,
        price: p.price,
      }));
  }, [prices]);

  // Avg price
  const avgPrice = useMemo(() => {
    if (prices.length === 0) return 0;
    return prices.reduce((s, p) => s + p.price, 0) / prices.length;
  }, [prices]);

  // Most congested corridors
  const topCongested = useMemo(() => {
    return [...flows]
      .map((f) => ({
        ...f,
        util: f.capacityMW > 0 ? f.flowMW / f.capacityMW : 0,
      }))
      .filter((f) => f.util > 0.3)
      .sort((a, b) => b.util - a.util)
      .slice(0, 4);
  }, [flows]);

  // Top outages by MW
  const topOutages = useMemo(() => {
    return [...outages]
      .filter((o) => o.unavailableMW > 0)
      .sort((a, b) => b.unavailableMW - a.unavailableMW)
      .slice(0, 4);
  }, [outages]);

  // Biggest forecast misses
  const topForecastMisses = useMemo(() => {
    const entries: { name: string; iso2: string; source: string; mape: number; direction: string }[] = [];
    for (const f of forecasts) {
      if (f.wind.mape > 5) entries.push({ name: f.country, iso2: f.iso2, source: 'Wind', mape: f.wind.mape, direction: f.wind.surpriseDirection });
      if (f.solar.mape > 5) entries.push({ name: f.country, iso2: f.iso2, source: 'Solar', mape: f.solar.mape, direction: f.solar.surpriseDirection });
    }
    return entries.sort((a, b) => b.mape - a.mape).slice(0, 4);
  }, [forecasts]);

  const hasOutages = topOutages.length > 0;
  const hasForecasts = topForecastMisses.length > 0;
  const hasCongestion = topCongested.length > 0;

  return (
    <div
      className="absolute right-4 bg-[#0a0e17]/92 backdrop-blur-xl border border-white/[0.06] rounded-2xl shadow-2xl w-[300px] max-h-[calc(100vh-32px)] flex flex-col"
      style={{ top: 16, zIndex: 15, animation: 'slideInRight 0.2s ease-out' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0 border-b border-white/[0.04]">
        <div>
          <h3 className="text-sm font-bold text-white">Morning Brief</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            EU avg <span className="text-slate-400 font-medium">€{avgPrice.toFixed(0)}/MWh</span>
            {' · '}{prices.length} zones
          </p>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors text-sm">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto sidebar-scroll px-4 py-3 space-y-4">
        {/* Price extremes */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <SectionTitle>Most expensive</SectionTitle>
            {topPrices.map((p) => (
              <PriceRow
                key={p.iso2}
                name={p.name}
                price={p.price}
                delta={p.price - avgPrice}
                onClick={() => onSelectCountry(p.iso2)}
              />
            ))}
          </div>
          <div>
            <SectionTitle>Cheapest</SectionTitle>
            {bottomPrices.map((p) => (
              <PriceRow
                key={p.iso2}
                name={p.name}
                price={p.price}
                delta={p.price - avgPrice}
                onClick={() => onSelectCountry(p.iso2)}
              />
            ))}
          </div>
        </div>

        {/* Congestion */}
        {hasCongestion && (
          <div>
            <SectionTitle>Congested corridors</SectionTitle>
            {topCongested.map((f) => {
              const fromName = COUNTRY_CENTROIDS[f.from]?.name ?? f.from;
              const toName = COUNTRY_CENTROIDS[f.to]?.name ?? f.to;
              const pct = (f.util * 100).toFixed(0);
              return (
                <div
                  key={`${f.from}-${f.to}`}
                  className="flex items-center justify-between py-1.5 hover:bg-white/[0.03] rounded-lg px-1 cursor-pointer transition-colors"
                  onClick={() => {}}
                >
                  <span className="text-[11px] text-slate-400 truncate">{fromName} → {toName}</span>
                  <span className={`text-[11px] font-medium tabular-nums flex-shrink-0 ml-2 ${
                    f.util > 0.8 ? 'text-red-400' : f.util > 0.5 ? 'text-yellow-400' : 'text-emerald-400'
                  }`}>{pct}%</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Outages */}
        {hasOutages && (
          <div>
            <SectionTitle>Largest outages</SectionTitle>
            {topOutages.map((o) => (
              <div
                key={o.iso2}
                className="flex items-center justify-between py-1.5 hover:bg-white/[0.03] rounded-lg px-1 cursor-pointer transition-colors"
                onClick={() => onSelectCountry(o.iso2)}
              >
                <span className="text-[11px] text-slate-400 truncate">{o.country}</span>
                <span className="text-[11px] font-medium text-amber-400 tabular-nums flex-shrink-0 ml-2">
                  {o.unavailableMW.toLocaleString()} MW
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Forecast misses */}
        {hasForecasts && (
          <div>
            <SectionTitle>Forecast misses</SectionTitle>
            {topForecastMisses.map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-1.5 hover:bg-white/[0.03] rounded-lg px-1 cursor-pointer transition-colors"
                onClick={() => onSelectCountry(f.iso2)}
              >
                <span className="text-[11px] text-slate-400 truncate">{f.name} {f.source}</span>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                  <span className="text-[10px] text-slate-600">{f.direction === 'above' ? '▲' : f.direction === 'below' ? '▼' : '–'}</span>
                  <span className="text-[11px] font-medium text-orange-400 tabular-nums">{f.mape.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {!hasCongestion && !hasOutages && !hasForecasts && (
          <div className="py-2 text-center">
            <p className="text-[11px] text-slate-600">Enable Outage Radar and Forecast layers to see market intelligence here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
