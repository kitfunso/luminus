/**
 * Tool profiles for conditional MCP tool registration.
 *
 * Each profile groups tools by use case so callers can register
 * only the subset they need, cutting context window cost from a large
 * all-tools surface to a few hundred tokens for focused profiles.
 */

/** Profile name -> list of tool names that belong to it. */
export const PROFILES: Readonly<Record<string, readonly string[]>> = {
  trader: [
    'get_day_ahead_prices',
    'get_intraday_prices',
    'get_balancing_prices',
    'get_imbalance_prices',
    'get_intraday_da_spread',
    'get_commodity_prices',
    'get_price_spread_analysis',
    'get_nordpool_prices',
  ],
  grid: [
    'get_cross_border_flows',
    'get_net_positions',
    'get_transfer_capacities',
    'get_outages',
    'get_eu_frequency',
    'get_transmission_lines',
    'get_power_plants',
    'get_auction_results',
    'get_remit_messages',
    'get_acer_remit',
    'get_grid_connection_queue',
    'get_nged_connection_signal',
    'get_distribution_headroom',
    'get_embedded_capacity_register',
    'get_constraint_breaches',
    'get_ukpn_grid_overview',
    'get_spen_grid_intelligence',
  ],
  generation: [
    'get_generation_mix',
    'get_realtime_generation',
    'get_carbon_intensity',
    'get_renewable_forecast',
    'get_demand_forecast',
    'get_hydro_reservoir',
  ],
  gas: [
    'get_gas_storage',
    'get_lng_terminals',
    'get_us_gas_data',
    'get_eu_gas_price',
    'get_entsog_data',
  ],
  renewables: [
    'get_renewable_forecast',
    'get_solar_irradiance',
    'get_weather_forecast',
    'get_era5_weather',
    'get_hydro_inflows',
  ],
  uk: [
    'get_uk_carbon_intensity',
    'get_uk_grid_demand',
    'get_elexon_bmrs',
  ],
  bess: [
    'get_price_spread_analysis',
    'get_ancillary_prices',
    'get_balancing_actions',
    'get_day_ahead_prices',
    'get_intraday_prices',
    'estimate_site_revenue',
    'get_distribution_headroom',
    'shortlist_bess_sites',
    'get_flexibility_market',
    'get_constraint_breaches',
    'get_embedded_capacity_register',
  ],
  regional: [
    'get_energy_charts',
    'get_smard_data',
    'get_rte_france',
    'get_energi_data',
    'get_fingrid_data',
    'get_regelleistung',
    'get_terna_data',
    'get_ree_esios',
  ],
  weather: [
    'get_weather_forecast',
    'get_solar_irradiance',
    'get_era5_weather',
    'get_stormglass',
    'get_hydro_inflows',
  ],
  gis: [
    'get_solar_irradiance',
    'get_transmission_lines',
    'get_terrain_analysis',
    'get_grid_proximity',
    'get_grid_connection_queue',
    'get_nged_connection_signal',
    'get_distribution_headroom',
    'get_land_constraints',
    'get_land_cover',
    'get_agricultural_land',
    'get_flood_risk',
    'get_grid_connection_intelligence',
    'screen_site',
    'verify_gis_sources',
    'compare_sites',
    'estimate_site_revenue',
    'shortlist_bess_sites',
    'get_embedded_capacity_register',
    'get_flexibility_market',
    'get_constraint_breaches',
    'get_spen_grid_intelligence',
    'get_ukpn_grid_overview',
  ],
} as const;

/** Short descriptions for each profile, used by the discovery tool. */
const PROFILE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  trader: 'Day-ahead, intraday, balancing, and commodity prices for energy trading',
  grid: 'Cross-border flows, outages, transmission, auctions, transmission/DNO connection signals, grid infrastructure, UKPN grid overview, SPEN grid intelligence, embedded capacity, and constraint history',
  generation: 'Generation mix, real-time output, carbon intensity, and demand forecasts',
  gas: 'Gas storage, LNG terminals, US gas data, EU gas prices, and ENTSOG pipelines',
  renewables: 'Wind/solar forecasts, irradiance, ERA5 reanalysis, and hydro inflows',
  uk: 'UK-specific carbon intensity, grid demand, and Elexon BMRS data',
  bess: 'Battery storage arbitrage: spreads, ancillary prices, site revenue, DNO headroom, flex market, constraint breaches, embedded capacity, and shortlist generation',
  regional: 'Country-specific sources: Energy Charts, SMARD, RTE, Energinet, Fingrid, Terna, REE',
  weather: 'Weather forecasts, solar irradiance, ERA5 reanalysis, and marine/offshore data',
  gis: 'GIS site prospecting: solar, terrain, grid proximity, connection signals (NESO TEC + NGED), DNO headroom (SSEN/NPG/UKPN/SPEN), embedded capacity registers, flex market, constraint breaches, SPEN/UKPN grid intelligence, land constraints, land cover, agricultural land, flood risk, site screening, comparison, BESS shortlist, and source verification',
  full: 'All registered data tools by default, plus 2 meta-tools',
};

/**
 * Resolve a profile name to its tool list.
 * Returns `null` for "full" (meaning all tools should be registered).
 * Returns `undefined` if the profile name is unknown.
 */
export function resolveProfile(name: string): string[] | null | undefined {
  if (name === 'full') return null;
  const tools = PROFILES[name];
  if (!tools) return undefined;
  return [...tools];
}

/** Return all known profile names (excluding "full"). */
export function getProfileNames(): string[] {
  return Object.keys(PROFILES);
}

/** One-line description for a profile. Falls back to empty string for unknown profiles. */
export function getProfileDescription(name: string): string {
  return PROFILE_DESCRIPTIONS[name] ?? '';
}

/** Check whether a profile name is valid (including "full"). */
export function isValidProfile(name: string): boolean {
  return name === 'full' || name in PROFILES;
}

/** Total number of unique tools (derived from all profile entries + unassigned). */
export const TOTAL_TOOLS = (() => {
  const allTools = new Set<string>();
  for (const tools of Object.values(PROFILES)) {
    for (const t of tools) allTools.add(t);
  }
  return allTools.size;
})();
