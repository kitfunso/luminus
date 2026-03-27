'use client';

import React from 'react';
import InteractiveTimeSeriesChart from '@/components/charts/InteractiveTimeSeriesChart';
import type { ExpandedSeriesConfig } from '@/components/charts/ExpandedSeriesPanel';
import { FUEL_LABELS, normalizeFuel } from '@/lib/colors';
import type {
  CountryForecast,
  CountryOutage,
  CountryPrice,
  PowerPlant,
} from '@/lib/data-fetcher';
import {
  formatPriceValue,
  getPriceUnitLabel,
  MIXED_PRICE_UNIT_LABEL,
} from '@/lib/price-format';
import { resolvePriceTimestamps } from '@/lib/series-timestamps';

interface PlantContextSectionProps {
  data: PowerPlant;
  prices: CountryPrice[];
  outages: CountryOutage[];
  forecasts: CountryForecast[];
  onExpandSeries: (config: ExpandedSeriesConfig) => void;
}

function normalizeText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export default function PlantContextSection({
  data,
  prices,
  outages,
  forecasts,
  onExpandSeries,
}: PlantContextSectionProps) {
  const countryPrice = prices.find((entry) => entry.iso2 === data.country) ?? null;
  const countryForecast = forecasts.find((entry) => entry.iso2 === data.country) ?? null;
  const countryOutage = outages.find((entry) => entry.iso2 === data.country) ?? null;
  const matchedOutage = countryOutage?.topOutages.find((entry) =>
    entry.plantKey === `${data.country}:${normalizeText(data.name).replace(/\s+/g, '-')}`
    || normalizeText(entry.name) === normalizeText(data.name),
  ) ?? null;

  const fuel = normalizeFuel(data.fuel);
  const priceSeries = countryPrice?.hourly?.length
    ? [
        {
          id: `${data.country}-price`,
          label: `${data.country} price`,
          values: countryPrice.hourly,
          color: '#38bdf8',
          formatValue: (value: number) => formatPriceValue(value, data.country),
        },
      ]
    : [];
  const priceTimestamps = countryPrice ? resolvePriceTimestamps(countryPrice) : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Capacity" value={`${data.capacity.toLocaleString()}`} detail="MW" tone="text-white" />
        <MetricCard label="Fuel" value={FUEL_LABELS[fuel] ?? data.fuel} detail="Primary fuel" tone="text-amber-200" />
        <MetricCard
          label="Outage"
          value={matchedOutage ? `${matchedOutage.unavailableMW.toLocaleString()} MW` : 'Active'}
          detail={matchedOutage ? (matchedOutage.outageType ?? matchedOutage.type) : 'No linked outage window'}
          tone={matchedOutage ? 'text-rose-300' : 'text-emerald-300'}
        />
        <MetricCard
          label="Coordinates"
          value={`${data.lat.toFixed(2)}, ${data.lon.toFixed(2)}`}
          detail={data.country}
          tone="text-slate-100"
        />
      </div>

      {priceSeries.length > 0 && (
        <InteractiveTimeSeriesChart
          title="Market context"
          subtitle="Country day-ahead schedule around the selected asset"
          unitLabel={getPriceUnitLabel(data.country)}
          timestampsUtc={priceTimestamps}
          series={priceSeries}
          onExpand={() => onExpandSeries({
            title: `${data.name} context analysis`,
            unitLabel: MIXED_PRICE_UNIT_LABEL,
            timestampsUtc: priceTimestamps,
            series: priceSeries,
            candidates: countryForecast
              ? [
                  {
                    id: `${data.country}-wind-actual`,
                    label: 'Wind actual',
                    values: countryForecast.wind.actualHourly,
                    color: '#38bdf8',
                  },
                  {
                    id: `${data.country}-wind-forecast`,
                    label: 'Wind forecast',
                    values: countryForecast.wind.forecastHourly,
                    color: '#94a3b8',
                    dashed: true,
                  },
                {
                  id: `${data.country}-solar-actual`,
                  label: 'Solar actual',
                  values: countryForecast.solar.actualHourly,
                  color: '#f59e0b',
                },
                ].filter((line) => line.values.length > 0)
              : [],
          })}
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Plant detail</p>
          <div className="mt-3 space-y-2">
            <InfoRow label="Country" value={data.country} />
            <InfoRow label="Commissioned" value={data.year || 'Unknown'} />
            <InfoRow label="Latitude" value={`${data.lat.toFixed(4)} deg`} />
            <InfoRow label="Longitude" value={`${data.lon.toFixed(4)} deg`} />
          </div>
        </div>

        <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Outage window</p>
          <div className="mt-3 space-y-2">
            <InfoRow label="Status" value={matchedOutage ? 'Unavailable' : 'No outage linked'} />
            <InfoRow label="Type" value={matchedOutage?.outageType ?? matchedOutage?.type ?? 'N/A'} />
            <InfoRow label="Start" value={matchedOutage?.start ? new Date(matchedOutage.start).toUTCString() : 'N/A'} />
            <InfoRow label="Return" value={matchedOutage?.expectedReturn ? new Date(matchedOutage.expectedReturn).toUTCString() : 'N/A'} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-2 text-lg font-semibold ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-100">{value}</span>
    </div>
  );
}
