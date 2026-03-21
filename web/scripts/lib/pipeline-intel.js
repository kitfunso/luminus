/**
 * pipeline-intel.js
 *
 * Pure functions for TYNDP pipeline intelligence and market-read derivation.
 * Used by both the test suite (CommonJS) and the frontend (TS import from src/lib/pipeline-intel.ts).
 *
 * No I/O, no side effects.
 */

'use strict';

/**
 * Group TYNDP projects by status bucket.
 * @param {Array} projects
 * @returns {{ under_construction: Array, permitted: Array, planned: Array, concept: Array }}
 */
function groupProjectsByStatus(projects) {
  const buckets = {
    under_construction: [],
    permitted: [],
    planned: [],
    concept: [],
  };
  for (const p of projects) {
    const key = p.status;
    if (key in buckets) buckets[key].push(p);
  }
  return buckets;
}

/**
 * Sum capacity (MW) by fuel type across a list of projects.
 * @param {Array} projects
 * @returns {Record<string, number>}
 */
function computeCapacityRollup(projects) {
  const rollup = {};
  for (const p of projects) {
    rollup[p.fuel] = (rollup[p.fuel] || 0) + p.capacity;
  }
  return rollup;
}

/**
 * For each interconnector project (fuel === 'Other'), look up the nearest
 * country price and the EU average, and compute a spread value that gives
 * context for why the interconnector matters.
 *
 * Returns an array of impact objects sorted by abs(spreadEUR) descending.
 *
 * @param {Array} projects
 * @param {Array} prices  - [{ iso2, price }, ...]
 * @returns {Array<{ name, capacity, country, expectedYear, status, spreadEUR: number|null, countryPrice: number|null, avgPrice: number|null }>}
 */
function computeInterconnectorImpact(projects, prices) {
  const priceMap = {};
  for (const p of prices) priceMap[p.iso2] = p.price;

  const allPrices = Object.values(priceMap);
  const avgPrice = allPrices.length > 0
    ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length
    : null;

  const interconnectors = projects.filter(p => p.fuel === 'Other');

  const impacts = interconnectors.map(p => {
    const countryPrice = priceMap[p.country] != null ? priceMap[p.country] : null;
    const spreadEUR = countryPrice != null && avgPrice != null
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

/**
 * Derive compact "market reads" from pipeline + live data.
 *
 * Each read has: { type, label, detail, iso2? }
 *
 * Types:
 *  - 'congestion_price_driver'  : corridor near capacity feeding expensive country
 *  - 'pipeline_near_term'       : significant capacity delivering within 2 years
 *  - 'interconnector_spread'    : high-spread country with incoming interconnector
 *
 * @param {Array} projects
 * @param {Array} prices
 * @param {Array} flows
 * @returns {Array<{ type: string, label: string, detail: string, iso2?: string }>}
 */
function identifyMarketReads(projects, prices, flows) {
  const reads = [];
  const now = new Date();
  const currentYear = now.getFullYear();

  const priceMap = {};
  for (const p of prices) priceMap[p.iso2] = p.price;

  const allPrices = Object.values(priceMap);
  const avgPrice = allPrices.length > 0
    ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length
    : 100;

  // 1. Congested corridors -> expensive destination
  for (const flow of flows) {
    if (flow.capacityMW <= 0) continue;
    const util = flow.flowMW / flow.capacityMW;
    if (util < 0.7) continue; // only flag genuinely stressed corridors
    const toPrice = priceMap[flow.to];
    if (toPrice == null) continue;
    if (toPrice < avgPrice * 1.1) continue; // destination must be notably expensive
    reads.push({
      type: 'congestion_price_driver',
      label: `${flow.from}\u2192${flow.to} at ${(util * 100).toFixed(0)}% capacity`,
      detail: `Corridor stress is holding ${flow.to} price above avg. Adding cross-border capacity here would compress the spread.`,
      iso2: flow.to,
    });
  }

  // 2. Near-term large pipeline capacity (within 2 years, >= 500 MW)
  const nearTermYearCutoff = currentYear + 2;
  const byCountryNearTerm = {};
  for (const p of projects) {
    if (p.status !== 'under_construction' && p.status !== 'permitted') continue;
    if (parseInt(p.expectedYear) > nearTermYearCutoff) continue;
    if (p.capacity < 500) continue;
    if (!byCountryNearTerm[p.country]) byCountryNearTerm[p.country] = [];
    byCountryNearTerm[p.country].push(p);
  }
  for (const [iso2, projs] of Object.entries(byCountryNearTerm)) {
    const totalMW = projs.reduce((s, p) => s + p.capacity, 0);
    const names = projs.map(p => p.name).join(', ');
    reads.push({
      type: 'pipeline_near_term',
      label: `${iso2}: ${(totalMW / 1000).toFixed(1)} GW arriving by ${nearTermYearCutoff}`,
      detail: names,
      iso2,
    });
  }

  // 3. Interconnectors entering markets with large spreads
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

module.exports = {
  groupProjectsByStatus,
  computeCapacityRollup,
  computeInterconnectorImpact,
  identifyMarketReads,
};
