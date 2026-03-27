'use client';

import { useMemo, useState } from 'react';
import type { CountryPrice, CrossBorderFlow } from '@/lib/data-fetcher';
import {
  computeSpreadPairs,
  topCongestionRents,
  computeDirectionalSignals,
  type SpreadPair,
  type DirectionalSignal,
} from '@/lib/spread-analytics';

type SortMode = 'spread' | 'congestion' | 'volatility';
type Tab = 'spreads' | 'momentum' | 'congestion';

interface SpreadMatrixProps {
  prices: CountryPrice[];
  flows: CrossBorderFlow[];
  onSelectCorridor: (from: string, to: string) => void;
  embedded?: boolean;
}

function spreadColor(spread: number): string {
  const abs = Math.abs(spread);
  if (abs < 5) return 'text-slate-500';
  if (spread > 0) return abs > 20 ? 'text-emerald-300' : 'text-emerald-400/80';
  return abs > 20 ? 'text-red-300' : 'text-red-400/80';
}

function momentumIcon(dir: DirectionalSignal['priceMomentum']): string {
  if (dir === 'rising') return '\u25B2';
  if (dir === 'falling') return '\u25BC';
  return '\u25CF';
}

function momentumColor(dir: DirectionalSignal['priceMomentum']): string {
  if (dir === 'rising') return 'text-red-400';
  if (dir === 'falling') return 'text-emerald-400';
  return 'text-slate-500';
}

function directionArrow(dir: SpreadPair['spreadDirection']): string {
  if (dir === 'widening') return '\u2197';
  if (dir === 'narrowing') return '\u2198';
  return '\u2192';
}

function SpreadRow({ pair, onClick }: { pair: SpreadPair; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
    >
      <div className="min-w-0 flex-1">
        <span className="text-[11px] text-slate-300">
          {pair.fromName} <span className="text-slate-600">{'\u2192'}</span> {pair.toName}
        </span>
      </div>
      <span className={`w-16 text-right text-[11px] font-medium tabular-nums ${spreadColor(pair.spread)}`}>
        {pair.spread >= 0 ? '+' : ''}{pair.spread}
      </span>
      <span className="w-10 text-right text-[10px] tabular-nums text-slate-500">
        {pair.utilization}%
      </span>
      <span className="w-5 text-center text-[10px] text-slate-600">
        {directionArrow(pair.spreadDirection)}
      </span>
    </button>
  );
}

function CongestionRow({ pair, onClick }: { pair: SpreadPair; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
    >
      <div className="min-w-0 flex-1">
        <span className="text-[11px] text-slate-300">
          {pair.fromName} <span className="text-slate-600">{'\u2194'}</span> {pair.toName}
        </span>
      </div>
      <span className="w-20 text-right text-[11px] font-medium tabular-nums text-amber-400/80">
        {pair.currency}{(pair.congestionRent / 1000).toFixed(0)}k/h
      </span>
      <span className="w-12 text-right text-[10px] tabular-nums text-slate-500">
        {pair.flowMW.toLocaleString()} MW
      </span>
    </button>
  );
}

function MomentumRow({ signal }: { signal: DirectionalSignal }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <span className={`w-4 text-center text-[11px] ${momentumColor(signal.priceMomentum)}`}>
        {momentumIcon(signal.priceMomentum)}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-[11px] text-slate-300">{signal.name}</span>
      </div>
      <span className="w-14 text-right text-[11px] font-medium tabular-nums text-slate-300">
        {signal.currentPrice.toFixed(1)}
      </span>
      <span className={`w-14 text-right text-[10px] font-medium tabular-nums ${
        signal.priceChange4h > 0 ? 'text-red-400' : signal.priceChange4h < 0 ? 'text-emerald-400' : 'text-slate-500'
      }`}>
        {signal.priceChange4h > 0 ? '+' : ''}{signal.priceChange4h}
      </span>
    </div>
  );
}

export default function SpreadMatrix({ prices, flows, onSelectCorridor, embedded }: SpreadMatrixProps) {
  const [activeTab, setActiveTab] = useState<Tab>('spreads');
  const [sortMode, setSortMode] = useState<SortMode>('spread');

  const pairs = useMemo(() => computeSpreadPairs(prices, flows), [prices, flows]);
  const topRents = useMemo(() => topCongestionRents(pairs, 10), [pairs]);
  const momentum = useMemo(() => {
    const signals = computeDirectionalSignals(prices);
    return [...signals].sort((a, b) => b.momentumStrength - a.momentumStrength);
  }, [prices]);

  const sortedPairs = useMemo(() => {
    const sorted = [...pairs];
    if (sortMode === 'spread') sorted.sort((a, b) => b.absSpread - a.absSpread);
    else if (sortMode === 'congestion') sorted.sort((a, b) => b.congestionRent - a.congestionRent);
    else sorted.sort((a, b) => b.spreadVol - a.spreadVol);
    return sorted.slice(0, 12);
  }, [pairs, sortMode]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'spreads', label: 'Spreads' },
    { key: 'momentum', label: 'Momentum' },
    { key: 'congestion', label: 'Congestion' },
  ];

  return (
    <div className={embedded ? '' : 'p-3'}>
      <div className="mb-3 flex items-center gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-3 py-1 text-[10px] font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-white/[0.08] text-white'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'spreads' && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">
              Top Price Differentials
            </span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-400 outline-none"
            >
              <option value="spread">By Spread</option>
              <option value="volatility">By Volatility</option>
              <option value="congestion">By Rent</option>
            </select>
          </div>
          <div className="mb-1 flex items-center gap-2 px-2 text-[9px] uppercase tracking-wider text-slate-600">
            <span className="flex-1">Corridor</span>
            <span className="w-16 text-right">Spread</span>
            <span className="w-10 text-right">Util</span>
            <span className="w-5 text-center">Trend</span>
          </div>
          <div className="space-y-0.5">
            {sortedPairs.map((pair) => (
              <SpreadRow
                key={`${pair.from}-${pair.to}`}
                pair={pair}
                onClick={() => onSelectCorridor(pair.from, pair.to)}
              />
            ))}
          </div>
        </>
      )}

      {activeTab === 'momentum' && (
        <>
          <div className="mb-2">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">
              Price Momentum (4h slope)
            </span>
          </div>
          <div className="mb-1 flex items-center gap-2 px-2 text-[9px] uppercase tracking-wider text-slate-600">
            <span className="w-4" />
            <span className="flex-1">Country</span>
            <span className="w-14 text-right">Price</span>
            <span className="w-14 text-right">4h chg</span>
          </div>
          <div className="space-y-0.5">
            {momentum.slice(0, 15).map((signal) => (
              <MomentumRow key={signal.iso2} signal={signal} />
            ))}
          </div>
        </>
      )}

      {activeTab === 'congestion' && (
        <>
          <div className="mb-2">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">
              Estimated Congestion Rent
            </span>
          </div>
          <div className="mb-1 flex items-center gap-2 px-2 text-[9px] uppercase tracking-wider text-slate-600">
            <span className="flex-1">Corridor</span>
            <span className="w-20 text-right">Rent</span>
            <span className="w-12 text-right">Flow</span>
          </div>
          <div className="space-y-0.5">
            {topRents.map((pair) => (
              <CongestionRow
                key={`${pair.from}-${pair.to}`}
                pair={pair}
                onClick={() => onSelectCorridor(pair.from, pair.to)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
