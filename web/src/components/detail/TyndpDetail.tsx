'use client';

import { COUNTRY_CENTROIDS } from '@/lib/countries';
import { getFuelColor, FUEL_LABELS, normalizeFuel } from '@/lib/colors';
import type { TyndpProject } from '@/lib/tyndp';
import DetailHeader from './DetailHeader';
import KpiRow from './KpiRow';

const STATUS_LABELS: Record<TyndpProject['status'], string> = {
  under_construction: 'Under Construction',
  permitted: 'Permitted',
  planned: 'Planned',
  concept: 'Concept',
};

const STATUS_COLORS: Record<TyndpProject['status'], string> = {
  under_construction: '#4ade80',
  permitted: '#38bdf8',
  planned: '#facc15',
  concept: '#94a3b8',
};

const STATUS_NOTES: Record<TyndpProject['status'], string> = {
  under_construction: 'Works in progress. Delivery risk is timeline slippage, not cancellation.',
  permitted: 'All major consents granted. Construction start expected within 1-3 years.',
  planned: 'Route confirmed. Subject to permitting and regulatory approvals.',
  concept: 'Early-stage. Capacity and timing remain indicative; may not proceed.',
};

interface TyndpDetailProps {
  data: TyndpProject;
  onClose: () => void;
}

export default function TyndpDetail({ data, onClose }: TyndpDetailProps) {
  const fuel = normalizeFuel(data.fuel);
  const color = getFuelColor(data.fuel);
  const countryName = COUNTRY_CENTROIDS[data.country]?.name ?? data.country;
  const statusColor = STATUS_COLORS[data.status];
  const yearsToDelivery = parseInt(data.expectedYear) - new Date().getFullYear();

  const statusRing = (
    <span
      className="w-3 h-3 rounded-full inline-block ring-2"
      style={{
        backgroundColor: `rgb(${color[0]},${color[1]},${color[2]})`,
        // @ts-expect-error -- ring color via CSS custom property
        '--tw-ring-color': statusColor + '66',
      }}
    />
  );

  return (
    <>
      <DetailHeader icon={statusRing} title={data.name} subtitle={`${countryName} \u2014 TYNDP 2024`} onClose={onClose} />

      <KpiRow kpis={[
        {
          label: 'Capacity',
          value: data.capacity >= 1000
            ? `${(data.capacity / 1000).toFixed(1)} GW`
            : `${data.capacity.toLocaleString()} MW`,
        },
        {
          label: 'Status',
          value: STATUS_LABELS[data.status],
          color: statusColor,
        },
        { label: 'Expected', value: data.expectedYear },
        { label: 'Type', value: FUEL_LABELS[fuel] ?? data.fuel },
      ]} />

      {/* Status note */}
      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-4">
        <p className="text-[11px] text-slate-400 leading-relaxed">{STATUS_NOTES[data.status]}</p>
        {yearsToDelivery > 0 && (
          <p className="text-[10px] text-slate-500 mt-1">{yearsToDelivery} years to delivery</p>
        )}
        {yearsToDelivery <= 0 && data.status === 'under_construction' && (
          <p className="text-[10px] text-amber-400 mt-1">Overdue</p>
        )}
      </div>

      {/* Interconnector impact */}
      {data.fuel === 'Other' && (
        <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Interconnector Impact</p>
          <p className="text-[11px] text-sky-300 leading-relaxed">
            When operational, this link adds {data.capacity.toLocaleString()} MW of cross-border
            capacity. Expect narrowing of the price spread on the corridor it bridges.
          </p>
        </div>
      )}
    </>
  );
}
