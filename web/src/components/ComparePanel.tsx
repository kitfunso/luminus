'use client';

import { useMemo } from 'react';
import { FUEL_COLORS, FUEL_LABELS, normalizeFuel, getFuelColor } from '@/lib/colors';
import { COUNTRY_CENTROIDS } from '@/lib/countries';
import type { PowerPlant, CountryPrice, CrossBorderFlow } from '@/lib/data-fetcher';

const CO2_FACTORS_G: Record<string, number> = {
  nuclear: 0, wind: 0, solar: 0, gas: 400, coal: 900,
  lignite: 1100, hydro: 0, biomass: 230, oil: 650,
  geothermal: 0, other: 500,
};

function countryFlag(iso2: string): string {
  return [...iso2.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

interface ComparePanelProps {
  selectedCountries: string[];
  plants: PowerPlant[];
  prices: CountryPrice[];
  flows: CrossBorderFlow[];
  onRemoveCountry: (iso2: string) => void;
  onClose: () => void;
}

interface CountryStats {
  iso2: string;
  name: string;
  flag: string;
  price: number | null;
  hourly: number[];
  fuelMix: { fuel: string; capacity: number; pct: number }[];
  totalCapacity: number;
  carbonIntensity: number;
  netFlow: number;
  topPlants: PowerPlant[];
}

function computeStats(
  iso2: string,
  plants: PowerPlant[],
  prices: CountryPrice[],
  flows: CrossBorderFlow[]
): CountryStats {
  const name = COUNTRY_CENTROIDS[iso2]?.name || iso2;
  const flag = countryFlag(iso2);

  const priceData = prices.find((p) => p.iso2 === iso2);
  const price = priceData?.price ?? null;
  const hourly = priceData?.hourly ?? [];

  const countryPlants = plants.filter((p) => p.country === iso2);

  const fuelMap: Record<string, number> = {};
  for (const p of countryPlants) {
    const fuel = normalizeFuel(p.fuel);
    fuelMap[fuel] = (fuelMap[fuel] || 0) + p.capacity;
  }
  const totalCapacity = Object.values(fuelMap).reduce((s, v) => s + v, 0);
  const fuelMix = Object.entries(fuelMap)
    .sort((a, b) => b[1] - a[1])
    .map(([fuel, capacity]) => ({
      fuel,
      capacity,
      pct: totalCapacity > 0 ? (capacity / totalCapacity) * 100 : 0,
    }));

  let carbonIntensity = 0;
  if (totalCapacity > 0) {
    let weightedCO2 = 0;
    for (const [fuel, cap] of Object.entries(fuelMap)) {
      weightedCO2 += cap * (CO2_FACTORS_G[fuel] ?? 500);
    }
    carbonIntensity = weightedCO2 / totalCapacity;
  }

  let imports = 0;
  let exports = 0;
  for (const f of flows) {
    if (f.to === iso2) imports += f.flowMW;
    if (f.from === iso2) exports += f.flowMW;
  }
  const netFlow = imports - exports;

  const topPlants = [...countryPlants]
    .sort((a, b) => b.capacity - a.capacity)
    .slice(0, 3);

  return { iso2, name, flag, price, hourly, fuelMix, totalCapacity, carbonIntensity, netFlow, topPlants };
}

function MiniSparkline({ hourly }: { hourly: number[] }) {
  if (hourly.length === 0) {
    return <span className="text-[10px] text-slate-600">No hourly data</span>;
  }

  const min = Math.min(...hourly);
  const max = Math.max(...hourly);
  const range = max - min || 1;
  const w = 140;
  const h = 36;
  const pad = 2;

  const points = hourly
    .map((v, i) => {
      const x = pad + (i / (hourly.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const fillPoints = `${pad},${h - pad} ${points} ${w - pad},${h - pad}`;

  return (
    <div>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        preserveAspectRatio="none"
      >
        <polygon points={fillPoints} fill="rgba(56, 189, 248, 0.1)" />
        <polyline
          points={points}
          fill="none"
          stroke="rgb(56, 189, 248)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
        <span>&euro;{min.toFixed(0)}</span>
        <span>&euro;{max.toFixed(0)}</span>
      </div>
    </div>
  );
}

function FuelBar({ fuelMix }: { fuelMix: CountryStats['fuelMix'] }) {
  if (fuelMix.length === 0) return null;

  return (
    <div className="flex h-3 rounded-full overflow-hidden bg-slate-800/80">
      {fuelMix.map(({ fuel, pct }) => {
        const color = FUEL_COLORS[fuel] || FUEL_COLORS.other;
        return (
          <div
            key={fuel}
            style={{
              width: `${pct}%`,
              backgroundColor: `rgb(${color[0]},${color[1]},${color[2]})`,
              minWidth: pct > 0 ? '2px' : '0',
            }}
            title={`${FUEL_LABELS[fuel] || fuel}: ${pct.toFixed(1)}%`}
          />
        );
      })}
    </div>
  );
}

function CountryCard({
  stats,
  onRemove,
}: {
  stats: CountryStats;
  onRemove: () => void;
}) {
  return (
    <div className="compare-card">
      <button
        onClick={onRemove}
        className="absolute top-3 right-3 text-slate-600 hover:text-white transition-colors text-xs"
      >
        &#10005;
      </button>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{stats.flag}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white truncate">{stats.name}</h3>
          <p className="text-[11px] text-slate-400">
            {stats.price !== null
              ? `\u20AC${stats.price.toFixed(1)}/MWh`
              : 'Price N/A'}
          </p>
        </div>
      </div>

      <MiniSparkline hourly={stats.hourly} />

      <div className="mt-3">
        <h4 className="text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">
          Capacity Mix
        </h4>
        <FuelBar fuelMix={stats.fuelMix} />
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5">
          {stats.fuelMix.slice(0, 4).map(({ fuel, pct }) => {
            const color = FUEL_COLORS[fuel] || FUEL_COLORS.other;
            return (
              <span
                key={fuel}
                className="flex items-center gap-1 text-[10px] text-slate-400"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{
                    backgroundColor: `rgb(${color[0]},${color[1]},${color[2]})`,
                  }}
                />
                {FUEL_LABELS[fuel] || fuel} {pct.toFixed(0)}%
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-slate-500">CO&#x2082; Intensity</span>
          <span className="text-slate-300 font-medium tabular-nums">
            {stats.carbonIntensity.toFixed(0)} gCO&#x2082;/kWh
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-slate-500">Net Flow</span>
          <span
            className={`font-medium tabular-nums ${
              stats.netFlow >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {stats.netFlow >= 0 ? '+' : ''}
            {stats.netFlow.toLocaleString()} MW
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-slate-500">Total Capacity</span>
          <span className="text-slate-300 font-medium tabular-nums">
            {(stats.totalCapacity / 1000).toFixed(1)} GW
          </span>
        </div>
      </div>

      {stats.topPlants.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/[0.06]">
          <h4 className="text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">
            Top Plants
          </h4>
          {stats.topPlants.map((p) => {
            const color = getFuelColor(p.fuel);
            return (
              <div
                key={p.name}
                className="flex items-center gap-2 text-[11px] py-0.5"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: `rgb(${color[0]},${color[1]},${color[2]})`,
                  }}
                />
                <span className="text-slate-300 truncate flex-1">
                  {p.name}
                </span>
                <span className="text-slate-500 tabular-nums flex-shrink-0">
                  {p.capacity.toLocaleString()} MW
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ComparePanel({
  selectedCountries,
  plants,
  prices,
  flows,
  onRemoveCountry,
  onClose,
}: ComparePanelProps) {
  const countryStats = useMemo(
    () =>
      selectedCountries.map((iso) =>
        computeStats(iso, plants, prices, flows)
      ),
    [selectedCountries, plants, prices, flows]
  );

  return (
    <div className="compare-panel">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-white">
          Compare Countries
          <span className="text-slate-500 font-normal ml-2">
            {selectedCountries.length}/4
          </span>
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-[10px] text-slate-500 hover:text-red-400 transition-colors"
          >
            Clear All
          </button>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors text-sm"
          >
            &#10005;
          </button>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto sidebar-scroll pb-1">
        {countryStats.map((stats) => (
          <CountryCard
            key={stats.iso2}
            stats={stats}
            onRemove={() => onRemoveCountry(stats.iso2)}
          />
        ))}
      </div>
    </div>
  );
}
