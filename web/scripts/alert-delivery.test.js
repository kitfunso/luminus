'use strict';

/**
 * Tests for alert-delivery logic (pure Node, no DOM).
 *
 * We extract and test the pure, side-effect-free functions:
 * - isOnCooldown
 * - firingToNotificationContent
 * - deliverFirings (as much as we can without real Notification API)
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// ---- Cooldown logic (extracted) ----

const NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function isOnCooldown(ruleId, nowMs, cooldownMap, cooldownMs = NOTIFICATION_COOLDOWN_MS) {
  const last = cooldownMap[ruleId] ?? 0;
  return nowMs - last < cooldownMs;
}

function recordCooldown(ruleId, nowMs, cooldownMap) {
  return { ...cooldownMap, [ruleId]: nowMs };
}

test('isOnCooldown returns false for rule with no prior notification', () => {
  const map = {};
  assert.equal(isOnCooldown('rule:1', Date.now(), map), false);
});

test('isOnCooldown returns true within cooldown window', () => {
  const now = Date.now();
  const map = { 'rule:1': now - 60_000 }; // notified 1 min ago
  assert.equal(isOnCooldown('rule:1', now, map), true);
});

test('isOnCooldown returns false after cooldown expires', () => {
  const now = Date.now();
  const map = { 'rule:1': now - 6 * 60 * 1000 }; // notified 6 min ago (> 5 min)
  assert.equal(isOnCooldown('rule:1', now, map), false);
});

test('isOnCooldown treats different rules independently', () => {
  const now = Date.now();
  const map = { 'rule:1': now - 1_000, 'rule:2': now - 10 * 60 * 1000 };
  assert.equal(isOnCooldown('rule:1', now, map), true, 'rule:1 should still be on cooldown');
  assert.equal(isOnCooldown('rule:2', now, map), false, 'rule:2 should be off cooldown');
  assert.equal(isOnCooldown('rule:3', now, map), false, 'rule:3 never notified');
});

test('recordCooldown stores the current timestamp', () => {
  const now = Date.now();
  const map = recordCooldown('rule:1', now, {});
  assert.equal(map['rule:1'], now);
});

test('cooldown boundary: exactly equal to cooldown is still on cooldown', () => {
  const now = Date.now();
  const map = { 'rule:1': now - NOTIFICATION_COOLDOWN_MS }; // exactly 5 min
  // nowMs - last = exactly COOLDOWN_MS, which is NOT < cooldown, so off cooldown
  assert.equal(isOnCooldown('rule:1', now, map), false);
});

test('custom cooldown window respected', () => {
  const now = Date.now();
  const map = { 'rule:1': now - 1_000 }; // 1 second ago
  assert.equal(isOnCooldown('rule:1', now, map, 500), false, '500ms cooldown should have expired after 1s');
  assert.equal(isOnCooldown('rule:1', now, map, 2_000), true, '2s cooldown should still be active after 1s');
});

// ---- Notification content formatting ----

function firingToNotificationContent(firing) {
  const conditionVerb = {
    price_above: 'price spike',
    price_below: 'price drop',
    congestion_above: 'congestion alert',
    outage_start: 'outage started',
  };
  const condLabel = conditionVerb[firing.condition] ?? firing.condition.replace(/_/g, ' ');

  let body;
  if (firing.condition === 'price_above') {
    body = `${firing.assetLabel}: ${firing.observedValue.toFixed(0)} \u20ac/MWh (above ${firing.threshold} \u20ac/MWh)`;
  } else if (firing.condition === 'price_below') {
    body = `${firing.assetLabel}: ${firing.observedValue.toFixed(0)} \u20ac/MWh (below ${firing.threshold} \u20ac/MWh)`;
  } else if (firing.condition === 'congestion_above') {
    body = `${firing.assetLabel}: ${firing.observedValue.toFixed(0)}% utilisation (above ${firing.threshold}%)`;
  } else if (firing.condition === 'outage_start') {
    body = `${firing.assetLabel}: outage detected`;
  } else {
    body = `${firing.assetLabel}: ${condLabel}`;
  }

  return { title: `Luminus \u2014 ${condLabel}`, body };
}

test('price_above notification has correct title and body', () => {
  const firing = {
    ruleId: 'r1',
    assetLabel: 'Germany',
    condition: 'price_above',
    threshold: 100,
    observedValue: 132.7,
    firedAt: new Date().toISOString(),
  };
  const { title, body } = firingToNotificationContent(firing);
  assert.equal(title, 'Luminus \u2014 price spike');
  assert.ok(body.includes('Germany'), 'body should include asset label');
  assert.ok(body.includes('133'), 'body should include rounded observed value');
  assert.ok(body.includes('100'), 'body should include threshold');
});

test('price_below notification has correct body', () => {
  const firing = {
    ruleId: 'r2',
    assetLabel: 'Norway',
    condition: 'price_below',
    threshold: 30,
    observedValue: 12.4,
    firedAt: new Date().toISOString(),
  };
  const { title, body } = firingToNotificationContent(firing);
  assert.equal(title, 'Luminus \u2014 price drop');
  assert.ok(body.includes('12'), 'body should include observed value');
  assert.ok(body.includes('below 30'), 'body should state below threshold');
});

test('congestion_above notification formats utilisation', () => {
  const firing = {
    ruleId: 'r3',
    assetLabel: 'DE \u2192 FR',
    condition: 'congestion_above',
    threshold: 80,
    observedValue: 92.3,
    firedAt: new Date().toISOString(),
  };
  const { title, body } = firingToNotificationContent(firing);
  assert.equal(title, 'Luminus \u2014 congestion alert');
  assert.ok(body.includes('92%'), 'body should include rounded utilisation');
  assert.ok(body.includes('above 80%'), 'body should mention threshold');
});

test('outage_start notification omits threshold (no threshold for outage)', () => {
  const firing = {
    ruleId: 'r4',
    assetLabel: 'Poland',
    condition: 'outage_start',
    observedValue: 1,
    firedAt: new Date().toISOString(),
  };
  const { title, body } = firingToNotificationContent(firing);
  assert.equal(title, 'Luminus \u2014 outage started');
  assert.ok(body.includes('outage detected'), 'body should state outage');
});

test('unknown condition falls back to condition name', () => {
  const firing = {
    ruleId: 'r5',
    assetLabel: 'Italy',
    condition: 'forecast_miss',
    threshold: 10,
    observedValue: 15,
    firedAt: new Date().toISOString(),
  };
  const { title, body } = firingToNotificationContent(firing);
  assert.ok(title.includes('forecast miss'), 'title should include humanised condition name');
  assert.ok(body.includes('Italy'));
});

// ---- Delivery gate logic ----

/**
 * Extract the delivery gate as a pure function for testing.
 * Mirrors deliverFirings() logic without the real Notification API.
 */
function filterDeliverableFirings(firings, { browserEnabled, permission, cooldownMap, nowMs, cooldownMs = NOTIFICATION_COOLDOWN_MS }) {
  if (!browserEnabled) return [];
  if (permission !== 'granted') return [];
  return firings.filter((f) => !isOnCooldown(f.ruleId, nowMs, cooldownMap, cooldownMs));
}

test('no firings delivered when browserEnabled is false', () => {
  const firings = [{ ruleId: 'r1', assetLabel: 'DE', condition: 'price_above', observedValue: 120, firedAt: '' }];
  const result = filterDeliverableFirings(firings, { browserEnabled: false, permission: 'granted', cooldownMap: {}, nowMs: Date.now() });
  assert.equal(result.length, 0);
});

test('no firings delivered when permission is not granted', () => {
  const firings = [{ ruleId: 'r1', assetLabel: 'DE', condition: 'price_above', observedValue: 120, firedAt: '' }];
  const result = filterDeliverableFirings(firings, { browserEnabled: true, permission: 'default', cooldownMap: {}, nowMs: Date.now() });
  assert.equal(result.length, 0);
});

test('firings within cooldown are filtered out', () => {
  const now = Date.now();
  const map = { 'r1': now - 60_000 }; // 1 min ago — still on cooldown
  const firings = [{ ruleId: 'r1', assetLabel: 'DE', condition: 'price_above', observedValue: 120, firedAt: '' }];
  const result = filterDeliverableFirings(firings, { browserEnabled: true, permission: 'granted', cooldownMap: map, nowMs: now });
  assert.equal(result.length, 0, 'on-cooldown firing should be blocked');
});

test('firings after cooldown expiry are delivered', () => {
  const now = Date.now();
  const map = { 'r1': now - 6 * 60 * 1000 }; // 6 min ago — expired
  const firings = [{ ruleId: 'r1', assetLabel: 'DE', condition: 'price_above', observedValue: 120, firedAt: '' }];
  const result = filterDeliverableFirings(firings, { browserEnabled: true, permission: 'granted', cooldownMap: map, nowMs: now });
  assert.equal(result.length, 1);
});

test('only off-cooldown firings pass when mix of rules', () => {
  const now = Date.now();
  const map = { 'r1': now - 60_000 }; // r1 on cooldown; r2 never notified
  const firings = [
    { ruleId: 'r1', assetLabel: 'DE', condition: 'price_above', observedValue: 120, firedAt: '' },
    { ruleId: 'r2', assetLabel: 'FR', condition: 'price_below', observedValue: 10, firedAt: '' },
  ];
  const result = filterDeliverableFirings(firings, { browserEnabled: true, permission: 'granted', cooldownMap: map, nowMs: now });
  assert.equal(result.length, 1);
  assert.equal(result[0].ruleId, 'r2');
});

test('empty firings array produces no notifications', () => {
  const result = filterDeliverableFirings([], { browserEnabled: true, permission: 'granted', cooldownMap: {}, nowMs: Date.now() });
  assert.equal(result.length, 0);
});
