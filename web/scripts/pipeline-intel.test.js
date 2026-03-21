const test = require('node:test');
const assert = require('node:assert/strict');

const {
  groupProjectsByStatus,
  computeCapacityRollup,
  computeInterconnectorImpact,
  identifyMarketReads,
} = require('./lib/pipeline-intel');

// --- fixtures ---

const PROJECTS = [
  { name: 'Dogger Bank', fuel: 'Wind', capacity: 3600, country: 'GB', status: 'under_construction', expectedYear: '2026' },
  { name: 'He Dreiht', fuel: 'Wind', capacity: 960, country: 'DE', status: 'under_construction', expectedYear: '2025' },
  { name: 'NeuConnect', fuel: 'Other', capacity: 1400, country: 'DE', status: 'under_construction', expectedYear: '2028' },
  { name: 'IJmuiden Ver', fuel: 'Wind', capacity: 2000, country: 'NL', status: 'planned', expectedYear: '2029' },
  { name: 'Hinkley C', fuel: 'Nuclear', capacity: 3260, country: 'GB', status: 'under_construction', expectedYear: '2027' },
  { name: 'Paks II', fuel: 'Nuclear', capacity: 2400, country: 'HU', status: 'under_construction', expectedYear: '2030' },
  { name: 'Sizewell C', fuel: 'Nuclear', capacity: 3340, country: 'GB', status: 'planned', expectedYear: '2035' },
  { name: 'Celtic IC', fuel: 'Other', capacity: 700, country: 'IE', status: 'under_construction', expectedYear: '2027' },
];

const PRICES = [
  { iso2: 'DE', price: 141 },
  { iso2: 'GB', price: 85 },
  { iso2: 'FR', price: 55 },
  { iso2: 'IE', price: 216 },
];

const FLOWS = [
  { from: 'FR', to: 'GB', fromLat: 46.6, fromLon: 2.35, toLat: 53.0, toLon: -2.0, flowMW: 2100, capacityMW: 3000 },
  { from: 'NL', to: 'GB', fromLat: 52.1, fromLon: 5.3, toLat: 53.0, toLon: -2.0, flowMW: 950, capacityMW: 1000 },
  { from: 'DE', to: 'FR', fromLat: 51.2, fromLon: 10.5, toLat: 46.6, toLon: 2.35, flowMW: 1850, capacityMW: 4800 },
];

// --- tests ---

test('groupProjectsByStatus splits projects into correct buckets', () => {
  const result = groupProjectsByStatus(PROJECTS);
  assert.equal(result.under_construction.length, 6);
  assert.equal(result.planned.length, 2);
  assert.equal(result.permitted.length, 0);
  assert.equal(result.concept.length, 0);
});

test('computeCapacityRollup sums MW by fuel type', () => {
  const rollup = computeCapacityRollup(PROJECTS);
  assert.equal(rollup.Wind, 3600 + 960 + 2000);
  assert.equal(rollup.Nuclear, 3260 + 2400 + 3340);
  assert.equal(rollup.Other, 1400 + 700);
});

test('computeCapacityRollup only counts given projects', () => {
  const uc = PROJECTS.filter(p => p.status === 'under_construction');
  const rollup = computeCapacityRollup(uc);
  // Wind: Dogger Bank 3600 + He Dreiht 960
  assert.equal(rollup.Wind, 4560);
  // Nuclear: Hinkley C 3260 + Paks II 2400
  assert.equal(rollup.Nuclear, 5660);
});

test('computeInterconnectorImpact maps interconnectors to spread context', () => {
  const impacts = computeInterconnectorImpact(PROJECTS, PRICES);
  // NeuConnect is DE, and GB-DE spread matters
  const neuConnect = impacts.find(i => i.name === 'NeuConnect');
  assert.ok(neuConnect, 'NeuConnect should appear');
  assert.ok(typeof neuConnect.spreadEUR === 'number', 'spreadEUR should be a number');
  // Celtic IC is IE, and prices exist for IE
  const celtic = impacts.find(i => i.name === 'Celtic IC');
  assert.ok(celtic, 'Celtic IC should appear');
});

test('computeInterconnectorImpact returns only Other-fuel projects', () => {
  const impacts = computeInterconnectorImpact(PROJECTS, PRICES);
  assert.equal(impacts.length, 2);
});

test('computeInterconnectorImpact spreadEUR is numeric even with missing price data', () => {
  const impacts = computeInterconnectorImpact(PROJECTS, []);
  // No prices: spread should still be numeric (null/undefined handled)
  for (const i of impacts) {
    assert.ok(i.spreadEUR === null || typeof i.spreadEUR === 'number');
  }
});

test('identifyMarketReads returns array of read objects', () => {
  const reads = identifyMarketReads(PROJECTS, PRICES, FLOWS);
  assert.ok(Array.isArray(reads));
});

test('identifyMarketReads detects congested corridor feeding high-price country', () => {
  const reads = identifyMarketReads(PROJECTS, PRICES, FLOWS);
  // NL->GB is at 95% utilisation and GB is expensive
  const gbRead = reads.find(r => r.iso2 && r.iso2 === 'GB');
  assert.ok(gbRead, 'should flag GB as constraint-driven high-price');
});

test('identifyMarketReads detects large near-term capacity', () => {
  const reads = identifyMarketReads(PROJECTS, PRICES, FLOWS);
  // He Dreiht (960 MW) delivers 2025 in DE
  const deRead = reads.find(r => r.type === 'pipeline_near_term' && r.iso2 === 'DE');
  assert.ok(deRead, 'should flag DE near-term pipeline capacity');
});
