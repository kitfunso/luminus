'use client';

import React, { useMemo } from 'react';

import InteractiveTimeSeriesChart from './charts/InteractiveTimeSeriesChart';
import type { ExpandedSeriesConfig } from './charts/ExpandedSeriesPanel';
import { COUNTRY_CENTROIDS } from '@/lib/countries';
import type { CountryPrice, CrossBorderFlow, PriceHistory } from '@/lib/data-fetcher';
import {
  formatPriceValue,
  getPriceUnitLabel,
  MIXED_PRICE_UNIT_LABEL,
} from '@/lib/price-format';

export type TimeSeriesAsset =
  | { kind: 'country'; iso2: string }
  | { kind: 'corridor'; from: string; to: string };

interface AssetTimeSeriesProps {
  asset: TimeSeriesAsset;
  prices: CountryPrice[];
  flows: CrossBorderFlow[];
  history: PriceHistory | null;
  onClose: () => void;
  onExpandSeries?: (config: ExpandedSeriesConfig) => void;
}

function buildHourlyTimestamps(length: number) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return Array.from(
    { length },
    (_, index) => new Date(start.getTime() + index * 60 * 60 * 1000).toISOString(),
  );
}

export default function AssetTimeSeries({
  asset,
  prices,
  flows,
  history,
  onClose,
  onExpandSeries,
}: AssetTimeSeriesProps) {
  const title = useMemo(() => {
    if (asset.kind === 'country') {
      return COUNTRY_CENTROIDS[asset.iso2]?.name ?? asset.iso2;
    }
    const fromName = COUNTRY_CENTROIDS[asset.from]?.name ?? asset.from;
    const toName = COUNTRY_CENTROIDS[asset.to]?.name ?? asset.to;
    return `${fromName} -> ${toName}`;
  }, [asset]);

  const priceEntry = useMemo(() => {
    if (asset.kind !== 'country') return null;
    return prices.find((entry) => entry.iso2 === asset.iso2) ?? null;
  }, [asset, prices]);

  const historyEntry = useMemo(() => {
    if (asset.kind !== 'country' || !history) return null;
    return history.countries.find((entry) => entry.iso2 === asset.iso2) ?? null;
  }, [asset, history]);

  const flowEntry = useMemo(() => {
    if (asset.kind !== 'corridor') return null;
    return flows.find(
      (entry) =>
        (entry.from === asset.from && entry.to === asset.to)
        || (entry.from === asset.to && entry.to === asset.from),
    ) ?? null;
  }, [asset, flows]);

  const fromPrice = useMemo(() => {
    if (asset.kind !== 'corridor') return null;
    return prices.find((entry) => entry.iso2 === asset.from) ?? null;
  }, [asset, prices]);

  const toPrice = useMemo(() => {
    if (asset.kind !== 'corridor') return null;
    return prices.find((entry) => entry.iso2 === asset.to) ?? null;
  }, [asset, prices]);

  const subtitle = useMemo(() => {
    if (asset.kind === 'country' && priceEntry) {
      return `Day-ahead price | avg ${formatPriceValue(priceEntry.price, asset.iso2, 0)}/MWh`;
    }
    if (asset.kind === 'corridor' && flowEntry) {
      const utilisation = flowEntry.capacityMW > 0
        ? ((flowEntry.flowMW / flowEntry.capacityMW) * 100).toFixed(0)
        : '?';
      return `Flow ${flowEntry.flowMW.toLocaleString()} MW | ${utilisation}% utilisation`;
    }
    return '';
  }, [asset, flowEntry, priceEntry]);

  const priceHourly = asset.kind === 'country' ? priceEntry?.hourly ?? null : null;
  const historyHourly = asset.kind === 'country' ? historyEntry?.hourly ?? null : null;
  const historyTimestamps = asset.kind === 'country'
    ? historyEntry?.timestampsUtc ?? (historyEntry ? buildHourlyTimestamps(historyEntry.hourly.length) : undefined)
    : undefined;

  return (
    <div
      className="right-panel absolute right-4 z-[15] w-[320px] overflow-y-auto rounded-[28px] border border-white/[0.06] bg-[#0a0e17]/92 p-4 shadow-2xl backdrop-blur-xl"
      style={{ top: 16, animation: 'slideInRight 0.2s ease-out' }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 text-sm text-slate-500 transition-colors hover:text-white"
      >
        x
      </button>

      <div className="mb-3 pr-5">
        <h3 className="text-sm font-bold leading-tight text-white">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p>}
      </div>

      <div className="space-y-4">
        {asset.kind === 'country' && priceHourly && (
          <InteractiveTimeSeriesChart
            title="24h day-ahead price"
            subtitle="Hover to inspect the live price curve"
            unitLabel={getPriceUnitLabel(asset.iso2)}
            timestampsUtc={buildHourlyTimestamps(priceHourly.length)}
            series={[
              {
                id: `${asset.iso2}-price`,
                label: `${asset.iso2} price`,
                values: priceHourly,
                color: '#38bdf8',
                formatValue: (value: number) => formatPriceValue(value, asset.iso2),
              },
            ]}
            height={96}
            onExpand={onExpandSeries
              ? () => onExpandSeries({
                  title: `${title} price analysis`,
                  unitLabel: MIXED_PRICE_UNIT_LABEL,
                  timestampsUtc: buildHourlyTimestamps(priceHourly.length),
                  series: [
                    {
                      id: `${asset.iso2}-price`,
                      label: `${asset.iso2} day-ahead`,
                      values: priceHourly,
                      color: '#38bdf8',
                      formatValue: (value: number) => formatPriceValue(value, asset.iso2),
                    },
                  ],
                  candidates: historyEntry
                    ? [
                        {
                          id: `${asset.iso2}-history`,
                          label: `${asset.iso2} replay`,
                          values: historyEntry.hourly,
                          color: '#a78bfa',
                          formatValue: (value: number) => formatPriceValue(value, asset.iso2),
                        },
                      ]
                    : [],
                })
              : undefined}
          />
        )}

        {asset.kind === 'country' && historyHourly && historyHourly.length > 1 && (
          <InteractiveTimeSeriesChart
            title={`${history?.days ?? 0}d price history`}
            subtitle="The same replay window used by the time scrubber"
            unitLabel={getPriceUnitLabel(asset.iso2)}
            timestampsUtc={historyTimestamps}
            series={[
              {
                id: `${asset.iso2}-history`,
                label: `${asset.iso2} history`,
                values: historyHourly,
                color: '#a78bfa',
                formatValue: (value: number) => formatPriceValue(value, asset.iso2),
              },
            ]}
            height={96}
            onExpand={onExpandSeries
              ? () => onExpandSeries({
                  title: `${title} replay analysis`,
                  unitLabel: MIXED_PRICE_UNIT_LABEL,
                  timestampsUtc: historyTimestamps,
                  series: [
                    {
                      id: `${asset.iso2}-history`,
                      label: `${asset.iso2} replay`,
                      values: historyHourly,
                      color: '#a78bfa',
                      formatValue: (value: number) => formatPriceValue(value, asset.iso2),
                    },
                  ],
                  candidates: priceHourly
                    ? [
                        {
                          id: `${asset.iso2}-price`,
                          label: `${asset.iso2} day-ahead`,
                          values: priceHourly,
                          color: '#38bdf8',
                          formatValue: (value: number) => formatPriceValue(value, asset.iso2),
                        },
                      ]
                    : [],
                })
              : undefined}
          />
        )}

        {asset.kind === 'country' && !priceHourly && !historyEntry && (
          <p className="py-2 text-center text-[11px] text-slate-600">
            No time-series data available for this country.
          </p>
        )}

        {asset.kind === 'corridor' && flowEntry?.hourlyFlowMW && flowEntry.hourlyFlowMW.length > 1 && (
          <InteractiveTimeSeriesChart
            title="Live corridor flow"
            subtitle="Runtime hourly history for the selected corridor"
            unitLabel="MW"
            timestampsUtc={flowEntry.hourlyTimestampsUtc}
            series={[
              {
                id: `${asset.from}-${asset.to}-flow`,
                label: `${asset.from}->${asset.to}`,
                values: flowEntry.hourlyFlowMW,
                color: '#38bdf8',
              },
            ]}
            ceiling={flowEntry.capacityMW}
            height={110}
            onExpand={onExpandSeries
              ? () => onExpandSeries({
                  title: `${title} corridor analysis`,
                  unitLabel: 'MW',
                  timestampsUtc: flowEntry.hourlyTimestampsUtc,
                  series: [
                    {
                      id: `${asset.from}-${asset.to}-flow`,
                      label: `${asset.from}->${asset.to} flow`,
                      values: flowEntry.hourlyFlowMW ?? [],
                      color: '#38bdf8',
                    },
                  ],
                  candidates: [
                    fromPrice?.hourly?.length
                      ? {
                          id: `${asset.from}-price`,
                          label: `${asset.from} price`,
                          values: fromPrice.hourly,
                          color: '#f59e0b',
                          formatValue: (value: number) => formatPriceValue(value, asset.from),
                        }
                      : null,
                    toPrice?.hourly?.length
                      ? {
                          id: `${asset.to}-price`,
                          label: `${asset.to} price`,
                          values: toPrice.hourly,
                          color: '#a78bfa',
                          formatValue: (value: number) => formatPriceValue(value, asset.to),
                        }
                      : null,
                  ].filter((line): line is NonNullable<typeof line> => Boolean(line)),
                })
              : undefined}
          />
        )}

        {asset.kind === 'corridor' && (!flowEntry || !flowEntry.hourlyFlowMW?.length) && (
          <p className="py-2 text-center text-[11px] text-slate-600">
            No live flow history available for this corridor.
          </p>
        )}
      </div>
    </div>
  );
}
