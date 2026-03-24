'use client';

import React from 'react';
import InteractiveTimeSeriesChart from '@/components/charts/InteractiveTimeSeriesChart';
import type { ExpandedSeriesConfig } from '@/components/charts/ExpandedSeriesPanel';
import type {
  CountryOutage,
  CountryPrice,
  CrossBorderFlow,
} from '@/lib/data-fetcher';

interface CorridorContextSectionProps {
  data: CrossBorderFlow;
  prices: CountryPrice[];
  outages: CountryOutage[];
  onExpandSeries: (config: ExpandedSeriesConfig) => void;
}

export default function CorridorContextSection({
  data,
  prices,
  outages,
  onExpandSeries,
}: CorridorContextSectionProps) {
  const utilisation = data.capacityMW > 0 ? (data.flowMW / data.capacityMW) * 100 : 0;
  const headroom = data.capacityMW - data.flowMW;
  const fromPrice = prices.find((entry) => entry.iso2 === data.from) ?? null;
  const toPrice = prices.find((entry) => entry.iso2 === data.to) ?? null;
  const spread = fromPrice && toPrice ? toPrice.price - fromPrice.price : null;
  const relevantOutages = outages
    .filter((entry) => entry.iso2 === data.from || entry.iso2 === data.to)
    .reduce((sum, entry) => sum + entry.unavailableMW, 0);

  const baseSeries = data.hourlyFlowMW?.length
    ? [
        {
          id: `${data.from}-${data.to}-flow`,
          label: `${data.from}->${data.to} flow`,
          values: data.hourlyFlowMW,
          color: '#38bdf8',
        },
      ]
    : [];

  const priceCandidates = [
    fromPrice?.hourly?.length
      ? {
          id: `${data.from}-price`,
          label: `${data.from} price`,
          values: fromPrice.hourly,
          color: '#f59e0b',
        }
      : null,
    toPrice?.hourly?.length
      ? {
          id: `${data.to}-price`,
          label: `${data.to} price`,
          values: toPrice.hourly,
          color: '#a78bfa',
        }
      : null,
  ].filter((line): line is NonNullable<typeof line> => Boolean(line));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Current flow" value={`${data.flowMW.toLocaleString()}`} detail="MW" tone="text-sky-300" />
        <MetricCard label="Utilisation" value={`${utilisation.toFixed(0)}%`} detail={`${data.capacityMW.toLocaleString()} MW capacity`} tone={utilisation > 80 ? 'text-rose-300' : 'text-emerald-300'} />
        <MetricCard label="Headroom" value={`${Math.abs(headroom).toLocaleString()}`} detail={headroom >= 0 ? 'MW available' : 'MW over cap'} tone={headroom >= 0 ? 'text-white' : 'text-rose-300'} />
        <MetricCard label="Spread" value={spread == null ? 'N/A' : `${spread > 0 ? '+' : ''}${spread.toFixed(1)}`} detail="EUR/MWh" tone="text-amber-200" />
      </div>

      {baseSeries.length > 0 && (
        <InteractiveTimeSeriesChart
          title="24h flow profile"
          subtitle="Live corridor history from the runtime flow feed"
          unitLabel="MW"
          timestampsUtc={data.hourlyTimestampsUtc}
          series={baseSeries}
          ceiling={data.capacityMW}
          onExpand={() => onExpandSeries({
            title: `${data.from}->${data.to} corridor analysis`,
            unitLabel: 'MW',
            timestampsUtc: data.hourlyTimestampsUtc,
            series: baseSeries,
            candidates: priceCandidates,
          })}
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Price context</p>
          <div className="mt-3 space-y-2">
            <InfoRow label={`${data.from} price`} value={fromPrice ? `EUR ${fromPrice.price.toFixed(1)}` : 'N/A'} />
            <InfoRow label={`${data.to} price`} value={toPrice ? `EUR ${toPrice.price.toFixed(1)}` : 'N/A'} />
            <InfoRow label="Spread" value={spread == null ? 'N/A' : `${spread > 0 ? '+' : ''}${spread.toFixed(1)} EUR/MWh`} />
          </div>
        </div>

        <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">System context</p>
          <div className="mt-3 space-y-2">
            <InfoRow label="Related outages" value={`${relevantOutages.toLocaleString()} MW`} />
            <InfoRow label="From market" value={data.from} />
            <InfoRow label="To market" value={data.to} />
            <InfoRow label="Flow timestamps" value={data.hourlyTimestampsUtc?.length ? `${data.hourlyTimestampsUtc.length} points` : 'No live history'} />
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
