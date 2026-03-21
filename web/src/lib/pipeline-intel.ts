/**
 * pipeline-intel.ts
 *
 * Pure functions for TYNDP pipeline intelligence and market-read derivation.
 * No I/O, no side effects.
 */

import type { TyndpProject } from './tyndp';
import type { CountryPrice, CrossBorderFlow } from './data-fetcher';

export type StatusBucket = Record<TyndpProject['status'], TyndpProject[]>;

/**
 * Group TYNDP projects by status bucket.
 */
export function groupProjectsByStatus(projects: TyndpProject[]): StatusBucket {
  const buckets: StatusBucket = {
    under_construction: [],
    permitted: [],
    planned: [],
    concept: [],
  };
  for (const p of projects) {
    buckets[p.status].push(p);
  }
  return buckets;
}

/**
 * Sum capacity (MW) by fuel type across a list of projects.
 */
export function computeCapacityRollup(projects: TyndpProject[]): Record<string, number> {
  const rollup: Record<string, number> = {};
  for (const p of projects) {
    rollup[p.fuel] = (rollup[p.fuel] || 0) + p.capacity;
  }
  return rollup;
}

export interface InterconnectorImpact {
  name: string;
  capacity: number;
  country: string;
  expectedYear: string;
  status: TyndpProject['status'];
  countryPrice: number | null;
  avgPrice: number | null;
  spreadEUR: number | null;
}

/**
 * For each interconnector project (fuel === 'Other'), look up the country
 * price vs EU average and compute the spread that gives context for its value.
 */
export function computeInterconnectorImpact(
  projects: TyndpProject[],
  prices: CountryPrice[]
): InterconnectorImpact[] {
  const priceMap: Record<string, number> = {};
  for (const p of prices) priceMap[p.iso2] = p.price;

  const allPrices = Object.values(priceMap);
  const avgPrice =
    allPrices.length > 0
      ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length
      : null;

  const interconnectors = projects.filter((p) => p.fuel === 'Other');

  const impacts: InterconnectorImpact[] = interconnectors.map((p) => {
    const countryPrice = priceMap[p.country] != null ? priceMap[p.country] : null;
    const spreadEUR =
      countryPrice != null && avgPrice != null
        ? Math.round((countryPrice - avgPrice) * 10) / 10
        : null;
    return {
      name: p.name,
      capacity: p.capacity,
      country: p.country,
      expectedYear: p.expectedYear,
      status: p.status,
      countryPrice,
      avgPrice,
      spreadEUR,
    };
  });

  return impacts.sort((a, b) => {
    const aAbs = a.spreadEUR != null ? Math.abs(a.spreadEUR) : 0;
    const bAbs = b.spreadEUR != null ? Math.abs(b.spreadEUR) : 0;
    return bAbs - aAbs;
  });
}

export interface MarketRead {
  type: 'congestion_price_driver' | 'pipeline_near_term' | 'interconnector_spread';
  label: string;
  detail: string;
  iso2?: string;
}

/**
 * Derive compact "market reads" from pipeline + live data.
 *
 * Each read describes a decision-relevant pattern:
 * - congestion_price_driver: stressed corridor feeding an expensive country
 * - pipeline_near_term: significant capacity arriving within 2 years
 * - interconnector_spread: high-spread market with an incoming interconnector
 */
export function identifyMarketReads(
  projects: TyndpProject[],
  prices: CountryPrice[],
  flows: CrossBorderFlow[]
): MarketRead[] {
  const reads: MarketRead[] = [];
  const currentYear = new Date().getFullYear();

  const priceMap: Record<string, number> = {};
  for (const p of prices) priceMap[p.iso2] = p.price;

  const allPrices = Object.values(priceMap);
  const avgPrice =
    allPrices.length > 0
      ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length
      : 100;

  // 1. Congested corridors → expensive destination
  for (const flow of flows) {
    if (flow.capacityMW <= 0) continue;
    const util = flow.flowMW / flow.capacityMW;
    if (util < 0.7) continue;
    const toPrice = priceMap[flow.to];
    if (toPrice == null) continue;
    if (toPrice < avgPrice * 1.1) continue;
    reads.push({
      type: 'congestion_price_driver',
      label: `${flow.from}\u2192${flow.to} at ${(util * 100).toFixed(0)}% capacity`,
      detail: `Corridor stress is holding ${flow.to} price above avg. Adding cross-border capacity here would compress the spread.`,
      iso2: flow.to,
    });
  }

  // 2. Near-term large pipeline capacity (within 2 years, ≥ 500 MW)
  const nearTermCutoff = currentYear + 2;
  const byCountry: Record<string, TyndpProject[]> = {};
  for (const p of projects) {
    if (p.status !== 'under_construction' && p.status !== 'permitted') continue;
    if (parseInt(p.expectedYear) > nearTermCutoff) continue;
    if (p.capacity < 500) continue;
    if (!byCountry[p.country]) byCountry[p.country] = [];
    byCountry[p.country].push(p);
  }
  for (const [iso2, projs] of Object.entries(byCountry)) {
    const totalMW = projs.reduce((s, p) => s + p.capacity, 0);
    const names = projs.map((p) => p.name).join(', ');
    reads.push({
      type: 'pipeline_near_term',
      label: `${iso2}: ${(totalMW / 1000).toFixed(1)} GW arriving by ${nearTermCutoff}`,
      detail: names,
      iso2,
    });
  }

  // 3. Interconnectors entering high-spread markets
  const impacts = computeInterconnectorImpact(projects, prices);
  for (const ic of impacts) {
    if (ic.spreadEUR == null || Math.abs(ic.spreadEUR) < 20) continue;
    const direction = ic.spreadEUR > 0 ? 'above' : 'below';
    reads.push({
      type: 'interconnector_spread',
      label: `${ic.name}: ${ic.spreadEUR > 0 ? '+' : ''}€${ic.spreadEUR}/MWh vs EU avg`,
      detail: `${ic.country} is €${Math.abs(ic.spreadEUR).toFixed(0)} ${direction} EU avg. When this ${ic.capacity.toLocaleString()} MW link opens (${ic.expectedYear}), expect spread compression.`,
      iso2: ic.country,
    });
  }

  return reads;
}
