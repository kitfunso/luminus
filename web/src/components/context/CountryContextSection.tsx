'use client';

import React from 'react';
import InteractiveTimeSeriesChart, {
  type InteractiveSeries,
} from '@/components/charts/InteractiveTimeSeriesChart';
import type { ExpandedSeriesConfig } from '@/components/charts/ExpandedSeriesPanel';
import { FUEL_LABELS, normalizeFuel } from '@/lib/colors';
import type {
  CountryForecast,
  CountryOutage,
  CountryPrice,
  CrossBorderFlow,
  PowerPlant,
} from '@/lib/data-fetcher';
import {
  formatPriceValue,
  getPriceUnitLabel,
  MIXED_PRICE_UNIT_LABEL,
} from '@/lib/price-format';

interface CountryContextSectionProps {
  data: CountryPrice;
  plants: PowerPlant[];
  flows: CrossBorderFlow[];
  outages: CountryOutage[];
  forecasts: CountryForecast[];
  onExpandSeries: (config: ExpandedSeriesConfig) => void;
}

function buildHourlyTimestamps(length: number) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return Array.from(
    { length },
    (_, index) => new Date(start.getTime() + index * 60 * 60 * 1000).toISOString(),
  );
}

export default function CountryContextSection({
  data,
  plants,
  flows,
  outages,
  forecasts,
  onExpandSeries,
}: CountryContextSectionProps) {
  const countryPlants = plants.filter((plant) => plant.country === data.iso2);
  const countryOutage = outages.find((outage) => outage.iso2 === data.iso2) ?? null;
  const forecast = forecasts.find((entry) => entry.iso2 === data.iso2) ?? null;

  const byFuel = countryPlants.reduce<Record<string, number>>((accumulator, plant) => {
    const fuel = normalizeFuel(plant.fuel);
    accumulator[fuel] = (accumulator[fuel] ?? 0) + plant.capacity;
    return accumulator;
  }, {});
  const dominantFuel = Object.entries(byFuel).sort((a, b) => b[1] - a[1])[0] ?? null;
  const totalCapacity = Object.values(byFuel).reduce((sum, value) => sum + value, 0);
  const dominantFuelLabel = dominantFuel ? FUEL_LABELS[dominantFuel[0]] ?? dominantFuel[0] : 'N/A';
  const dominantFuelShare = dominantFuel && totalCapacity > 0
    ? Math.round((dominantFuel[1] / totalCapacity) * 100)
    : 0;

  const netFlowMW = flows.reduce((sum, flow) => {
    if (flow.from === data.iso2) {
      return sum + flow.flowMW;
    }
    if (flow.to === data.iso2) {
      return sum - flow.flowMW;
    }
    return sum;
  }, 0);
  const netFlowLabel = netFlowMW > 0 ? 'Net export' : netFlowMW < 0 ? 'Net import' : 'Balanced';

  const priceSeries = data.hourly?.length
    ? [
        {
          id: `${data.iso2}-price`,
          label: `${data.country} price`,
          values: data.hourly,
          color: '#38bdf8',
          formatValue: (value: number) => formatPriceValue(value, data.iso2),
        },
      ]
    : [];

  const forecastCandidates: InteractiveSeries[] = forecast
    ? [
        {
          id: `${data.iso2}-wind-forecast`,
          label: 'Wind forecast',
          values: forecast.wind.forecastHourly,
          color: '#94a3b8',
          dashed: true,
        },
        {
          id: `${data.iso2}-wind-actual`,
          label: 'Wind actual',
          values: forecast.wind.actualHourly,
          color: '#38bdf8',
        },
        {
          id: `${data.iso2}-solar-forecast`,
          label: 'Solar forecast',
          values: forecast.solar.forecastHourly,
          color: '#fcd34d',
          dashed: true,
        },
        {
          id: `${data.iso2}-solar-actual`,
          label: 'Solar actual',
          values: forecast.solar.actualHourly,
          color: '#f59e0b',
        },
      ].filter((line) => line.values.length > 1)
    : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard
          label="Day-ahead price"
          value={formatPriceValue(data.price, data.iso2)}
          detail={getPriceUnitLabel(data.iso2)}
          tone="text-sky-300"
        />
        <MetricCard
          label="Offline"
          value={`${countryOutage?.unavailableMW.toLocaleString() ?? '0'}`}
          detail="MW"
          tone={countryOutage?.unavailableMW ? 'text-rose-300' : 'text-emerald-300'}
        />
        <MetricCard
          label={netFlowLabel}
          value={`${Math.abs(netFlowMW).toLocaleString()}`}
          detail="MW"
          tone={netFlowMW >= 0 ? 'text-emerald-300' : 'text-amber-300'}
        />
        <MetricCard
          label="Generation mix"
          value={dominantFuelLabel}
          detail={dominantFuel ? `${dominantFuelShare}% of installed capacity` : 'No plant data'}
          tone="text-slate-100"
        />
      </div>

      {priceSeries.length > 0 && (
        <InteractiveTimeSeriesChart
          title="Day-ahead price"
          subtitle="Live day-ahead profile for the selected market"
          unitLabel={getPriceUnitLabel(data.iso2)}
          timestampsUtc={buildHourlyTimestamps(priceSeries[0].values.length)}
          series={priceSeries}
          onExpand={() => onExpandSeries({
            title: `${data.country} market analysis`,
            unitLabel: MIXED_PRICE_UNIT_LABEL,
            timestampsUtc: buildHourlyTimestamps(priceSeries[0].values.length),
            series: priceSeries,
            candidates: forecastCandidates,
          })}
        />
      )}

      {(forecastCandidates.length > 0 || countryOutage) && (
        <div className="grid gap-3 md:grid-cols-2">
          {forecast && (
            <InteractiveTimeSeriesChart
              title="Forecast vs actual"
              subtitle="Wind actual is tracked against the latest forecast"
              unitLabel="MW"
              timestampsUtc={buildHourlyTimestamps(Math.max(forecast.wind.actualHourly.length, forecast.wind.forecastHourly.length))}
              series={[
                {
                  id: `${data.iso2}-wind-actual-compact`,
                  label: 'Wind actual',
                  values: forecast.wind.actualHourly,
                  color: '#38bdf8',
                },
                {
                  id: `${data.iso2}-wind-forecast-compact`,
                  label: 'Wind forecast',
                  values: forecast.wind.forecastHourly,
                  color: '#94a3b8',
                  dashed: true,
                },
              ]}
              onExpand={() => onExpandSeries({
                title: `${data.country} forecast comparison`,
                unitLabel: 'MW',
                timestampsUtc: buildHourlyTimestamps(Math.max(forecast.wind.actualHourly.length, forecast.wind.forecastHourly.length)),
                series: [
                  {
                    id: `${data.iso2}-wind-actual-compact`,
                    label: 'Wind actual',
                    values: forecast.wind.actualHourly,
                    color: '#38bdf8',
                  },
                  {
                    id: `${data.iso2}-wind-forecast-compact`,
                    label: 'Wind forecast',
                    values: forecast.wind.forecastHourly,
                    color: '#94a3b8',
                    dashed: true,
                  },
                ],
                candidates: forecastCandidates.filter((line) => !line.id.includes('wind-')),
              })}
            />
          )}

          {countryOutage && (
            <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Outage context</p>
              <div className="mt-3 space-y-2">
                <InfoRow label="Country outages" value={`${countryOutage.outageCount}`} />
                <InfoRow label="Unavailable" value={`${countryOutage.unavailableMW.toLocaleString()} MW`} />
                <InfoRow
                  label="Largest outage"
                  value={countryOutage.topOutages[0]?.name ?? 'None'}
                />
                <InfoRow
                  label="Expected return"
                  value={countryOutage.topOutages[0]?.expectedReturn
                    ? new Intl.DateTimeFormat('en-GB', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                        timeZone: 'UTC',
                      }).format(new Date(countryOutage.topOutages[0].expectedReturn))
                    : 'N/A'}
                />
              </div>
            </div>
          )}
        </div>
      )}
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
