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

/** Price gradient optimised for dark map backgrounds.
 *  Stepped palette with slightly desaturated, higher-luminance colors.
 *  Negative prices get a distinct teal. */
export function priceToColor(
  price: number,
  minPrice: number = 0,
  maxPrice: number = 200
): [number, number, number, number] {
  // Negative prices: distinct teal
  if (price < 0) return [13, 148, 136, 200];

  const t = Math.max(0, Math.min(1, (price - minPrice) / (maxPrice - minPrice)));

  // Stepped palette: green -> yellow-green -> amber -> orange -> red
  if (t < 0.15) return [34, 197, 94, 200];    // Green: very low
  if (t < 0.3)  return [163, 230, 53, 200];   // Yellow-green: low
  if (t < 0.5)  return [234, 179, 8, 200];    // Amber: moderate
  if (t < 0.75) return [249, 115, 22, 200];   // Orange: high
  return [239, 68, 68, 200];                    // Red: extreme
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

/** Fuel type emoji for generation mix overlay */
export const FUEL_EMOJI: Record<string, string> = {
  nuclear: '\u269B\uFE0F',
  wind: '\uD83D\uDCA8',
  solar: '\u2600\uFE0F',
  gas: '\uD83D\uDD25',
  coal: '\u26CF\uFE0F',
  lignite: '\u26CF\uFE0F',
  hydro: '\uD83D\uDCA7',
  biomass: '\uD83C\uDF3F',
  oil: '\uD83D\uDEE2\uFE0F',
  geothermal: '\uD83C\uDF0B',
  other: '\u26A1',
};
