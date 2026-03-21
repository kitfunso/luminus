const test = require('node:test');
const assert = require('node:assert/strict');

const {
  utilisationLevel,
  computeSpread,
  syntheticFlowProfile,
  arcMidpoint,
  corridorId,
  CORRIDOR_LINE_MAP,
  corridorForLine,
  matchCorridorLines,
} = require('./lib/corridor-logic');

// --- utilisationLevel ---

test('utilisationLevel: >80% is Congested', () => {
  const r = utilisationLevel(900, 1000);
  assert.equal(r.label, 'Congested');
  assert.ok(r.pct > 0.8);
});

test('utilisationLevel: 50-80% is Stressed', () => {
  const r = utilisationLevel(600, 1000);
  assert.equal(r.label, 'Stressed');
  assert.ok(r.pct >= 0.5 && r.pct <= 0.8);
});

test('utilisationLevel: <50% is Low', () => {
  const r = utilisationLevel(300, 1000);
  assert.equal(r.label, 'Low');
  assert.ok(r.pct < 0.5);
});

test('utilisationLevel: zero capacity yields Low', () => {
  const r = utilisationLevel(500, 0);
  assert.equal(r.label, 'Low');
  assert.equal(r.pct, 0);
});

// --- computeSpread ---

test('computeSpread: positive spread is "toward"', () => {
  const r = computeSpread(50, 80);
  assert.equal(r.direction, 'toward');
  assert.equal(r.spread, 30);
});

test('computeSpread: negative spread is "away"', () => {
  const r = computeSpread(80, 50);
  assert.equal(r.direction, 'away');
  assert.equal(r.spread, -30);
});

test('computeSpread: near-zero spread is "neutral"', () => {
  const r = computeSpread(50.5, 51.0);
  assert.equal(r.direction, 'neutral');
});

test('computeSpread: null price returns unknown', () => {
  const r = computeSpread(null, 80);
  assert.equal(r.direction, 'unknown');
  assert.equal(r.spread, null);
});

test('computeSpread: label includes EUR sign and MWh', () => {
  const r = computeSpread(40, 65);
  assert.ok(r.label.includes('\u20ac'));
  assert.ok(r.label.includes('MWh'));
});

// --- syntheticFlowProfile ---

test('syntheticFlowProfile: returns 24 values', () => {
  const from = Array.from({ length: 24 }, (_, i) => 50 + i);
  const to = Array.from({ length: 24 }, (_, i) => 70 + i);
  const result = syntheticFlowProfile(500, from, to);
  assert.equal(result.length, 24);
});

test('syntheticFlowProfile: all values are non-negative', () => {
  const from = Array.from({ length: 24 }, () => 100);
  const to = Array.from({ length: 24 }, () => 10);
  const result = syntheticFlowProfile(500, from, to);
  assert.ok(result.every((v) => v >= 0), 'All flows must be >= 0');
});

test('syntheticFlowProfile: falls back to flat when no hourly data', () => {
  const result = syntheticFlowProfile(400, null, null);
  assert.equal(result.length, 24);
  assert.ok(result.every((v) => v === 400));
});

// --- arcMidpoint ---

test('arcMidpoint: midpoint of equidistant points', () => {
  const [lon, lat] = arcMidpoint(0, 0, 10, 10);
  assert.equal(lon, 5);
  assert.equal(lat, 5);
});

test('arcMidpoint: DE-FR midpoint', () => {
  const [lon, lat] = arcMidpoint(10.45, 51.17, 2.35, 46.60);
  assert.ok(Math.abs(lon - 6.4) < 0.1);
  assert.ok(Math.abs(lat - 48.885) < 0.1);
});

// --- corridorId ---

test('corridorId: order-independent', () => {
  assert.equal(corridorId('DE', 'FR'), corridorId('FR', 'DE'));
});

test('corridorId: produces stable string', () => {
  assert.equal(corridorId('DE', 'FR'), 'DE-FR');
});

// --- CORRIDOR_LINE_MAP ---

test('CORRIDOR_LINE_MAP: FR-GB maps IFA and IFA2', () => {
  const names = CORRIDOR_LINE_MAP['FR-GB'];
  assert.ok(Array.isArray(names));
  assert.ok(names.includes('IFA FR-GB'));
  assert.ok(names.includes('IFA2 FR-GB'));
});

test('CORRIDOR_LINE_MAP: has at least 10 corridors', () => {
  assert.ok(Object.keys(CORRIDOR_LINE_MAP).length >= 10);
});

// --- corridorForLine ---

test('corridorForLine: IFA FR-GB returns FR-GB', () => {
  assert.equal(corridorForLine('IFA FR-GB'), 'FR-GB');
});

test('corridorForLine: BritNed NL-GB returns GB-NL', () => {
  assert.equal(corridorForLine('BritNed NL-GB'), 'GB-NL');
});

test('corridorForLine: unknown line returns null', () => {
  assert.equal(corridorForLine('Unknown Line'), null);
});

// --- matchCorridorLines ---

test('matchCorridorLines: returns FR-GB lines from dataset', () => {
  const lines = [
    { name: 'IFA FR-GB', voltage: 400 },
    { name: 'IFA2 FR-GB', voltage: 400 },
    { name: 'Meeden-Diele DE-NL', voltage: 400 },
  ];
  const matched = matchCorridorLines('FR-GB', lines);
  assert.equal(matched.length, 2);
  assert.ok(matched.some((l) => l.name === 'IFA FR-GB'));
  assert.ok(matched.some((l) => l.name === 'IFA2 FR-GB'));
});

test('matchCorridorLines: unknown corridorId returns empty array', () => {
  const lines = [{ name: 'IFA FR-GB', voltage: 400 }];
  const matched = matchCorridorLines('XX-YY', lines);
  assert.deepEqual(matched, []);
});

test('matchCorridorLines: no matching lines returns empty array', () => {
  const lines = [{ name: 'Meeden-Diele DE-NL', voltage: 400 }];
  const matched = matchCorridorLines('FR-GB', lines);
  assert.deepEqual(matched, []);
});
