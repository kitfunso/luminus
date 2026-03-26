'use client';

import React, { useMemo } from 'react';
import InteractiveTimeSeriesChart from './charts/InteractiveTimeSeriesChart';
import type { ExpandedSeriesConfig } from './charts/ExpandedSeriesPanel';
import { FUEL_COLORS, FUEL_LABELS, normalizeFuel, getFuelColor } from '@/lib/colors';
import { COUNTRY_CENTROIDS } from '@/lib/countries';
import type { PowerPlant, CountryPrice, CrossBorderFlow } from '@/lib/data-fetcher';
import {
  formatPriceWithUnit,
  formatPriceValue,
  getPriceUnitLabel,
  MIXED_PRICE_UNIT_LABEL,
} from '@/lib/price-format';
import { resolvePriceTimestamps } from '@/lib/series-timestamps';

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
  onExpandSeries?: (config: ExpandedSeriesConfig) => void;
}

interface CountryStats {
  iso2: string;
  name: string;
  flag: string;
  price: number | null;
  hourly: number[];
  hourlyTimestampsUtc?: string[];
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
  flows: CrossBorderFlow[],
): CountryStats {
  const name = COUNTRY_CENTROIDS[iso2]?.name || iso2;
  const flag = countryFlag(iso2);

  const priceData = prices.find((entry) => entry.iso2 === iso2);
  const price = priceData?.price ?? null;
  const hourly = priceData?.hourly ?? [];
  const hourlyTimestampsUtc = priceData ? resolvePriceTimestamps(priceData) : undefined;

  const countryPlants = plants.filter((plant) => plant.country === iso2);

  const fuelMap: Record<string, number> = {};
  for (const plant of countryPlants) {
    const fuel = normalizeFuel(plant.fuel);
    fuelMap[fuel] = (fuelMap[fuel] || 0) + plant.capacity;
  }
  const totalCapacity = Object.values(fuelMap).reduce((sum, value) => sum + value, 0);
  const fuelMix = Object.entries(fuelMap)
    .sort((left, right) => right[1] - left[1])
    .map(([fuel, capacity]) => ({
      fuel,
      capacity,
      pct: totalCapacity > 0 ? (capacity / totalCapacity) * 100 : 0,
    }));

  let carbonIntensity = 0;
  if (totalCapacity > 0) {
    let weightedCO2 = 0;
    for (const [fuel, capacity] of Object.entries(fuelMap)) {
      weightedCO2 += capacity * (CO2_FACTORS_G[fuel] ?? 500);
    }
    carbonIntensity = weightedCO2 / totalCapacity;
  }

  let imports = 0;
  let exports = 0;
  for (const flow of flows) {
    if (flow.to === iso2) imports += flow.flowMW;
    if (flow.from === iso2) exports += flow.flowMW;
  }
  const netFlow = imports - exports;

  const topPlants = [...countryPlants]
    .sort((left, right) => right.capacity - left.capacity)
    .slice(0, 3);

  return {
    iso2,
    name,
    flag,
    price,
    hourly,
    hourlyTimestampsUtc,
    fuelMix,
    totalCapacity,
    carbonIntensity,
    netFlow,
    topPlants,
  };
}

function FuelBar({ fuelMix }: { fuelMix: CountryStats['fuelMix'] }) {
  if (fuelMix.length === 0) return null;

  return (
    <div className="flex h-3 overflow-hidden rounded-full bg-slate-800/80">
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
  comparisonSeries,
  onRemove,
  onExpandSeries,
}: {
  stats: CountryStats;
  comparisonSeries: ExpandedSeriesConfig['series'];
  onRemove: () => void;
  onExpandSeries?: (config: ExpandedSeriesConfig) => void;
}) {
  const baseSeries = stats.hourly.length > 1
    ? [
        {
          id: `${stats.iso2}-price`,
          label: `${stats.name} price`,
          values: stats.hourly,
          color: '#38bdf8',
          formatValue: (value: number) => formatPriceValue(value, stats.iso2),
        },
      ]
    : [];
  const candidates = comparisonSeries.filter((series) => series.id !== `${stats.iso2}-price`);

  return (
    <div className="compare-card">
      <button
        onClick={onRemove}
        className="absolute right-3 top-3 text-xs text-slate-600 transition-colors hover:text-white"
      >
        &#10005;
      </button>

      <div className="mb-3 flex items-center gap-2">
        <span className="text-xl">{stats.flag}</span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-white">{stats.name}</h3>
          <p className="text-[11px] text-slate-400">
            {stats.price !== null
              ? formatPriceWithUnit(stats.price, stats.iso2)
              : 'Price N/A'}
          </p>
        </div>
      </div>

      {baseSeries.length > 0 ? (
        <InteractiveTimeSeriesChart
          title="24h price"
          subtitle="Published day-ahead schedule for the next delivery hours"
          unitLabel={getPriceUnitLabel(stats.iso2)}
          timestampsUtc={stats.hourlyTimestampsUtc}
          series={baseSeries}
          height={88}
          onExpand={onExpandSeries
            ? () => onExpandSeries({
                title: `${stats.name} comparison`,
                unitLabel: MIXED_PRICE_UNIT_LABEL,
                timestampsUtc: stats.hourlyTimestampsUtc,
                series: baseSeries,
                candidates,
              })
            : undefined}
        />
      ) : (
        <span className="text-[10px] text-slate-600">No hourly data</span>
      )}

      <div className="mt-3">
        <h4 className="mb-1.5 text-[10px] uppercase tracking-widest text-slate-500">
          Capacity Mix
        </h4>
        <FuelBar fuelMix={stats.fuelMix} />
        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
          {stats.fuelMix.slice(0, 4).map(({ fuel, pct }) => {
            const color = FUEL_COLORS[fuel] || FUEL_COLORS.other;
            return (
              <span
                key={fuel}
                className="flex items-center gap-1 text-[10px] text-slate-400"
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
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

      <div className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3">
        <div className="flex justify-between text-[11px]">
          <span className="text-slate-500">CO2 Intensity</span>
          <span className="font-medium tabular-nums text-slate-300">
            {stats.carbonIntensity.toFixed(0)} gCO2/kWh
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
          <span className="font-medium tabular-nums text-slate-300">
            {(stats.totalCapacity / 1000).toFixed(1)} GW
          </span>
        </div>
      </div>

      {stats.topPlants.length > 0 && (
        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <h4 className="mb-1.5 text-[10px] uppercase tracking-widest text-slate-500">
            Top Plants
          </h4>
          {stats.topPlants.map((plant) => {
            const color = getFuelColor(plant.fuel);
            return (
              <div
                key={plant.name}
                className="flex items-center gap-2 py-0.5 text-[11px]"
              >
                <span
                  className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{
                    backgroundColor: `rgb(${color[0]},${color[1]},${color[2]})`,
                  }}
                />
                <span className="flex-1 truncate text-slate-300">
                  {plant.name}
                </span>
                <span className="flex-shrink-0 tabular-nums text-slate-500">
                  {plant.capacity.toLocaleString()} MW
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
  onExpandSeries,
}: ComparePanelProps) {
  const countryStats = useMemo(
    () => selectedCountries.map((iso) => computeStats(iso, plants, prices, flows)),
    [selectedCountries, plants, prices, flows],
  );

  const comparisonSeries = useMemo(
    () =>
      countryStats
        .filter((stats) => stats.hourly.length > 1)
        .map((stats) => ({
          id: `${stats.iso2}-price`,
          label: `${stats.name} price`,
          values: stats.hourly,
          color: stats.iso2 === countryStats[0]?.iso2 ? '#38bdf8' : '#a78bfa',
        })),
    [countryStats],
  );

  return (
    <div className="compare-panel">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">
          Compare Countries
          <span className="ml-2 font-normal text-slate-500">
            {selectedCountries.length}/4
          </span>
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-[10px] text-slate-500 transition-colors hover:text-red-400"
          >
            Clear All
          </button>
          <button
            onClick={onClose}
            className="text-sm text-slate-500 transition-colors hover:text-white"
          >
            &#10005;
          </button>
        </div>
      </div>

      <div className="sidebar-scroll flex gap-3 overflow-x-auto pb-1">
        {countryStats.map((stats) => (
          <CountryCard
            key={stats.iso2}
            stats={stats}
            comparisonSeries={comparisonSeries}
            onRemove={() => onRemoveCountry(stats.iso2)}
            onExpandSeries={onExpandSeries}
          />
        ))}
      </div>
    </div>
  );
}
