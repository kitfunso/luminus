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
}

function ColorDot({ color }: { color: [number, number, number, number] }) {
  return (
    <span
      className="inline-block w-3 h-3 rounded-full mr-2 flex-shrink-0"
      style={{ backgroundColor: `rgba(${color[0]},${color[1]},${color[2]},${color[3] / 255})` }}
    />
  );
}

function PriceBar() {
  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="text-xs text-slate-400">0</span>
      <div
        className="flex-1 h-3 rounded-sm"
        style={{
          background: 'linear-gradient(to right, #00c850, #cccc00, #ff4400)',
        }}
      />
      <span className="text-xs text-slate-400">200+</span>
    </div>
  );
}

export default function Sidebar({
  plantCount,
  countryCount,
  lastUpdate,
  layerVisibility,
  onToggleLayer,
}: SidebarProps) {
  const fuelEntries = Object.entries(FUEL_COLORS).filter(
    ([key]) => key !== 'other' && key !== 'lignite'
  );

  return (
    <div className="absolute top-0 left-0 w-72 h-full z-10 pointer-events-none">
      <div className="m-4 pointer-events-auto">
        {/* Header */}
        <div className="bg-[#0a0e17]/90 backdrop-blur-md border border-slate-700/50 rounded-xl p-5 mb-3">
          <h1 className="text-lg font-bold text-sky-400 tracking-tight">
            Luminus
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            European Energy Grid
          </p>
        </div>

        {/* Layer toggles */}
        <div className="bg-[#0a0e17]/90 backdrop-blur-md border border-slate-700/50 rounded-xl p-4 mb-3">
          <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
            Layers
          </h2>
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={layerVisibility.plants}
              onChange={() => onToggleLayer('plants')}
              className="accent-sky-400"
            />
            <span className="text-sm">Power Plants</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={layerVisibility.prices}
              onChange={() => onToggleLayer('prices')}
              className="accent-sky-400"
            />
            <span className="text-sm">Price Heatmap</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={layerVisibility.flows}
              onChange={() => onToggleLayer('flows')}
              className="accent-sky-400"
            />
            <span className="text-sm">Cross-border Flows</span>
          </label>
        </div>

        {/* Fuel legend */}
        <div className="bg-[#0a0e17]/90 backdrop-blur-md border border-slate-700/50 rounded-xl p-4 mb-3">
          <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
            Fuel Types
          </h2>
          <div className="grid grid-cols-2 gap-y-1.5 gap-x-2">
            {fuelEntries.map(([key, color]) => (
              <div key={key} className="flex items-center text-xs">
                <ColorDot color={color} />
                <span>{FUEL_LABELS[key] || key}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Price legend */}
        <div className="bg-[#0a0e17]/90 backdrop-blur-md border border-slate-700/50 rounded-xl p-4 mb-3">
          <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Day-Ahead Price (EUR/MWh)
          </h2>
          <PriceBar />
        </div>

        {/* Stats */}
        <div className="bg-[#0a0e17]/90 backdrop-blur-md border border-slate-700/50 rounded-xl p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-lg font-bold text-sky-400">{plantCount.toLocaleString()}</div>
              <div className="text-xs text-slate-400">Power Plants</div>
            </div>
            <div>
              <div className="text-lg font-bold text-sky-400">{countryCount}</div>
              <div className="text-xs text-slate-400">Countries</div>
            </div>
          </div>
          <div className="text-xs text-slate-500 mt-3">
            Updated {lastUpdate}
          </div>
        </div>
      </div>
    </div>
  );
}
