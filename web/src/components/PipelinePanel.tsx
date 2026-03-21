'use client';

import { useMemo } from 'react';
import { COUNTRY_CENTROIDS } from '@/lib/countries';
import type { TyndpProject } from '@/lib/tyndp';
import type { CountryPrice, CrossBorderFlow } from '@/lib/data-fetcher';
import {
  groupProjectsByStatus,
  computeCapacityRollup,
  computeInterconnectorImpact,
  identifyMarketReads,
  type MarketRead,
} from '@/lib/pipeline-intel';

interface PipelinePanelProps {
  projects: TyndpProject[];
  prices: CountryPrice[];
  flows: CrossBorderFlow[];
  onSelectProject?: (project: TyndpProject) => void;
  onClose: () => void;
}

const STATUS_LABELS: Record<TyndpProject['status'], string> = {
  under_construction: 'Building',
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

const FUEL_EMOJI: Record<string, string> = {
  Wind: '\u{1F4A8}',
  Nuclear: '\u269B\uFE0F',
  Other: '\u26A1',
  Solar: '\u2600\uFE0F',
  Hydro: '\u{1F30A}',
};

const READ_TYPE_COLORS: Record<MarketRead['type'], string> = {
  congestion_price_driver: '#f87171',
  pipeline_near_term: '#4ade80',
  interconnector_spread: '#38bdf8',
};

const READ_TYPE_ICONS: Record<MarketRead['type'], string> = {
  congestion_price_driver: '\u26A0\uFE0F',
  pipeline_near_term: '\u{1F4C8}',
  interconnector_spread: '\u{1F517}',
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-2">
      {children}
    </h4>
  );
}

function CapacityBar({
  fuel,
  mw,
  maxMW,
}: {
  fuel: string;
  mw: number;
  maxMW: number;
}) {
  const pct = maxMW > 0 ? (mw / maxMW) * 100 : 0;
  const emoji = FUEL_EMOJI[fuel] || '\u26A1';
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-5 text-center">{emoji}</span>
      <span className="w-16 text-slate-500 truncate">{fuel}</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-sky-500/70 transition-all"
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>
      <span className="w-14 text-right text-slate-400 tabular-nums">
        {(mw / 1000).toFixed(1)} GW
      </span>
    </div>
  );
}

function ProjectRow({
  project,
  onClick,
}: {
  project: TyndpProject;
  onClick?: () => void;
}) {
  const countryName = COUNTRY_CENTROIDS[project.country]?.name || project.country;
  const color = STATUS_COLORS[project.status];
  const yearsAway = parseInt(project.expectedYear) - new Date().getFullYear();

  return (
    <button
      onClick={onClick}
      className="flex items-start gap-2 w-full py-1.5 px-1 rounded-lg hover:bg-white/[0.03] transition-colors text-left group"
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-[11px] text-slate-300 group-hover:text-white truncate font-medium">
            {project.name}
          </span>
          <span className="text-[10px] text-slate-600 flex-shrink-0 tabular-nums">
            {project.capacity.toLocaleString()} MW
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-slate-600">{countryName}</span>
          <span className="text-[10px] text-slate-700">&bull;</span>
          <span className="text-[10px] text-slate-600">{project.expectedYear}</span>
          {yearsAway > 0 && (
            <span className="text-[10px] text-slate-700">
              ({yearsAway}y)
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function InterconnectorRow({
  name,
  capacity,
  expectedYear,
  status,
  spreadEUR,
  countryPrice,
}: {
  name: string;
  capacity: number;
  expectedYear: string;
  status: TyndpProject['status'];
  spreadEUR: number | null;
  countryPrice: number | null;
}) {
  const color = STATUS_COLORS[status];
  const spreadColor =
    spreadEUR == null
      ? 'text-slate-600'
      : Math.abs(spreadEUR) > 40
      ? 'text-red-400'
      : Math.abs(spreadEUR) > 20
      ? 'text-amber-400'
      : 'text-slate-500';

  return (
    <div className="py-1.5 px-1 rounded-lg hover:bg-white/[0.03] transition-colors">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="text-[11px] text-slate-300 truncate font-medium">
            {name}
          </span>
        </div>
        <span className="text-[10px] text-slate-600 flex-shrink-0 tabular-nums">
          {capacity.toLocaleString()} MW
        </span>
      </div>
      <div className="flex items-center justify-between mt-0.5 ml-3">
        <span className="text-[10px] text-slate-600">{STATUS_LABELS[status]} &bull; {expectedYear}</span>
        {spreadEUR != null && countryPrice != null && (
          <span className={`text-[10px] tabular-nums font-medium ${spreadColor}`}>
            €{countryPrice.toFixed(0)} ({spreadEUR >= 0 ? '+' : ''}€{spreadEUR}/MWh vs avg)
          </span>
        )}
      </div>
    </div>
  );
}

export default function PipelinePanel({
  projects,
  prices,
  flows,
  onSelectProject,
  onClose,
}: PipelinePanelProps) {
  const buckets = useMemo(() => groupProjectsByStatus(projects), [projects]);

  const ucRollup = useMemo(
    () => computeCapacityRollup(buckets.under_construction),
    [buckets.under_construction]
  );

  const maxUCMW = useMemo(
    () => Math.max(0, ...Object.values(ucRollup)),
    [ucRollup]
  );

  const interconnectorImpacts = useMemo(
    () => computeInterconnectorImpact(projects, prices),
    [projects, prices]
  );

  const marketReads = useMemo(
    () => identifyMarketReads(projects, prices, flows),
    [projects, prices, flows]
  );

  const totalUCMW = useMemo(
    () => Object.values(ucRollup).reduce((s, v) => s + v, 0),
    [ucRollup]
  );

  const nearTermProjects = useMemo(() => {
    const cutoff = new Date().getFullYear() + 2;
    return buckets.under_construction
      .filter((p) => parseInt(p.expectedYear) <= cutoff)
      .sort((a, b) => b.capacity - a.capacity);
  }, [buckets.under_construction]);

  return (
    <div
      className="right-panel absolute right-4 bg-[#0a0e17]/92 backdrop-blur-xl border border-white/[0.06] rounded-2xl shadow-2xl w-[300px] max-h-[calc(100vh-32px)] flex flex-col"
      style={{ top: 16, zIndex: 15, animation: 'slideInRight 0.2s ease-out' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0 border-b border-white/[0.04]">
        <div>
          <h3 className="text-sm font-bold text-white">Pipeline Intel</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {projects.length} projects &bull;{' '}
            <span className="text-slate-400 font-medium">
              {(totalUCMW / 1000).toFixed(1)} GW
            </span>{' '}
            under construction
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-white transition-colors text-sm"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto sidebar-scroll px-4 py-3 space-y-4">

        {/* Status summary */}
        <div>
          <SectionTitle>Status breakdown</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(buckets) as [TyndpProject['status'], TyndpProject[]][])
              .filter(([, projs]) => projs.length > 0)
              .map(([status, projs]) => {
                const totalMW = projs.reduce((s, p) => s + p.capacity, 0);
                return (
                  <div key={status} className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-2.5">
                    <div
                      className="text-[10px] font-semibold mb-0.5"
                      style={{ color: STATUS_COLORS[status] }}
                    >
                      {STATUS_LABELS[status]}
                    </div>
                    <div className="text-sm font-bold text-white tabular-nums">
                      {projs.length}
                    </div>
                    <div className="text-[10px] text-slate-600 tabular-nums">
                      {(totalMW / 1000).toFixed(1)} GW
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Under-construction fuel breakdown */}
        {Object.keys(ucRollup).length > 0 && (
          <div>
            <SectionTitle>Under construction by type</SectionTitle>
            <div className="space-y-1.5">
              {Object.entries(ucRollup)
                .sort((a, b) => b[1] - a[1])
                .map(([fuel, mw]) => (
                  <CapacityBar key={fuel} fuel={fuel} mw={mw} maxMW={maxUCMW} />
                ))}
            </div>
          </div>
        )}

        {/* Near-term capacity (arriving within 2 years) */}
        {nearTermProjects.length > 0 && (
          <div>
            <SectionTitle>
              Arriving by {new Date().getFullYear() + 2} (under construction)
            </SectionTitle>
            <div className="space-y-0.5">
              {nearTermProjects.map((p) => (
                <ProjectRow
                  key={p.name}
                  project={p}
                  onClick={() => onSelectProject?.(p)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Interconnector live spread context */}
        {interconnectorImpacts.length > 0 && (
          <div>
            <SectionTitle>Interconnectors vs live prices</SectionTitle>
            <div className="space-y-0.5">
              {interconnectorImpacts.map((ic) => (
                <InterconnectorRow key={ic.name} {...ic} />
              ))}
            </div>
            <p className="text-[10px] text-slate-700 mt-2 leading-relaxed">
              Spread = country price vs EU avg. Large spreads signal the markets these links are targeting.
            </p>
          </div>
        )}

        {/* Market reads */}
        {marketReads.length > 0 && (
          <div>
            <SectionTitle>Market reads</SectionTitle>
            <div className="space-y-2">
              {marketReads.map((read, i) => {
                const color = READ_TYPE_COLORS[read.type];
                const icon = READ_TYPE_ICONS[read.type];
                return (
                  <div
                    key={i}
                    className="rounded-xl p-2.5 border"
                    style={{
                      borderColor: color + '30',
                      backgroundColor: color + '0c',
                    }}
                  >
                    <div className="flex items-start gap-1.5 mb-1">
                      <span className="text-[11px] flex-shrink-0">{icon}</span>
                      <span
                        className="text-[11px] font-medium leading-tight"
                        style={{ color }}
                      >
                        {read.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed pl-4">
                      {read.detail}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {marketReads.length === 0 && (
          <div className="py-2 text-center">
            <p className="text-[11px] text-slate-600">
              No strong market reads from current data.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
