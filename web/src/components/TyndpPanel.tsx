'use client';

import { COUNTRY_CENTROIDS } from '@/lib/countries';
import { getFuelColor, FUEL_LABELS, normalizeFuel } from '@/lib/colors';
import type { TyndpProject } from '@/lib/tyndp';

interface TyndpPanelProps {
  project: TyndpProject;
  onClose: () => void;
}

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
  under_construction: 'Works in progress — delivery risk is timeline slippage, not cancellation.',
  permitted: 'All major consents granted. Construction start expected within 1-3 years.',
  planned: 'Route confirmed. Subject to permitting and regulatory approvals.',
  concept: 'Early-stage. Capacity and timing remain indicative; may not proceed.',
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className="text-[12px] text-slate-200 font-medium text-right">{value}</span>
    </div>
  );
}

export default function TyndpPanel({ project, onClose }: TyndpPanelProps) {
  const fuel = normalizeFuel(project.fuel);
  const color = getFuelColor(project.fuel);
  const countryName = COUNTRY_CENTROIDS[project.country]?.name || project.country;
  const statusLabel = STATUS_LABELS[project.status];
  const statusColor = STATUS_COLORS[project.status];
  const statusNote = STATUS_NOTES[project.status];

  const yearsToDelivery =
    parseInt(project.expectedYear) - new Date().getFullYear();

  return (
    <div className="plant-panel">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors text-base"
        aria-label="Close TYNDP panel"
      >
        ✕
      </button>

      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <span
          className="w-3 h-3 rounded-full flex-shrink-0 mt-1 ring-2 ring-white/20"
          style={{ backgroundColor: `rgb(${color[0]},${color[1]},${color[2]})` }}
        />
        <div>
          <h2 className="text-base font-bold text-white leading-tight">
            {project.name}
          </h2>
          <p className="text-xs text-slate-400">{countryName} &mdash; TYNDP 2024</p>
        </div>
      </div>

      {/* Status badge */}
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mb-4 text-xs font-semibold border"
        style={{
          color: statusColor,
          borderColor: statusColor + '40',
          backgroundColor: statusColor + '18',
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
        {statusLabel}
        {yearsToDelivery > 0 && (
          <span className="text-slate-500 font-normal ml-1">
            &bull; {yearsToDelivery}y away
          </span>
        )}
        {yearsToDelivery <= 0 && project.status === 'under_construction' && (
          <span className="text-slate-500 font-normal ml-1">&bull; overdue</span>
        )}
      </div>

      {/* Details */}
      <div className="space-y-2.5">
        <Row label="Type" value={FUEL_LABELS[fuel] || project.fuel} />
        <Row
          label="Capacity"
          value={`${project.capacity.toLocaleString()} MW (${(project.capacity / 1000).toFixed(2)} GW)`}
        />
        <Row label="Expected Year" value={project.expectedYear} />
        <Row
          label="Coordinates"
          value={`${project.lat.toFixed(4)}°N, ${project.lon.toFixed(4)}°E`}
        />
      </div>

      {/* Status note */}
      <div className="mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {statusNote}
        </p>
      </div>

      {/* Decision relevance callout for interconnectors */}
      {project.fuel === 'Other' && (
        <div className="mt-3 p-3 rounded-xl bg-sky-500/10 border border-sky-500/20">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">
            Interconnector Impact
          </p>
          <p className="text-[11px] text-sky-300 leading-relaxed">
            When operational, this link adds {project.capacity.toLocaleString()} MW of cross-border
            capacity. Expect narrowing of the price spread on the corridor it bridges.
          </p>
        </div>
      )}
    </div>
  );
}
