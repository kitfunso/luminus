'use client';

import { useMemo } from 'react';
import type { CountryPrice, CrossBorderFlow, PriceHistory } from '@/lib/data-fetcher';
import { COUNTRY_CENTROIDS } from '@/lib/countries';

export type TimeSeriesAsset =
  | { kind: 'country'; iso2: string }
  | { kind: 'corridor'; from: string; to: string };

interface AssetTimeSeriesProps {
  asset: TimeSeriesAsset;
  prices: CountryPrice[];
  flows: CrossBorderFlow[];
  history: PriceHistory | null;
  onClose: () => void;
}

function Sparkline({ values, color, label, unit }: { values: number[]; color: string; label: string; unit: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const h = 64;
  const w = 280;
  const pad = 4;

  const points = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');
  const fillPoints = `${pad},${h - pad} ${points} ${w - pad},${h - pad}`;

  const last = values[values.length - 1];
  const first = values[0];
  const delta = last - first;
  const pctChange = first !== 0 ? ((delta / Math.abs(first)) * 100).toFixed(1) : '0.0';
  const deltaColor = delta > 0 ? '#f87171' : delta < 0 ? '#4ade80' : '#94a3b8';

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] text-slate-500">{label}</span>
        <span className="text-[11px] tabular-nums" style={{ color: deltaColor }}>
          {delta >= 0 ? '+' : ''}{pctChange}%
        </span>
      </div>
      <svg width={w} height={h} className="w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <polygon points={fillPoints} fill={`${color}18`} />
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Last point dot */}
        {(() => {
          const last_x = w - pad;
          const last_y = h - pad - ((values[values.length - 1] - min) / range) * (h - pad * 2);
          return <circle cx={last_x} cy={last_y} r="2.5" fill={color} />;
        })()}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-700 mt-0.5">
        <span>{min.toFixed(0)} {unit}</span>
        <span className="text-slate-500">{last.toFixed(0)} {unit}</span>
        <span>{max.toFixed(0)} {unit}</span>
      </div>
    </div>
  );
}

export default function AssetTimeSeries({ asset, prices, flows, history, onClose }: AssetTimeSeriesProps) {
  const title = useMemo(() => {
    if (asset.kind === 'country') {
      return COUNTRY_CENTROIDS[asset.iso2]?.name ?? asset.iso2;
    }
    const fromName = COUNTRY_CENTROIDS[asset.from]?.name ?? asset.from;
    const toName = COUNTRY_CENTROIDS[asset.to]?.name ?? asset.to;
    return `${fromName} → ${toName}`;
  }, [asset]);

  // 24h price series for country
  const priceEntry = useMemo(() => {
    if (asset.kind !== 'country') return null;
    return prices.find((p) => p.iso2 === asset.iso2) ?? null;
  }, [asset, prices]);

  // 7d history for country (from history.json)
  const historyValues = useMemo(() => {
    if (asset.kind !== 'country' || !history) return null;
    const entry = history.countries.find((c) => c.iso2 === asset.iso2);
    if (!entry) return null;
    // history.hourly is days*24 hours; return last 7d = 168h
    return entry.hourly.slice(-168);
  }, [asset, history]);

  // Corridor flow: just the 24h contextual series (synthesised from current MW)
  const flowEntry = useMemo(() => {
    if (asset.kind !== 'corridor') return null;
    return flows.find(
      (f) =>
        (f.from === asset.from && f.to === asset.to) ||
        (f.from === asset.to && f.to === asset.from)
    ) ?? null;
  }, [asset, flows]);

  const subtitle = useMemo(() => {
    if (asset.kind === 'country' && priceEntry) {
      return `Day-ahead price · avg €${priceEntry.price.toFixed(0)}/MWh`;
    }
    if (asset.kind === 'corridor' && flowEntry) {
      const util = flowEntry.capacityMW > 0 ? ((flowEntry.flowMW / flowEntry.capacityMW) * 100).toFixed(0) : '?';
      return `Flow ${flowEntry.flowMW.toLocaleString()} MW · ${util}% utilisation`;
    }
    return '';
  }, [asset, priceEntry, flowEntry]);

  return (
    <div
      className="absolute right-4 bg-[#0a0e17]/92 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 shadow-2xl w-[300px] max-h-[calc(100vh-32px)] overflow-y-auto sidebar-scroll"
      style={{ top: 16, zIndex: 15, animation: 'slideInRight 0.2s ease-out' }}
    >
      <button
        onClick={onClose}
        className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors text-sm"
      >
        ✕
      </button>

      <div className="mb-3 pr-4">
        <h3 className="text-sm font-bold text-white leading-tight">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
      </div>

      <div className="space-y-4">
        {/* 24h price sparkline for country */}
        {asset.kind === 'country' && priceEntry?.hourly && (
          <Sparkline
            values={priceEntry.hourly}
            color="rgb(56,189,248)"
            label="24h day-ahead price"
            unit="€/MWh"
          />
        )}

        {/* 7d price history for country */}
        {asset.kind === 'country' && historyValues && historyValues.length > 1 && (
          <Sparkline
            values={historyValues}
            color="rgb(167,139,250)"
            label="7d price history"
            unit="€/MWh"
          />
        )}

        {/* No history available message */}
        {asset.kind === 'country' && !priceEntry?.hourly && !historyValues && (
          <p className="text-[11px] text-slate-600 py-2 text-center">No time-series data available for this country.</p>
        )}

        {/* Corridor: utilisation bar + flow numbers */}
        {asset.kind === 'corridor' && flowEntry && (
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-[11px] mb-1.5">
                <span className="text-slate-500">Utilisation</span>
                <span className={`font-medium tabular-nums ${
                  flowEntry.capacityMW > 0 && (flowEntry.flowMW / flowEntry.capacityMW) > 0.8
                    ? 'text-red-400'
                    : flowEntry.capacityMW > 0 && (flowEntry.flowMW / flowEntry.capacityMW) > 0.5
                    ? 'text-yellow-400'
                    : 'text-emerald-400'
                }`}>
                  {flowEntry.capacityMW > 0 ? `${((flowEntry.flowMW / flowEntry.capacityMW) * 100).toFixed(0)}%` : 'N/A'}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-800/80 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: flowEntry.capacityMW > 0 ? `${Math.min(100, (flowEntry.flowMW / flowEntry.capacityMW) * 100).toFixed(0)}%` : '0%',
                    backgroundColor: flowEntry.capacityMW > 0 && (flowEntry.flowMW / flowEntry.capacityMW) > 0.8
                      ? 'rgb(248,113,113)'
                      : flowEntry.capacityMW > 0 && (flowEntry.flowMW / flowEntry.capacityMW) > 0.5
                      ? 'rgb(250,204,21)'
                      : 'rgb(74,222,128)',
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <div className="text-[11px] font-medium text-sky-400 tabular-nums">{flowEntry.flowMW.toLocaleString()} MW</div>
                <div className="text-[10px] text-slate-600">Current flow</div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-300 tabular-nums">{flowEntry.capacityMW.toLocaleString()} MW</div>
                <div className="text-[10px] text-slate-600">Total capacity</div>
              </div>
            </div>
            <p className="text-[10px] text-slate-700 pt-1">
              Historical corridor time-series pending data source integration.
            </p>
          </div>
        )}

        {asset.kind === 'corridor' && !flowEntry && (
          <p className="text-[11px] text-slate-600 py-2 text-center">No flow data available for this corridor.</p>
        )}
      </div>
    </div>
  );
}
