import type { CountryForecast, CountryPrice, CrossBorderFlow } from './data-fetcher';
import { COUNTRY_CENTROIDS } from './countries';

/** Rough typical demand by country (MW) for relative renewable share estimation */
const TYPICAL_DEMAND_MW: Record<string, number> = {
  DE: 55000, FR: 50000, GB: 35000, ES: 28000, IT: 32000,
  NL: 14000, BE: 10000, PL: 22000, AT: 7000, CH: 6500,
  CZ: 7000, SE: 15000, NO: 14000, DK: 4000, FI: 9000,
  PT: 5500, GR: 5500, RO: 6000, HU: 4500, BG: 4000,
  HR: 2000, SK: 3000, SI: 1500, IE: 3500, LT: 1500,
  LV: 1000, EE: 1000, LU: 700,
};

/** Price thresholds (EUR/MWh) */
const NEGATIVE_THRESHOLD = 0;
const VERY_LOW_THRESHOLD = 10;
const LOW_THRESHOLD = 25;

export interface CurtailmentRisk {
  iso2: string;
  name: string;
  riskLevel: 'high' | 'medium' | 'low' | 'none';
  renewableForecastMW: number;
  priceEur: number;
  netExportMW: number;
  reason: string;
}

/**
 * Assess renewable curtailment risk per country.
 *
 * Risk levels:
 *  - high: negative prices AND high renewable forecast
 *  - medium: very low prices (<10 EUR) AND renewables > 50% of typical demand
 *  - low: low prices AND some renewable surplus
 *  - none: normal conditions
 */
export function assessCurtailmentRisk(
  forecasts: CountryForecast[],
  prices: CountryPrice[],
  flows: CrossBorderFlow[],
): CurtailmentRisk[] {
  const priceMap = new Map<string, number>();
  for (const p of prices) priceMap.set(p.iso2, p.price);

  // Compute net exports per country (positive = net exporter)
  const netExportMap = new Map<string, number>();
  for (const f of flows) {
    netExportMap.set(f.from, (netExportMap.get(f.from) ?? 0) + f.flowMW);
    netExportMap.set(f.to, (netExportMap.get(f.to) ?? 0) - f.flowMW);
  }

  return forecasts.map((fc) => {
    const price = priceMap.get(fc.iso2) ?? 0;
    const renewableMW = fc.wind.forecastMW + fc.solar.forecastMW;
    const netExport = netExportMap.get(fc.iso2) ?? 0;
    const typicalDemand = TYPICAL_DEMAND_MW[fc.iso2] ?? 10000;
    const renewableShare = renewableMW / typicalDemand;
    const name = COUNTRY_CENTROIDS[fc.iso2]?.name ?? fc.country;

    let riskLevel: CurtailmentRisk['riskLevel'] = 'none';
    let reason = 'Normal conditions';

    if (price <= NEGATIVE_THRESHOLD && renewableShare > 0.4) {
      riskLevel = 'high';
      reason = `Negative prices (${price.toFixed(0)} EUR) with ${(renewableShare * 100).toFixed(0)}% renewable share`;
      if (netExport > 0) {
        reason += `, already exporting ${netExport.toLocaleString()} MW`;
      }
    } else if (price < VERY_LOW_THRESHOLD && renewableShare > 0.5) {
      riskLevel = 'medium';
      reason = `Very low prices (${price.toFixed(0)} EUR) with ${(renewableShare * 100).toFixed(0)}% renewable share`;
    } else if (price < LOW_THRESHOLD && renewableShare > 0.3) {
      riskLevel = 'low';
      reason = `Low prices (${price.toFixed(0)} EUR) with elevated renewables`;
    }

    return {
      iso2: fc.iso2,
      name,
      riskLevel,
      renewableForecastMW: Math.round(renewableMW),
      priceEur: price,
      netExportMW: Math.round(netExport),
      reason,
    };
  }).sort((a, b) => {
    const order: Record<CurtailmentRisk['riskLevel'], number> = { high: 0, medium: 1, low: 2, none: 3 };
    return order[a.riskLevel] - order[b.riskLevel];
  });
}
