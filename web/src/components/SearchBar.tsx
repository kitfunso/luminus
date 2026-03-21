'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COUNTRY_CENTROIDS } from '@/lib/countries';
import type { PowerPlant, CountryPrice, CrossBorderFlow } from '@/lib/data-fetcher';
import { FUEL_LABELS, normalizeFuel } from '@/lib/colors';
import { pinItem, isWatched, unpinItem, plantId, countryId, corridorId } from '@/lib/watchlist';

export type SearchResult =
  | { kind: 'plant'; plant: PowerPlant }
  | { kind: 'country'; iso2: string; name: string; price?: number }
  | { kind: 'corridor'; from: string; to: string; fromName: string; toName: string; flowMW: number; capacityMW: number };

interface SearchBarProps {
  plants: PowerPlant[];
  prices: CountryPrice[];
  flows: CrossBorderFlow[];
  onSelectPlant: (plant: PowerPlant) => void;
  onSelectCountry: (iso2: string) => void;
  onSelectCorridor: (from: string, to: string) => void;
  /** Called when watchlist changes so callers can re-render. */
  onWatchlistChange?: () => void;
}

const MAX_RESULTS = 10;

function scoreMatch(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;
  // token match
  const tokens = q.split(/\s+/);
  const matchedTokens = tokens.filter((tok) => t.includes(tok));
  if (matchedTokens.length === tokens.length) return 40;
  if (matchedTokens.length > 0) return 20;
  return 0;
}

export default function SearchBar({
  plants,
  prices,
  flows,
  onSelectPlant,
  onSelectCountry,
  onSelectCorridor,
  onWatchlistChange,
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [, forceUpdate] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const priceLookup = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of prices) m.set(p.iso2, p.price);
    return m;
  }, [prices]);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim();
    if (!q) return [];

    const scored: { result: SearchResult; score: number }[] = [];

    // Plants
    for (const plant of plants) {
      const s = Math.max(
        scoreMatch(q, plant.name),
        scoreMatch(q, normalizeFuel(plant.fuel)),
        scoreMatch(q, COUNTRY_CENTROIDS[plant.country]?.name ?? plant.country)
      );
      if (s > 0) scored.push({ result: { kind: 'plant', plant }, score: s + 1 }); // +1 plants slightly preferred for exact
    }

    // Countries
    for (const [iso2, { name }] of Object.entries(COUNTRY_CENTROIDS)) {
      const s = Math.max(scoreMatch(q, name), scoreMatch(q, iso2));
      if (s > 0) {
        scored.push({
          result: { kind: 'country', iso2, name, price: priceLookup.get(iso2) },
          score: s + 5, // countries slightly preferred (fewer results)
        });
      }
    }

    // Corridors (flows)
    for (const flow of flows) {
      const fromName = COUNTRY_CENTROIDS[flow.from]?.name ?? flow.from;
      const toName = COUNTRY_CENTROIDS[flow.to]?.name ?? flow.to;
      const label = `${fromName} → ${toName}`;
      const s = Math.max(
        scoreMatch(q, label),
        scoreMatch(q, fromName),
        scoreMatch(q, toName)
      );
      if (s > 0) {
        scored.push({
          result: { kind: 'corridor', from: flow.from, to: flow.to, fromName, toName, flowMW: flow.flowMW, capacityMW: flow.capacityMW },
          score: s,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_RESULTS).map((s) => s.result);
  }, [query, plants, priceLookup, flows]);

  // Keyboard nav
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(results[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  }, [open, results, activeIdx]);

  function handleSelect(result: SearchResult) {
    setQuery('');
    setOpen(false);
    if (result.kind === 'plant') onSelectPlant(result.plant);
    else if (result.kind === 'country') onSelectCountry(result.iso2);
    else onSelectCorridor(result.from, result.to);
  }

  function handleToggleWatch(e: React.MouseEvent, result: SearchResult) {
    e.stopPropagation();
    if (result.kind === 'plant') {
      const id = plantId(result.plant.name);
      if (isWatched(id)) unpinItem(id);
      else pinItem({ id, type: 'plant', label: result.plant.name, subLabel: FUEL_LABELS[normalizeFuel(result.plant.fuel)] || result.plant.fuel, iso2: result.plant.country });
    } else if (result.kind === 'country') {
      const id = countryId(result.iso2);
      if (isWatched(id)) unpinItem(id);
      else pinItem({ id, type: 'country', label: result.name, iso2: result.iso2 });
    } else {
      const id = corridorId(result.from, result.to);
      if (isWatched(id)) unpinItem(id);
      else pinItem({ id, type: 'corridor', label: `${result.fromName} → ${result.toName}`, from: result.from, to: result.to });
    }
    forceUpdate((n) => n + 1);
    onWatchlistChange?.();
  }

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Reset active index when results change
  useEffect(() => setActiveIdx(0), [results]);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <svg className="absolute left-3 text-slate-500 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { if (query.trim()) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder="Search plants, countries, corridors…"
          className="w-full pl-8 pr-3 py-2 rounded-xl bg-black/40 border border-white/[0.07] text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500/40 focus:bg-black/60 transition-all"
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false); }} className="absolute right-2.5 text-slate-600 hover:text-slate-400 text-sm">✕</button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-30 bg-[#0d1117]/95 backdrop-blur-xl border border-white/[0.07] rounded-xl shadow-2xl overflow-hidden">
          {results.map((result, idx) => {
            const active = idx === activeIdx;
            let watched = false;
            let icon = '';
            let title = '';
            let subtitle = '';

            if (result.kind === 'plant') {
              watched = isWatched(plantId(result.plant.name));
              icon = '⚡';
              title = result.plant.name;
              subtitle = `${FUEL_LABELS[normalizeFuel(result.plant.fuel)] || result.plant.fuel} · ${(result.plant.capacity / 1000).toFixed(1)} GW · ${COUNTRY_CENTROIDS[result.plant.country]?.name ?? result.plant.country}`;
            } else if (result.kind === 'country') {
              watched = isWatched(countryId(result.iso2));
              icon = '🏳';
              title = result.name;
              subtitle = result.price !== undefined ? `€${result.price.toFixed(0)}/MWh` : result.iso2;
            } else {
              watched = isWatched(corridorId(result.from, result.to));
              icon = '⇄';
              title = `${result.fromName} → ${result.toName}`;
              const util = result.capacityMW > 0 ? ((result.flowMW / result.capacityMW) * 100).toFixed(0) : '?';
              subtitle = `${result.flowMW.toLocaleString()} MW · ${util}% utilisation`;
            }

            return (
              <div
                key={idx}
                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => handleSelect(result)}
              >
                <span className="text-base flex-shrink-0 w-5 text-center">{icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-200 truncate">{title}</div>
                  <div className="text-[11px] text-slate-500 truncate">{subtitle}</div>
                </div>
                <button
                  onClick={(e) => handleToggleWatch(e, result)}
                  title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
                  className={`flex-shrink-0 text-sm transition-colors ${watched ? 'text-sky-400 hover:text-sky-300' : 'text-slate-700 hover:text-slate-400'}`}
                >
                  {watched ? '★' : '☆'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
