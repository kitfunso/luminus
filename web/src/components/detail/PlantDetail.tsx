'use client';

import { getFuelColor, normalizeFuel, FUEL_LABELS } from '@/lib/colors';
import { COUNTRY_CENTROIDS } from '@/lib/countries';
import type { PowerPlant } from '@/lib/data-fetcher';
import DetailHeader from './DetailHeader';
import KpiRow from './KpiRow';

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

interface PlantDetailProps {
  data: PowerPlant;
  onClose: () => void;
}

export default function PlantDetail({ data, onClose }: PlantDetailProps) {
  const fuel = normalizeFuel(data.fuel);
  const color = getFuelColor(data.fuel);
  const countryName = COUNTRY_CENTROIDS[data.country]?.name ?? data.country;

  const cf = CAPACITY_FACTORS[fuel] ?? 0.30;
  const co2Factor = CO2_FACTORS[fuel] ?? 0.50;
  const annualGenGWh = (data.capacity * cf * 8760) / 1000;
  const annualCO2kt = (annualGenGWh * 1000 * co2Factor) / 1000;

  const fuelDot = (
    <span
      className="w-3 h-3 rounded-full inline-block"
      style={{ backgroundColor: `rgb(${color[0]},${color[1]},${color[2]})` }}
    />
  );

  return (
    <>
      <DetailHeader icon={fuelDot} title={data.name} subtitle={countryName} onClose={onClose} />

      <KpiRow kpis={[
        {
          label: 'Capacity',
          value: data.capacity >= 1000
            ? `${(data.capacity / 1000).toFixed(1)} GW`
            : `${data.capacity.toLocaleString()} MW`,
        },
        {
          label: 'Fuel',
          value: FUEL_LABELS[fuel] ?? fuel,
          color: `rgb(${color[0]},${color[1]},${color[2]})`,
        },
        { label: 'Commissioned', value: data.year || 'Unknown' },
      ]} />

      {/* Estimates */}
      <div className="border-t border-white/[0.06] pt-3">
        <h3 className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Estimates</h3>
        <div className="space-y-2">
          <Row label="Capacity Factor" value={`${(cf * 100).toFixed(0)}%`} />
          <Row label="Annual Generation" value={`${annualGenGWh.toFixed(0)} GWh`} />
          <Row
            label={`Annual CO\u2082`}
            value={co2Factor > 0 ? `${annualCO2kt.toFixed(0)} kt` : 'Zero emission'}
          />
          <Row
            label="Coordinates"
            value={`${data.lat.toFixed(4)}\u00B0N, ${data.lon.toFixed(4)}\u00B0E`}
          />
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className="text-[12px] text-slate-200 font-medium text-right">{value}</span>
    </div>
  );
}
