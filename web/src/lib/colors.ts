/** Fuel type -> RGBA color mapping for power plant markers */
export const FUEL_COLORS: Record<string, [number, number, number, number]> = {
  nuclear: [250, 204, 21, 200],    // yellow
  wind: [34, 211, 238, 200],       // cyan
  solar: [251, 191, 36, 200],      // gold
  gas: [251, 146, 60, 200],        // orange
  coal: [156, 163, 175, 200],      // grey
  lignite: [120, 113, 108, 200],   // dark grey
  hydro: [59, 130, 246, 200],      // blue
  biomass: [74, 222, 128, 200],    // green
  oil: [239, 68, 68, 200],         // red
  geothermal: [168, 85, 247, 200], // purple
  other: [148, 163, 184, 180],     // slate
};

/** Map raw fuel type strings from OPSD data to our categories */
export function normalizeFuel(raw: string): string {
  const lower = (raw || '').toLowerCase();
  if (lower.includes('nuclear')) return 'nuclear';
  if (lower.includes('wind')) return 'wind';
  if (lower.includes('solar') || lower.includes('photovoltaic')) return 'solar';
  if (lower.includes('natural gas') || lower === 'gas') return 'gas';
  if (lower.includes('lignite')) return 'lignite';
  if (lower.includes('coal') || lower.includes('hard coal')) return 'coal';
  if (lower.includes('hydro') || lower.includes('water') || lower.includes('pump')) return 'hydro';
  if (lower.includes('biomass') || lower.includes('biogas') || lower.includes('bioenergy')) return 'biomass';
  if (lower.includes('oil') || lower.includes('petroleum')) return 'oil';
  if (lower.includes('geothermal')) return 'geothermal';
  return 'other';
}

/** Get fuel color with fallback */
export function getFuelColor(fuel: string): [number, number, number, number] {
  return FUEL_COLORS[normalizeFuel(fuel)] ?? FUEL_COLORS.other;
}

/** Price gradient: green (cheap) -> yellow (mid) -> red (expensive) */
export function priceToColor(
  price: number,
  minPrice: number = 0,
  maxPrice: number = 200
): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, (price - minPrice) / (maxPrice - minPrice)));

  if (t < 0.5) {
    // green -> yellow
    const s = t * 2;
    return [Math.round(s * 255), 200, Math.round((1 - s) * 80), 200];
  }
  // yellow -> red
  const s = (t - 0.5) * 2;
  return [255, Math.round((1 - s) * 200), 0, 200];
}

/** Fuel type display labels */
export const FUEL_LABELS: Record<string, string> = {
  nuclear: 'Nuclear',
  wind: 'Wind',
  solar: 'Solar',
  gas: 'Natural Gas',
  coal: 'Coal',
  lignite: 'Lignite',
  hydro: 'Hydro',
  biomass: 'Biomass',
  oil: 'Oil',
  geothermal: 'Geothermal',
  other: 'Other',
};

/** 7 filter categories shown in the sidebar UI */
export const FILTER_FUELS = [
  'nuclear', 'wind', 'solar', 'gas', 'coal', 'hydro', 'other',
] as const;

/** Map detailed fuel types to the 7 filter categories */
export const FUEL_FILTER_MAP: Record<string, string> = {
  nuclear: 'nuclear',
  wind: 'wind',
  solar: 'solar',
  gas: 'gas',
  coal: 'coal',
  lignite: 'coal',
  hydro: 'hydro',
  biomass: 'other',
  oil: 'other',
  geothermal: 'other',
  other: 'other',
};

/** Filter fuel display labels */
export const FILTER_FUEL_LABELS: Record<string, string> = {
  nuclear: 'Nuclear',
  wind: 'Wind',
  solar: 'Solar',
  gas: 'Gas',
  coal: 'Coal',
  hydro: 'Hydro',
  other: 'Other',
};
