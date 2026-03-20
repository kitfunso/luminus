'use client';

import { FUEL_COLORS, FUEL_LABELS } from '@/lib/colors';

interface SidebarProps {
  plantCount: number;
  countryCount: number;
  lastUpdate: string;
  layerVisibility: {
    plants: boolean;
    prices: boolean;
    flows: boolean;
  };
  onToggleLayer: (layer: 'plants' | 'prices' | 'flows') => void;
  isLoading: boolean;
}

function ColorDot({ color }: { color: [number, number, number, number] }) {
  return (
    <span
      className="inline-block w-3.5 h-3.5 rounded-full mr-2.5 flex-shrink-0"
      style={{
        backgroundColor: `rgba(${color[0]},${color[1]},${color[2]},${color[3] / 255})`,
        boxShadow: `0 0 6px 1px rgba(${color[0]},${color[1]},${color[2]},0.4)`,
      }}
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="toggle-label">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="toggle-input"
      />
      <span className="toggle-track" />
      <span className="text-sm text-slate-300">{label}</span>
    </label>
  );
}

function PriceBar() {
  return (
    <div className="mt-2 space-y-1">
      <div
        className="h-3.5 rounded-full"
        style={{
          background: 'linear-gradient(to right, #00c850 0%, #cccc00 50%, #ff4400 100%)',
        }}
      />
      <div className="flex justify-between text-[10px] text-slate-500 px-0.5">
        <span>0</span>
        <span>50</span>
        <span>100</span>
        <span>150</span>
        <span>200+</span>
      </div>
    </div>
  );
}

function Shimmer() {
  return <div className="h-6 w-16 rounded bg-slate-800 animate-shimmer" />;
}

const CARD =
  'bg-black/60 backdrop-blur-xl border border-white/[0.06] rounded-2xl shadow-2xl';

export default function Sidebar({
  plantCount,
  countryCount,
  lastUpdate,
  layerVisibility,
  onToggleLayer,
  isLoading,
}: SidebarProps) {
  const fuelEntries = Object.entries(FUEL_COLORS).filter(
    ([key]) => key !== 'other' && key !== 'lignite'
  );

  return (
    <div className="absolute top-0 left-0 w-72 h-full z-10 pointer-events-none">
      <div className="m-4 flex flex-col gap-3 pointer-events-auto">
        {/* Header */}
        <div className={`${CARD} p-5`}>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Luminus
          </h1>
          <p className="text-xs text-white/40 mt-1 font-medium tracking-widest uppercase">
            European Energy Grid
          </p>
        </div>

        {/* Layer toggles */}
        <div className={`${CARD} p-4`}>
          <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Layers
          </h2>
          <div className="flex flex-col gap-2.5">
            <Toggle
              checked={layerVisibility.plants}
              onChange={() => onToggleLayer('plants')}
              label="Power Plants"
            />
            <Toggle
              checked={layerVisibility.prices}
              onChange={() => onToggleLayer('prices')}
              label="Price Heatmap"
            />
            <Toggle
              checked={layerVisibility.flows}
              onChange={() => onToggleLayer('flows')}
              label="Cross-border Flows"
            />
          </div>
        </div>

        {/* Fuel legend */}
        <div className={`${CARD} p-4`}>
          <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Fuel Types
          </h2>
          <div className="grid grid-cols-2 gap-y-2 gap-x-2">
            {fuelEntries.map(([key, color]) => (
              <div key={key} className="flex items-center text-xs text-slate-300">
                <ColorDot color={color} />
                <span>{FUEL_LABELS[key] || key}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Price legend */}
        <div className={`${CARD} p-4`}>
          <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
            Day-Ahead Price (EUR/MWh)
          </h2>
          <PriceBar />
        </div>

        {/* Stats */}
        <div className={`${CARD} p-4`}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              {isLoading ? (
                <Shimmer />
              ) : (
                <div className="text-xl font-bold text-sky-400 animate-pulse-glow">
                  {plantCount.toLocaleString()}
                </div>
              )}
              <div className="text-[11px] text-slate-500 mt-0.5">Power Plants</div>
            </div>
            <div>
              {isLoading ? (
                <Shimmer />
              ) : (
                <div className="text-xl font-bold text-sky-400 animate-pulse-glow">
                  {countryCount}
                </div>
              )}
              <div className="text-[11px] text-slate-500 mt-0.5">Countries</div>
            </div>
          </div>
          <div className="text-[11px] text-slate-600 mt-3 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
            Updated {lastUpdate}
          </div>
        </div>
      </div>
    </div>
  );
}
