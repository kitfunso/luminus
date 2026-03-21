'use client';

import { useEffect, useState } from 'react';
import { getWatchlist, unpinItem, type WatchlistItem } from '@/lib/watchlist';
import { COUNTRY_CENTROIDS } from '@/lib/countries';
import type { CountryPrice, CrossBorderFlow } from '@/lib/data-fetcher';

interface WatchlistPanelProps {
  prices: CountryPrice[];
  flows: CrossBorderFlow[];
  onSelectCountry: (iso2: string) => void;
  onSelectCorridor: (from: string, to: string) => void;
  /** Increment this from parent to force a re-read of localStorage */
  version: number;
}

function priceForCountry(prices: CountryPrice[], iso2: string): number | undefined {
  return prices.find((p) => p.iso2 === iso2)?.price;
}

function flowForCorridor(flows: CrossBorderFlow[], from: string, to: string): CrossBorderFlow | undefined {
  return flows.find(
    (f) =>
      (f.from === from && f.to === to) ||
      (f.from === to && f.to === from)
  );
}

function ItemRow({
  item,
  prices,
  flows,
  onSelect,
  onUnpin,
}: {
  item: WatchlistItem;
  prices: CountryPrice[];
  flows: CrossBorderFlow[];
  onSelect: () => void;
  onUnpin: () => void;
}) {
  let valueStr = '';
  let valueColor = 'text-slate-400';

  if (item.type === 'country' && item.iso2) {
    const price = priceForCountry(prices, item.iso2);
    if (price !== undefined) {
      valueStr = `€${price.toFixed(0)}/MWh`;
      valueColor = price > 100 ? 'text-red-400' : price > 60 ? 'text-yellow-400' : 'text-emerald-400';
    }
  } else if (item.type === 'corridor' && item.from && item.to) {
    const flow = flowForCorridor(flows, item.from, item.to);
    if (flow) {
      const util = flow.capacityMW > 0 ? (flow.flowMW / flow.capacityMW) * 100 : 0;
      valueStr = `${util.toFixed(0)}% util`;
      valueColor = util > 80 ? 'text-red-400' : util > 50 ? 'text-yellow-400' : 'text-emerald-400';
    }
  }

  const typeIcon = item.type === 'plant' ? '⚡' : item.type === 'country' ? '🏳' : '⇄';

  return (
    <div
      onClick={onSelect}
      className="flex items-center gap-2 py-1.5 px-1 rounded-lg cursor-pointer hover:bg-white/[0.03] group transition-colors"
    >
      <span className="text-sm flex-shrink-0 w-5 text-center">{typeIcon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-slate-300 truncate leading-tight">{item.label}</div>
        {item.subLabel && (
          <div className="text-[10px] text-slate-600 truncate">{item.subLabel}</div>
        )}
      </div>
      {valueStr && (
        <span className={`text-[11px] font-medium tabular-nums flex-shrink-0 ${valueColor}`}>{valueStr}</span>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onUnpin(); }}
        className="flex-shrink-0 text-[10px] text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
        title="Remove"
      >
        ✕
      </button>
    </div>
  );
}

export default function WatchlistPanel({ prices, flows, onSelectCountry, onSelectCorridor, version }: WatchlistPanelProps) {
  const [items, setItems] = useState<WatchlistItem[]>([]);

  useEffect(() => {
    setItems(getWatchlist());
  }, [version]);

  function handleUnpin(id: string) {
    setItems(unpinItem(id));
  }

  function handleSelect(item: WatchlistItem) {
    if (item.type === 'country' && item.iso2) {
      onSelectCountry(item.iso2);
    } else if (item.type === 'corridor' && item.from && item.to) {
      onSelectCorridor(item.from, item.to);
    }
    // plant selection is handled by parent via map click — watchlist is navigation aid
  }

  if (items.length === 0) {
    return (
      <div className="py-3 text-center">
        <p className="text-[11px] text-slate-600">No watched assets.</p>
        <p className="text-[10px] text-slate-700 mt-0.5">Search and ★ to add.</p>
      </div>
    );
  }

  const countries = items.filter((i) => i.type === 'country');
  const plants = items.filter((i) => i.type === 'plant');
  const corridors = items.filter((i) => i.type === 'corridor');

  const groups: { label: string; items: WatchlistItem[] }[] = [];
  if (countries.length > 0) groups.push({ label: 'Countries', items: countries });
  if (plants.length > 0) groups.push({ label: 'Plants', items: plants });
  if (corridors.length > 0) groups.push({ label: 'Corridors', items: corridors });

  return (
    <div className="space-y-2">
      {groups.map(({ label, items: groupItems }) => (
        <div key={label}>
          <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1 px-1">{label}</div>
          {groupItems.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              prices={prices}
              flows={flows}
              onSelect={() => handleSelect(item)}
              onUnpin={() => handleUnpin(item.id)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
