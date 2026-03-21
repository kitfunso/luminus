'use client';

import { useMemo } from 'react';
import { COUNTRY_CENTROIDS } from '@/lib/countries';
import { corridorId, CORRIDOR_LINE_MAP } from '@/lib/corridor-lines';
import type {
  CrossBorderFlow,
  CountryPrice,
  CountryOutage,
} from '@/lib/data-fetcher';

// --- Thresholds (mirror Map.tsx arc coloring) ---

function utilisationLevel(flowMW: number, capacityMW: number) {
  const pct = capacityMW > 0 ? flowMW / capacityMW : 0;
  if (pct > 0.8) return { pct, label: 'Congested', color: '#f87171' };
  if (pct > 0.5) return { pct, label: 'Stressed', color: '#facc15' };
  return { pct, label: 'Low', color: '#4ade80' };
}

function computeSpread(fromPrice?: number, toPrice?: number) {
  if (fromPrice == null || toPrice == null) return null;
  return Math.round((toPrice - fromPrice) * 10) / 10;
}

function syntheticFlowProfile(
  avgFlow: number,
  fromHourly: number[],
  toHourly: number[]
): number[] {
  if (!fromHourly?.length || !toHourly?.length) return Array(24).fill(Math.round(avgFlow));
  const len = Math.min(24, fromHourly.length, toHourly.length);
  const spreads: number[] = [];
  for (let i = 0; i < len; i++) spreads.push(toHourly[i] - fromHourly[i]);
  const avgSp = spreads.reduce((a, b) => a + b, 0) / len;
  const maxAbs = Math.max(1, ...spreads.map(Math.abs));
  return spreads.map((sp) =>
    Math.max(0, Math.round(avgFlow + ((sp - avgSp) / (2 * maxAbs)) * avgFlow * 0.8))
  );
}

function countryFlag(iso2: string) {
  return [...iso2.toUpperCase()].map((c) =>
    String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)
  ).join('');
}

// --- Mini profile chart ---

function FlowProfile({ profile, capacityMW }: { profile: number[]; capacityMW: number }) {
  const max = Math.max(capacityMW, ...profile);
  const w = 240;
  const h = 50;
  const pad = 4;

  const pts = profile
    .slice(0, 24)
    .map((v, i) => {
      const x = pad + (i / 23) * (w - pad * 2);
      const y = h - pad - ((v / max) * (h - pad * 2));
      return `${x},${y}`;
    })
    .join(' ');

  const fill = `${pad},${h - pad} ${pts} ${w - pad},${h - pad}`;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="w-full"
      preserveAspectRatio="none"
    >
      {/* Capacity ceiling */}
      <line
        x1={pad}
        y1={pad}
        x2={w - pad}
        y2={pad}
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <polygon points={fill} fill="rgba(56,189,248,0.1)" />
      <polyline
        points={pts}
        fill="none"
        stroke="rgb(56,189,248)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// --- Utilisation bar ---

function UtilBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, pct * 100).toFixed(1)}%`, backgroundColor: color }}
      />
    </div>
  );
}

// --- Props ---

interface CorridorPanelProps {
  flow: CrossBorderFlow;
  prices: CountryPrice[];
  outages: CountryOutage[];
  onClose: () => void;
}

export default function CorridorPanel({
  flow,
  prices,
  outages,
  onClose,
}: CorridorPanelProps) {
  const fromName = COUNTRY_CENTROIDS[flow.from]?.name || flow.from;
  const toName = COUNTRY_CENTROIDS[flow.to]?.name || flow.to;
  const fromFlag = countryFlag(flow.from);
  const toFlag = countryFlag(flow.to);

  const fromPrice = prices.find((p) => p.iso2 === flow.from);
  const toPrice = prices.find((p) => p.iso2 === flow.to);

  const spread = computeSpread(fromPrice?.price, toPrice?.price);
  const util = utilisationLevel(flow.flowMW, flow.capacityMW);

  const flowProfile = useMemo(
    () =>
      syntheticFlowProfile(
        flow.flowMW,
        fromPrice?.hourly ?? [],
        toPrice?.hourly ?? []
      ),
    [flow.flowMW, fromPrice?.hourly, toPrice?.hourly]
  );

  // Relevant outages: countries on this corridor
  const relevantOutages = useMemo(
    () =>
      outages.filter(
        (o) => o.iso2 === flow.from || o.iso2 === flow.to
      ),
    [outages, flow.from, flow.to]
  );

  const headroom = flow.capacityMW - flow.flowMW;

  const cid = corridorId(flow.from, flow.to);
  const physicalLines = CORRIDOR_LINE_MAP[cid] ?? [];

  return (
    <div className="corridor-panel">
      {/* Header */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors text-base"
        aria-label="Close corridor panel"
      >
        ✕
      </button>

      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 text-sm font-bold text-white">
          <span>{fromFlag}</span>
          <span className="text-slate-300">{fromName}</span>
          <span className="text-slate-500 font-normal mx-1">→</span>
          <span>{toFlag}</span>
          <span className="text-slate-300">{toName}</span>
        </div>
      </div>

      {/* Utilisation */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-widest">
            Utilisation
          </span>
          <span className="text-xs font-bold" style={{ color: util.color }}>
            {util.label} &mdash; {(util.pct * 100).toFixed(0)}%
          </span>
        </div>
        <UtilBar pct={util.pct} color={util.color} />
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Flow</p>
          <p className="text-lg font-bold text-white tabular-nums">
            {flow.flowMW.toLocaleString()}
          </p>
          <p className="text-[10px] text-slate-500">MW</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Capacity</p>
          <p className="text-lg font-bold text-white tabular-nums">
            {flow.capacityMW.toLocaleString()}
          </p>
          <p className="text-[10px] text-slate-500">MW (NTC)</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Headroom</p>
          <p
            className="text-lg font-bold tabular-nums"
            style={{ color: headroom < flow.capacityMW * 0.2 ? '#f87171' : '#4ade80' }}
          >
            {headroom.toLocaleString()}
          </p>
          <p className="text-[10px] text-slate-500">MW available</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Spread</p>
          <p
            className="text-lg font-bold tabular-nums"
            style={{
              color:
                spread == null
                  ? '#64748b'
                  : spread > 5
                  ? '#4ade80'
                  : spread < -5
                  ? '#f87171'
                  : '#facc15',
            }}
          >
            {spread == null
              ? 'N/A'
              : (spread >= 0 ? '+' : '') + spread.toFixed(1)}
          </p>
          <p className="text-[10px] text-slate-500">€/MWh to&minus;from</p>
        </div>
      </div>

      {/* 24h flow profile */}
      <div className="mb-4">
        <h3 className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">
          24h Flow Profile (synthetic)
        </h3>
        <FlowProfile profile={flowProfile} capacityMW={flow.capacityMW} />
        <div className="flex justify-between text-[9px] text-slate-600 mt-0.5 px-1">
          <span>00:00</span>
          <span>12:00</span>
          <span>23:00</span>
        </div>
      </div>

      {/* Price context */}
      {(fromPrice || toPrice) && (
        <div className="border-t border-white/[0.06] pt-3 mb-4">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">
            Day-Ahead Prices
          </h3>
          <div className="flex justify-between text-[11px]">
            {fromPrice && (
              <div>
                <span className="text-slate-500">{fromFlag} {fromName}</span>
                <p className="text-white font-medium tabular-nums">
                  €{fromPrice.price.toFixed(1)}/MWh
                </p>
              </div>
            )}
            {spread != null && (
              <div className="text-center">
                <span className="text-slate-600 text-[10px]">Δ</span>
                <p
                  className="font-bold tabular-nums"
                  style={{ color: spread > 0 ? '#4ade80' : '#f87171' }}
                >
                  {spread > 0 ? '+' : ''}{spread.toFixed(1)}
                </p>
              </div>
            )}
            {toPrice && (
              <div className="text-right">
                <span className="text-slate-500">{toFlag} {toName}</span>
                <p className="text-white font-medium tabular-nums">
                  €{toPrice.price.toFixed(1)}/MWh
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Physical interconnectors for this corridor */}
      <div className="border-t border-white/[0.06] pt-3 mb-4">
        <h3 className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">
          Physical Interconnectors
        </h3>
        {physicalLines.length > 0 ? (
          <ul className="space-y-1">
            {physicalLines.map((name) => (
              <li key={name} className="flex items-center gap-2 text-[11px]">
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: util.color }}
                />
                <span className="text-slate-300">{name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-slate-600 italic">
            No mapped interconnector for this corridor
          </p>
        )}
      </div>

      {/* Outages on corridor countries */}
      {relevantOutages.length > 0 && (
        <div className="border-t border-white/[0.06] pt-3">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">
            Outage Context
          </h3>
          {relevantOutages.map((o) => (
            <div key={o.iso2} className="flex justify-between text-[11px] py-1">
              <span className="text-slate-400">
                {countryFlag(o.iso2)} {o.iso2} &mdash; {o.outageCount} outages
              </span>
              <span className="text-red-400 tabular-nums">
                {o.unavailableMW.toLocaleString()} MW offline
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
