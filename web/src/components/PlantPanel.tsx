'use client';

import { getFuelColor, normalizeFuel, FUEL_LABELS } from '@/lib/colors';
import { COUNTRY_CENTROIDS } from '@/lib/countries';
import type { PowerPlant } from '@/lib/data-fetcher';

const CAPACITY_FACTORS: Record<string, number> = {
  nuclear: 0.85, wind: 0.25, solar: 0.12, gas: 0.50, coal: 0.65,
  lignite: 0.70, hydro: 0.35, biomass: 0.60, oil: 0.40,
  geothermal: 0.80, other: 0.30,
};

const CO2_FACTORS: Record<string, number> = {
  nuclear: 0, wind: 0, solar: 0, gas: 0.40, coal: 0.90,
  lignite: 1.10, hydro: 0, biomass: 0.23, oil: 0.65,
  geothermal: 0, other: 0.50,
};

interface PlantPanelProps {
  plant: PowerPlant;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className="text-[13px] text-slate-200 font-medium text-right">{value}</span>
    </div>
  );
}

export default function PlantPanel({ plant, onClose }: PlantPanelProps) {
  const fuel = normalizeFuel(plant.fuel);
  const color = getFuelColor(plant.fuel);
  const cf = CAPACITY_FACTORS[fuel] ?? 0.30;
  const co2Factor = CO2_FACTORS[fuel] ?? 0.50;
  const annualGenGWh = (plant.capacity * cf * 8760) / 1000;
  const annualCO2kt = (annualGenGWh * 1000 * co2Factor) / 1000;
  const countryName = COUNTRY_CENTROIDS[plant.country]?.name || plant.country;

  return (
    <div className="plant-panel">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors text-lg"
      >
        ✕
      </button>

      <div className="flex items-center gap-3 mb-4">
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: `rgb(${color[0]},${color[1]},${color[2]})` }}
        />
        <div>
          <h2 className="text-lg font-bold text-white leading-tight">{plant.name}</h2>
          <p className="text-xs text-slate-400">{countryName}</p>
        </div>
      </div>

      <div className="space-y-2.5">
        <Row label="Fuel Type" value={FUEL_LABELS[fuel] || fuel} />
        <Row
          label="Capacity"
          value={`${plant.capacity.toLocaleString()} MW (${(plant.capacity / 1000).toFixed(2)} GW)`}
        />
        <Row label="Commissioned" value={plant.year || 'Unknown'} />
        <Row
          label="Coordinates"
          value={`${plant.lat.toFixed(4)}\u00B0N, ${plant.lon.toFixed(4)}\u00B0E`}
        />

        <div className="border-t border-white/[0.06] pt-3 mt-3">
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
            Estimates
          </h3>
          <Row label="Capacity Factor" value={`${(cf * 100).toFixed(0)}%`} />
          <Row label="Annual Generation" value={`${annualGenGWh.toFixed(0)} GWh`} />
          <Row
            label={`Annual CO\u2082`}
            value={co2Factor > 0 ? `${annualCO2kt.toFixed(0)} kt` : 'Zero emission'}
          />
        </div>
      </div>
    </div>
  );
}
