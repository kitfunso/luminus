'use strict';

/**
 * Tests for watchlist and alert logic (pure Node, no DOM).
 *
 * We test the pure logic functions directly since the modules use localStorage
 * in the browser. We extract and test the logic inline here.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// ---- Watchlist logic (extracted from lib/watchlist.ts) ----

function plantId(name) {
  return `plant:${name.toLowerCase().replace(/\s+/g, '-')}`;
}

function countryId(iso2) {
  return `country:${iso2.toUpperCase()}`;
}

function corridorId(from, to) {
  const [a, b] = [from, to].sort();
  return `corridor:${a}-${b}`;
}

// In-memory watchlist for tests
function makeWatchlistStore() {
  let items = [];

  function load() { return items; }
  function save(next) { items = next; }

  function isWatched(id) {
    return items.some((i) => i.id === id);
  }

  function pinItem(item) {
    if (isWatched(item.id)) return items;
    const next = [{ ...item, pinnedAt: new Date().toISOString() }, ...items];
    save(next);
    return next;
  }

  function unpinItem(id) {
    const next = items.filter((i) => i.id !== id);
    save(next);
    return next;
  }

  function togglePin(item) {
    if (isWatched(item.id)) return { items: unpinItem(item.id), pinned: false };
    return { items: pinItem(item), pinned: true };
  }

  function clearWatchlist() { save([]); return []; }

  return { isWatched, pinItem, unpinItem, togglePin, clearWatchlist, load };
}

test('plantId generates stable slug', () => {
  assert.equal(plantId('Hinkley Point'), 'plant:hinkley-point');
  assert.equal(plantId('NUCLEAR PLANT'), 'plant:nuclear-plant');
});

test('countryId is uppercase', () => {
  assert.equal(countryId('de'), 'country:DE');
  assert.equal(countryId('GB'), 'country:GB');
});

test('corridorId is canonical (alphabetical order)', () => {
  assert.equal(corridorId('DE', 'FR'), corridorId('FR', 'DE'));
  assert.equal(corridorId('GB', 'NL'), 'corridor:GB-NL');
  assert.equal(corridorId('NL', 'GB'), 'corridor:GB-NL');
});

test('pinItem adds item to watchlist', () => {
  const store = makeWatchlistStore();
  const item = { id: plantId('Drax'), type: 'plant', label: 'Drax', iso2: 'GB' };
  const result = store.pinItem(item);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, item.id);
  assert.ok(result[0].pinnedAt);
});

test('pinItem is idempotent (no duplicate)', () => {
  const store = makeWatchlistStore();
  const item = { id: countryId('DE'), type: 'country', label: 'Germany', iso2: 'DE' };
  store.pinItem(item);
  store.pinItem(item);
  assert.equal(store.load().length, 1);
});

test('unpinItem removes by id', () => {
  const store = makeWatchlistStore();
  const a = { id: countryId('FR'), type: 'country', label: 'France', iso2: 'FR' };
  const b = { id: countryId('DE'), type: 'country', label: 'Germany', iso2: 'DE' };
  store.pinItem(a);
  store.pinItem(b);
  const result = store.unpinItem(a.id);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, b.id);
});

test('togglePin pins then unpins', () => {
  const store = makeWatchlistStore();
  const item = { id: corridorId('DE', 'NL'), type: 'corridor', label: 'DE → NL', from: 'DE', to: 'NL' };
  const { pinned: firstPinned } = store.togglePin(item);
  assert.equal(firstPinned, true);
  assert.equal(store.load().length, 1);
  const { pinned: secondPinned } = store.togglePin(item);
  assert.equal(secondPinned, false);
  assert.equal(store.load().length, 0);
});

test('clearWatchlist empties all items', () => {
  const store = makeWatchlistStore();
  store.pinItem({ id: countryId('IT'), type: 'country', label: 'Italy', iso2: 'IT' });
  store.pinItem({ id: countryId('ES'), type: 'country', label: 'Spain', iso2: 'ES' });
  assert.equal(store.load().length, 2);
  store.clearWatchlist();
  assert.equal(store.load().length, 0);
});

// ---- Alert logic (extracted from lib/alerts.ts) ----

function makeAlertStore() {
  let rules = [];
  let firings = [];

  function addRule(rule) {
    const newRule = {
      ...rule,
      id: `alert:test:${rules.length}`,
      createdAt: new Date().toISOString(),
    };
    rules = [newRule, ...rules];
    return rules;
  }

  function removeRule(id) {
    rules = rules.filter((r) => r.id !== id);
    return rules;
  }

  function toggleRule(id) {
    rules = rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    return rules;
  }

  function evaluate(priceByIso, congestionByCorridorId, outageSet) {
    const enabledRules = rules.filter((r) => r.enabled);
    const now = new Date().toISOString();
    const fired = [];

    for (const rule of enabledRules) {
      let observed;
      let triggered = false;

      if (rule.condition === 'price_above' || rule.condition === 'price_below') {
        const iso2 = rule.assetId.replace('country:', '').toUpperCase();
        observed = priceByIso[iso2];
        if (observed === undefined) continue;
        triggered =
          rule.condition === 'price_above'
            ? observed > (rule.threshold ?? 0)
            : observed < (rule.threshold ?? 9999);
      }

      if (rule.condition === 'congestion_above') {
        const cUtil = congestionByCorridorId[rule.assetId];
        observed = cUtil !== undefined ? cUtil * 100 : undefined;
        if (observed === undefined) continue;
        triggered = observed > (rule.threshold ?? 80);
      }

      if (rule.condition === 'outage_start') {
        triggered = outageSet.has(rule.assetId);
        observed = triggered ? 1 : 0;
      }

      if (triggered && observed !== undefined) {
        fired.push({ ruleId: rule.id, assetLabel: rule.assetLabel, condition: rule.condition, threshold: rule.threshold, observedValue: observed, firedAt: now });
      }
    }

    if (fired.length > 0) firings = [...fired, ...firings].slice(0, 50);
    return fired;
  }

  return { addRule, removeRule, toggleRule, evaluate, getRules: () => rules, getFirings: () => firings };
}

test('addRule creates alert with generated id', () => {
  const store = makeAlertStore();
  store.addRule({ assetType: 'country', assetId: 'country:DE', assetLabel: 'Germany', condition: 'price_above', threshold: 100, enabled: true, deliveryChannels: ['in_app'] });
  assert.equal(store.getRules().length, 1);
  assert.ok(store.getRules()[0].id.startsWith('alert:test:'));
  assert.ok(store.getRules()[0].createdAt);
});

test('removeRule deletes by id', () => {
  const store = makeAlertStore();
  store.addRule({ assetType: 'country', assetId: 'country:FR', assetLabel: 'France', condition: 'price_above', threshold: 80, enabled: true, deliveryChannels: ['in_app'] });
  const id = store.getRules()[0].id;
  store.removeRule(id);
  assert.equal(store.getRules().length, 0);
});

test('toggleRule flips enabled flag', () => {
  const store = makeAlertStore();
  store.addRule({ assetType: 'country', assetId: 'country:IT', assetLabel: 'Italy', condition: 'price_above', threshold: 90, enabled: true, deliveryChannels: ['in_app'] });
  const id = store.getRules()[0].id;
  store.toggleRule(id);
  assert.equal(store.getRules()[0].enabled, false);
  store.toggleRule(id);
  assert.equal(store.getRules()[0].enabled, true);
});

test('evaluate fires price_above when price exceeds threshold', () => {
  const store = makeAlertStore();
  store.addRule({ assetType: 'country', assetId: 'country:GR', assetLabel: 'Greece', condition: 'price_above', threshold: 100, enabled: true, deliveryChannels: ['in_app'] });
  const fired = store.evaluate({ GR: 105 }, {}, new Set());
  assert.equal(fired.length, 1);
  assert.equal(fired[0].assetLabel, 'Greece');
  assert.equal(fired[0].observedValue, 105);
});

test('evaluate does not fire price_above when price is below threshold', () => {
  const store = makeAlertStore();
  store.addRule({ assetType: 'country', assetId: 'country:SE', assetLabel: 'Sweden', condition: 'price_above', threshold: 50, enabled: true, deliveryChannels: ['in_app'] });
  const fired = store.evaluate({ SE: 35 }, {}, new Set());
  assert.equal(fired.length, 0);
});

test('evaluate fires price_below when price is under threshold', () => {
  const store = makeAlertStore();
  store.addRule({ assetType: 'country', assetId: 'country:NO', assetLabel: 'Norway', condition: 'price_below', threshold: 30, enabled: true, deliveryChannels: ['in_app'] });
  const fired = store.evaluate({ NO: 20 }, {}, new Set());
  assert.equal(fired.length, 1);
  assert.equal(fired[0].observedValue, 20);
});

test('evaluate fires congestion_above when utilisation exceeds threshold', () => {
  const store = makeAlertStore();
  store.addRule({ assetType: 'corridor', assetId: 'corridor:DE-FR', assetLabel: 'DE → FR', condition: 'congestion_above', threshold: 80, enabled: true, deliveryChannels: ['in_app'] });
  const fired = store.evaluate({}, { 'corridor:DE-FR': 0.92 }, new Set());
  assert.equal(fired.length, 1);
  assert.ok(fired[0].observedValue > 80);
});

test('evaluate fires outage_start when asset in outage set', () => {
  const store = makeAlertStore();
  store.addRule({ assetType: 'country', assetId: 'country:PL', assetLabel: 'Poland', condition: 'outage_start', enabled: true, deliveryChannels: ['in_app'] });
  const fired = store.evaluate({}, {}, new Set(['country:PL']));
  assert.equal(fired.length, 1);
});

test('disabled rules are not evaluated', () => {
  const store = makeAlertStore();
  store.addRule({ assetType: 'country', assetId: 'country:DE', assetLabel: 'Germany', condition: 'price_above', threshold: 50, enabled: false, deliveryChannels: ['in_app'] });
  const fired = store.evaluate({ DE: 999 }, {}, new Set());
  assert.equal(fired.length, 0);
});

test('firings are accumulated', () => {
  const store = makeAlertStore();
  store.addRule({ assetType: 'country', assetId: 'country:GB', assetLabel: 'UK', condition: 'price_above', threshold: 80, enabled: true, deliveryChannels: ['in_app'] });
  store.evaluate({ GB: 90 }, {}, new Set());
  store.evaluate({ GB: 95 }, {}, new Set());
  assert.ok(store.getFirings().length >= 2);
});

// ---- Inert-condition tests: document why outage_end and forecast_miss are
//      NOT exposed in the UI (evaluate() cannot handle them without extra state) ----

test('outage_end rule never fires (evaluate has no previous-state tracking)', () => {
  // outage_end is a transition event; without a "previous outage set" the evaluator
  // cannot know when an outage has ended. It silently produces no firings.
  const store = makeAlertStore();
  store.addRule({ assetType: 'plant', assetId: 'plant:drax', assetLabel: 'Drax', condition: 'outage_end', enabled: true, deliveryChannels: ['in_app'] });
  // Plant is currently NOT in outage set — "ended" — but evaluate does not fire.
  const fired = store.evaluate({}, {}, new Set());
  assert.equal(fired.length, 0, 'outage_end must not fire: no previous-state tracking available');
});

test('forecast_miss rule never fires (forecasts not wired into evaluate)', () => {
  // forecast_miss would need MAPE data passed to evaluate(). The current signature
  // (priceByIso, congestionByCorridorId, outageSet) has no forecast parameter, so
  // any forecast_miss rule is inert.
  const store = makeAlertStore();
  store.addRule({ assetType: 'country', assetId: 'country:DE', assetLabel: 'Germany', condition: 'forecast_miss', threshold: 10, enabled: true, deliveryChannels: ['in_app'] });
  const fired = store.evaluate({ DE: 999 }, {}, new Set());
  assert.equal(fired.length, 0, 'forecast_miss must not fire: forecast data not wired into evaluate()');
});

// ---- History label truthfulness ----

/**
 * historyLabel(days) must return a string that exactly reflects `days`, not a
 * hard-coded constant like "7d". This is the logic extracted from AssetTimeSeries.
 */
function historyLabel(days) {
  return `${days}d price history`;
}

/**
 * historySlice(hourly, days) returns the last `days * 24` values from the hourly array,
 * so the sparkline never shows more data than the bundle actually contains.
 */
function historySlice(hourly, days) {
  return hourly.slice(-(days * 24));
}

test('historyLabel reflects actual days (not a hard-coded 7d)', () => {
  assert.equal(historyLabel(3), '3d price history');
  assert.equal(historyLabel(7), '7d price history');
  assert.equal(historyLabel(1), '1d price history');
});

test('historySlice returns at most days*24 values', () => {
  const hourly = Array.from({ length: 72 }, (_, i) => i); // 3 days
  const slice3d = historySlice(hourly, 3);
  assert.equal(slice3d.length, 72);
  const slice1d = historySlice(hourly, 1);
  assert.equal(slice1d.length, 24);
  // Requesting 7d from 3d data returns all 72h (capped by array length)
  const slice7d = historySlice(hourly, 7);
  assert.equal(slice7d.length, 72, 'cannot exceed available data');
});

test('historySlice returns the most recent values', () => {
  const hourly = [10, 20, 30, 40, 50];
  const slice = historySlice(hourly, 1); // 1d = 24h but only 5 values available
  // slice(-(24)) on a 5-element array returns all 5
  assert.deepEqual(slice, [10, 20, 30, 40, 50]);
  const slice2 = historySlice([1, 2, 3, 4], 0); // 0d → slice(0) = all
  assert.deepEqual(slice2, [1, 2, 3, 4]);
});

// ---- Watchlist plant selection ----

/**
 * handleSelect() for plant items must call onSelectPlant, not silently no-op.
 * This is a unit test of the selection routing logic extracted from WatchlistPanel.
 */
function makeSelectRouter({ onSelectCountry, onSelectCorridor, onSelectPlant }) {
  return function handleSelect(item) {
    if (item.type === 'country' && item.iso2) {
      onSelectCountry(item.iso2);
    } else if (item.type === 'corridor' && item.from && item.to) {
      onSelectCorridor(item.from, item.to);
    } else if (item.type === 'plant') {
      onSelectPlant(item);
    }
  };
}

test('watchlist plant selection calls onSelectPlant', () => {
  let called = null;
  const router = makeSelectRouter({
    onSelectCountry: () => {},
    onSelectCorridor: () => {},
    onSelectPlant: (item) => { called = item; },
  });
  const plantItem = { id: 'plant:drax', type: 'plant', label: 'Drax', iso2: 'GB', subLabel: 'Hard Coal' };
  router(plantItem);
  assert.ok(called !== null, 'onSelectPlant must be called for plant items');
  assert.equal(called.id, 'plant:drax');
});

test('watchlist country selection calls onSelectCountry', () => {
  let called = null;
  const router = makeSelectRouter({
    onSelectCountry: (iso2) => { called = iso2; },
    onSelectCorridor: () => {},
    onSelectPlant: () => {},
  });
  router({ type: 'country', iso2: 'DE', label: 'Germany' });
  assert.equal(called, 'DE');
});

test('watchlist corridor selection calls onSelectCorridor', () => {
  let from = null; let to = null;
  const router = makeSelectRouter({
    onSelectCountry: () => {},
    onSelectCorridor: (f, t) => { from = f; to = t; },
    onSelectPlant: () => {},
  });
  router({ type: 'corridor', from: 'DE', to: 'FR', label: 'DE → FR' });
  assert.equal(from, 'DE');
  assert.equal(to, 'FR');
});
