'use client';

import { useMapStore } from '@/lib/store';

const PLANT_DOTS: readonly { fuel: string; label: string; color: string }[] = [
  { fuel: 'nuclear', label: 'Nuclear', color: '#FACC15' },
  { fuel: 'wind', label: 'Wind', color: '#22D3EE' },
  { fuel: 'solar', label: 'Solar', color: '#FBBf24' },
  { fuel: 'gas', label: 'Gas', color: '#FB923C' },
  { fuel: 'coal', label: 'Coal', color: '#9CA3AF' },
  { fuel: 'hydro', label: 'Hydro', color: '#3B82F6' },
] as const;

const FLOW_TIERS: readonly { height: number; label: string }[] = [
  { height: 2, label: '<500 MW' },
  { height: 4, label: '500\u20132000 MW' },
  { height: 6, label: '>2000 MW' },
] as const;

export default function MapLegend() {
  const layerVisibility = useMapStore((s) => s.layerVisibility);
  const zoom = useMapStore((s) => s.viewState.zoom);

  if (zoom < 3) return null;

  const showPrices = layerVisibility.prices;
  const showFlows = layerVisibility.flows;
  const showPlants = layerVisibility.plants && zoom >= 4;

  if (!showPrices && !showFlows && !showPlants) return null;

  return (
    <div className="map-legend" data-tour-id="price-card" style={{ pointerEvents: 'auto' }}>
      {/* Price heatmap */}
      {showPrices && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest">
            Day-Ahead Price
          </span>
          <div
            className="h-2 w-full rounded-sm"
            style={{
              background:
                'linear-gradient(to right, #22C55E, #A3E635, #EAB308, #F97316, #EF4444)',
            }}
          />
          <div className="flex justify-between">
            <span className="text-[10px] text-slate-500">0</span>
            <span className="text-[10px] text-slate-500">100</span>
            <span className="text-[10px] text-slate-500">200+</span>
          </div>
          <span className="text-[10px] text-slate-600">EUR/MWh</span>
        </div>
      )}

      {/* Cross-border flows */}
      {showFlows && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest">
            Cross-Border Flow
          </span>
          {FLOW_TIERS.map((tier) => (
            <div key={tier.height} className="flex items-center gap-2">
              <div
                className="w-6 rounded-[1px] bg-sky-400 shrink-0"
                style={{ height: `${tier.height}px` }}
              />
              <span className="text-[10px] text-slate-500">{tier.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <svg width={24} height={6} className="shrink-0">
              <line
                x1={0}
                y1={3}
                x2={24}
                y2={3}
                stroke="#38BDF8"
                strokeWidth={1.5}
                strokeDasharray="3 2"
              />
            </svg>
            <span className="text-[10px] text-slate-500">
              &rarr; Direction of flow
            </span>
          </div>
        </div>
      )}

      {/* Power plants */}
      {showPlants && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest">
            Power Plants
          </span>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {PLANT_DOTS.map((p) => (
              <div key={p.fuel} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="text-[10px] text-slate-500">{p.label}</span>
              </div>
            ))}
          </div>
          <span className="text-[10px] text-slate-600">Size = capacity</span>
        </div>
      )}
    </div>
  );
}
