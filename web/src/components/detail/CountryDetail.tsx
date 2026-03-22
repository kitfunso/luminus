'use client';

import { useMemo } from 'react';
import { COUNTRY_CENTROIDS } from '@/lib/countries';
import { normalizeFuel, FUEL_COLORS, FUEL_LABELS } from '@/lib/colors';
import type { CountryPrice, PowerPlant, CrossBorderFlow, CountryOutage } from '@/lib/data-fetcher';
import DetailHeader from './DetailHeader';
import KpiRow from './KpiRow';
import MiniChart from './MiniChart';

function countryFlag(iso2: string) {
  return [...iso2.toUpperCase()].map((c) =>
    String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)
  ).join('');
}

function priceColor(price: number): string {
  if (price < 0) return '#0d9488';
  if (price < 50) return '#4ade80';
  if (price <= 100) return '#facc15';
  return '#f87171';
}

interface CountryDetailProps {
  data: CountryPrice;
  plants: PowerPlant[];
  flows: CrossBorderFlow[];
  outages: CountryOutage[];
  onClose: () => void;
}

export default function CountryDetail({ data, plants, flows, outages, onClose }: CountryDetailProps) {
  const name = COUNTRY_CENTROIDS[data.iso2]?.name ?? data.country;
  const flag = countryFlag(data.iso2);
  const hourly = data.hourly ?? [];
  const min = hourly.length > 0 ? Math.min(...hourly) : data.price;
  const max = hourly.length > 0 ? Math.max(...hourly) : data.price;

  // Generation mix from plants
  const genMix = useMemo(() => {
    const countryPlants = plants.filter((p) => p.country === data.iso2);
    const byFuel: Record<string, number> = {};
    let total = 0;
    for (const p of countryPlants) {
      const f = normalizeFuel(p.fuel);
      byFuel[f] = (byFuel[f] ?? 0) + p.capacity;
      total += p.capacity;
    }
    const sorted = Object.entries(byFuel).sort((a, b) => b[1] - a[1]);
    return { sorted, total };
  }, [plants, data.iso2]);

  const dominantFuel = genMix.sorted[0];
  const dominantPct = dominantFuel && genMix.total > 0
    ? Math.round((dominantFuel[1] / genMix.total) * 100)
    : 0;

  // Related flows
  const relatedFlows = useMemo(
    () => flows.filter((f) => f.from === data.iso2 || f.to === data.iso2),
    [flows, data.iso2],
  );

  // Outages for this country
  const countryOutages = useMemo(
    () => outages.filter((o) => o.iso2 === data.iso2),
    [outages, data.iso2],
  );

  return (
    <>
      <DetailHeader
        icon={<span>{flag}</span>}
        title={name}
        subtitle="Day-Ahead Market"
        onClose={onClose}
      />

      <KpiRow kpis={[
        { label: 'Price', value: `\u20AC${data.price.toFixed(1)}`, color: priceColor(data.price), sublabel: '\u20AC/MWh' },
        { label: 'Range', value: `\u20AC${min.toFixed(0)}\u2013${max.toFixed(0)}`, sublabel: '\u20AC/MWh' },
        {
          label: 'Dominant',
          value: dominantFuel ? `${FUEL_LABELS[dominantFuel[0]] ?? dominantFuel[0]}` : 'N/A',
          sublabel: dominantFuel ? `${dominantPct}% of capacity` : undefined,
        },
      ]} />

      {/* 24h price profile */}
      {hourly.length > 1 && (
        <div className="mb-4">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">24h Price Profile</h3>
          <MiniChart data={hourly} labels={['00:00', '12:00', '23:00']} />
        </div>
      )}

      {/* Generation mix bar */}
      {genMix.sorted.length > 0 && (
        <div className="border-t border-white/[0.06] pt-3 mb-4">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Generation Mix</h3>
          <div className="flex h-3 rounded-full overflow-hidden gap-px">
            {genMix.sorted.map(([fuel, cap]) => {
              const c = FUEL_COLORS[fuel] ?? FUEL_COLORS.other;
              return (
                <div
                  key={fuel}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{
                    width: `${(cap / genMix.total * 100).toFixed(1)}%`,
                    backgroundColor: `rgb(${c[0]},${c[1]},${c[2]})`,
                  }}
                  title={`${FUEL_LABELS[fuel] ?? fuel}: ${Math.round(cap)} MW`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {genMix.sorted.slice(0, 5).map(([fuel, cap]) => {
              const c = FUEL_COLORS[fuel] ?? FUEL_COLORS.other;
              return (
                <span key={fuel} className="flex items-center gap-1 text-[10px] text-slate-400">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: `rgb(${c[0]},${c[1]},${c[2]})` }} />
                  {FUEL_LABELS[fuel] ?? fuel} {Math.round((cap / genMix.total) * 100)}%
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Related flows */}
      {relatedFlows.length > 0 && (
        <div className="border-t border-white/[0.06] pt-3 mb-4">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Cross-Border Flows</h3>
          <ul className="space-y-1">
            {relatedFlows.map((f) => {
              const isExport = f.from === data.iso2;
              const other = isExport ? f.to : f.from;
              const otherName = COUNTRY_CENTROIDS[other]?.name ?? other;
              return (
                <li key={`${f.from}-${f.to}`} className="flex justify-between text-[11px]">
                  <span className="text-slate-400">
                    {isExport ? '\u2192' : '\u2190'} {countryFlag(other)} {otherName}
                  </span>
                  <span className="text-slate-300 font-medium tabular-nums">
                    {f.flowMW.toLocaleString()} MW
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Outage context */}
      {countryOutages.length > 0 && (
        <div className="border-t border-white/[0.06] pt-3">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Outage Context</h3>
          {countryOutages.map((o) => (
            <div key={o.iso2} className="flex justify-between text-[11px] py-1">
              <span className="text-slate-400">{o.outageCount} outages</span>
              <span className="text-red-400 tabular-nums">{o.unavailableMW.toLocaleString()} MW offline</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
