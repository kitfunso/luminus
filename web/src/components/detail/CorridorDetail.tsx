'use client';

import { useMemo } from 'react';
import { COUNTRY_CENTROIDS } from '@/lib/countries';
import { corridorId, CORRIDOR_LINE_MAP } from '@/lib/corridor-lines';
import type { CrossBorderFlow, CountryPrice, CountryOutage } from '@/lib/data-fetcher';
import DetailHeader from './DetailHeader';
import KpiRow from './KpiRow';
import MiniChart from './MiniChart';

function countryFlag(iso2: string) {
  return [...iso2.toUpperCase()].map((c) =>
    String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)
  ).join('');
}

function utilisationLevel(flowMW: number, capacityMW: number) {
  const pct = capacityMW > 0 ? flowMW / capacityMW : 0;
  if (pct > 0.8) return { pct, label: 'Congested', color: '#f87171' };
  if (pct > 0.5) return { pct, label: 'Stressed', color: '#facc15' };
  return { pct, label: 'Low', color: '#4ade80' };
}

function syntheticFlowProfile(avgFlow: number, fromH: number[], toH: number[]): number[] {
  if (!fromH?.length || !toH?.length) return Array(24).fill(Math.round(avgFlow));
  const len = Math.min(24, fromH.length, toH.length);
  const spreads: number[] = [];
  for (let i = 0; i < len; i++) spreads.push(toH[i] - fromH[i]);
  const avg = spreads.reduce((a, b) => a + b, 0) / len;
  const maxAbs = Math.max(1, ...spreads.map(Math.abs));
  return spreads.map((sp) => Math.max(0, Math.round(avgFlow + ((sp - avg) / (2 * maxAbs)) * avgFlow * 0.8)));
}

interface CorridorDetailProps {
  data: CrossBorderFlow;
  prices: CountryPrice[];
  outages: CountryOutage[];
  onClose: () => void;
}

export default function CorridorDetail({ data, prices, outages, onClose }: CorridorDetailProps) {
  const fromName = COUNTRY_CENTROIDS[data.from]?.name ?? data.from;
  const toName = COUNTRY_CENTROIDS[data.to]?.name ?? data.to;
  const fromFlag = countryFlag(data.from);
  const toFlag = countryFlag(data.to);

  const fromPrice = prices.find((p) => p.iso2 === data.from);
  const toPrice = prices.find((p) => p.iso2 === data.to);

  const spread = fromPrice && toPrice
    ? Math.round((toPrice.price - fromPrice.price) * 10) / 10
    : null;

  const util = utilisationLevel(data.flowMW, data.capacityMW);
  const headroomRaw = data.capacityMW - data.flowMW;
  const isOverflow = headroomRaw < 0;
  const headroomAbs = Math.abs(headroomRaw);

  const flowProfile = useMemo(
    () => syntheticFlowProfile(data.flowMW, fromPrice?.hourly ?? [], toPrice?.hourly ?? []),
    [data.flowMW, fromPrice?.hourly, toPrice?.hourly],
  );

  const relevantOutages = useMemo(
    () => outages.filter((o) => o.iso2 === data.from || o.iso2 === data.to),
    [outages, data.from, data.to],
  );

  const cid = corridorId(data.from, data.to);
  const physicalLines = CORRIDOR_LINE_MAP[cid] ?? [];

  return (
    <>
      <DetailHeader
        icon={<span className="text-sm">{fromFlag}</span>}
        title={`${fromName} \u2192 ${toName}`}
        subtitle={`Cross-border corridor \u2022 ${toFlag}`}
        onClose={onClose}
      />

      <KpiRow kpis={[
        {
          label: 'Utilisation',
          value: `${(util.pct * 100).toFixed(0)}%`,
          color: util.color,
          sublabel: util.label,
          bar: { pct: util.pct, color: util.color },
        },
        { label: 'Flow', value: data.flowMW.toLocaleString(), sublabel: 'MW' },
        {
          label: isOverflow ? 'Overflow' : 'Headroom',
          value: `${isOverflow ? '+' : ''}${headroomAbs.toLocaleString()}`,
          color: isOverflow ? '#f87171' : headroomAbs < data.capacityMW * 0.2 ? '#facc15' : '#4ade80',
          sublabel: isOverflow ? 'MW above cap' : 'MW available',
        },
        {
          label: 'Spread',
          value: spread == null ? 'N/A' : `${spread >= 0 ? '+' : ''}${spread.toFixed(1)}`,
          color: spread == null ? '#64748b' : spread > 5 ? '#4ade80' : spread < -5 ? '#f87171' : '#facc15',
          sublabel: '\u20AC/MWh',
        },
      ]} />

      {/* 24h flow profile */}
      <div className="mb-4">
        <h3 className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">24h Flow Profile</h3>
        <MiniChart data={flowProfile} labels={['00:00', '12:00', '23:00']} ceiling={data.capacityMW} />
      </div>

      {/* Price context */}
      {(fromPrice || toPrice) && (
        <div className="border-t border-white/[0.06] pt-3 mb-4">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Day-Ahead Prices</h3>
          <div className="flex justify-between text-[11px]">
            {fromPrice && (
              <div>
                <span className="text-slate-500">{fromFlag} {fromName}</span>
                <p className="text-white font-medium tabular-nums">&euro;{fromPrice.price.toFixed(1)}/MWh</p>
              </div>
            )}
            {spread != null && (
              <div className="text-center">
                <span className="text-slate-600 text-[10px]">&Delta;</span>
                <p className="font-bold tabular-nums" style={{ color: spread > 0 ? '#4ade80' : '#f87171' }}>
                  {spread > 0 ? '+' : ''}{spread.toFixed(1)}
                </p>
              </div>
            )}
            {toPrice && (
              <div className="text-right">
                <span className="text-slate-500">{toFlag} {toName}</span>
                <p className="text-white font-medium tabular-nums">&euro;{toPrice.price.toFixed(1)}/MWh</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Physical interconnectors */}
      <div className="border-t border-white/[0.06] pt-3 mb-4">
        <h3 className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Physical Interconnectors</h3>
        {physicalLines.length > 0 ? (
          <ul className="space-y-1">
            {physicalLines.map((n) => (
              <li key={n} className="flex items-center gap-2 text-[11px]">
                <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: util.color }} />
                <span className="text-slate-300">{n}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-slate-600 italic">No mapped interconnector for this corridor</p>
        )}
      </div>

      {/* Outages */}
      {relevantOutages.length > 0 && (
        <div className="border-t border-white/[0.06] pt-3">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Outage Context</h3>
          {relevantOutages.map((o) => (
            <div key={o.iso2} className="flex justify-between text-[11px] py-1">
              <span className="text-slate-400">{countryFlag(o.iso2)} {o.iso2} &mdash; {o.outageCount} outages</span>
              <span className="text-red-400 tabular-nums">{o.unavailableMW.toLocaleString()} MW offline</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
