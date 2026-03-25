'use client';

import { FUEL_COLORS } from '@/lib/colors';
import type { SidebarProps } from './SidebarShell';
import type { LayerKey } from '@/lib/store';

const CARD = 'bg-black/60 backdrop-blur-xl border border-white/[0.06] rounded-2xl shadow-2xl';

function Toggle({
  checked,
  onChange,
  label,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="toggle-label">
        <input type="checkbox" checked={checked} onChange={onChange} className="toggle-input" />
        <span className="toggle-track" />
        <span className="text-sm text-slate-300">{label}</span>
      </label>
      {children && checked && (
        <div className="ml-[48px] mt-0.5">{children}</div>
      )}
    </div>
  );
}

function PriceGradient() {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="h-2 flex-1 rounded-full"
        style={{ background: 'linear-gradient(to right, #22c55e 0%, #eab308 50%, #ef4444 100%)' }}
      />
      <span className="text-[10px] text-slate-600 tabular-nums">Local currency/MWh</span>
    </div>
  );
}

function FuelDots() {
  const fuels: { key: string; label: string }[] = [
    { key: 'nuclear', label: 'Nuc' },
    { key: 'wind', label: 'Wind' },
    { key: 'gas', label: 'Gas' },
    { key: 'coal', label: 'Coal' },
  ];
  return (
    <div className="flex gap-2">
      {fuels.map(({ key, label }) => {
        const c = FUEL_COLORS[key] || FUEL_COLORS.other;
        return (
          <span key={key} className="flex items-center gap-1 text-[10px] text-slate-500">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: `rgb(${c[0]},${c[1]},${c[2]})` }}
            />
            {label}
          </span>
        );
      })}
    </div>
  );
}

const LAYER_CONFIG: {
  key: LayerKey;
  label: string;
  hint?: string;
  legend?: 'price' | 'fuels';
}[] = [
  { key: 'prices', label: 'Price Heatmap', legend: 'price' },
  { key: 'flows', label: 'Cross-border Flows', hint: 'Line thickness = flow MW' },
  { key: 'plants', label: 'Power Plants', legend: 'fuels' },
  { key: 'lines', label: 'Transmission Lines' },
  { key: 'genMix', label: 'Day-Ahead Labels' },
  { key: 'tyndp', label: 'TYNDP Pipeline' },
  { key: 'history', label: 'Time Replay' },
];

export default function LayersTab({
  layerVisibility,
  onToggleLayer,
  marketIntelligenceEnabled,
  onToggleMarketIntelligence,
}: SidebarProps) {
  return (
    <div className={`${CARD} p-4`}>
      <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
        Map Layers
      </h2>
      <div className="flex flex-col gap-2.5">
        {LAYER_CONFIG.map(({ key, label, hint, legend }) => (
          <Toggle
            key={key}
            checked={layerVisibility[key]}
            onChange={() => onToggleLayer(key)}
            label={label}
          >
            {legend === 'price' && <PriceGradient />}
            {legend === 'fuels' && <FuelDots />}
            {hint && <span className="text-[10px] text-slate-600">{hint}</span>}
          </Toggle>
        ))}
        <Toggle
          checked={marketIntelligenceEnabled}
          onChange={onToggleMarketIntelligence}
          label="Market Intelligence"
        >
          <span className="text-[10px] text-slate-600">
            Outage Radar + Forecast vs Actual
          </span>
        </Toggle>
      </div>
    </div>
  );
}
