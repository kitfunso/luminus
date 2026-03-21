'use strict';

/**
 * Tests for workspace-presets logic (pure Node, no DOM).
 *
 * The module uses localStorage in the browser; we inline the pure logic
 * for testability, mirroring the pattern in watchlist-alerts.test.js.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// ---- Inline the pure logic from lib/workspace-presets.ts ----

const ALL_LAYERS_OFF = {
  plants: false, prices: false, flows: false, lines: false,
  tyndp: false, genMix: false, outages: false, forecast: false, history: false,
};

const ALL_FUELS = ['nuclear', 'wind', 'solar', 'gas', 'coal', 'hydro', 'other'];

const BUILT_IN_PRESETS = [
  {
    id: 'intraday',
    label: 'Intraday',
    description: 'Live flows and prices, all fuels visible',
    builtIn: true,
    state: {
      layerVisibility: { ...ALL_LAYERS_OFF, prices: true, flows: true, lines: true },
      selectedFuels: ALL_FUELS,
      minCapacity: 100,
      selectedCountries: null,
    },
  },
  {
    id: 'day-ahead',
    label: 'Day-Ahead',
    description: 'Price heatmap with plants, standard view',
    builtIn: true,
    state: {
      layerVisibility: { ...ALL_LAYERS_OFF, plants: true, prices: true, flows: true, genMix: true },
      selectedFuels: ALL_FUELS,
      minCapacity: 200,
      selectedCountries: null,
    },
  },
  {
    id: 'renewables-focus',
    label: 'Renewables',
    description: 'Wind, solar and hydro generation',
    builtIn: true,
    state: {
      layerVisibility: { ...ALL_LAYERS_OFF, plants: true, prices: true, genMix: true },
      selectedFuels: ['wind', 'solar', 'hydro'],
      minCapacity: 50,
      selectedCountries: null,
    },
  },
  {
    id: 'gas-linked',
    label: 'Gas-Linked',
    description: 'Gas generation with price and flow context',
    builtIn: true,
    state: {
      layerVisibility: { ...ALL_LAYERS_OFF, plants: true, prices: true, flows: true },
      selectedFuels: ['gas'],
      minCapacity: 100,
      selectedCountries: null,
    },
  },
];

// In-memory store for tests (mirrors localStorage logic)
function makePresetStore() {
  let saved = [];
  let counter = 0;

  function getSavedPresets() { return saved; }

  function savePreset(label, state) {
    const id = `user:${Date.now()}-${++counter}`;
    const preset = {
      id,
      label: label.trim() || 'Untitled',
      description: 'Saved workspace',
      builtIn: false,
      savedAt: new Date().toISOString(),
      state,
    };
    saved = [preset, ...saved];
    return saved;
  }

  function deletePreset(id) {
    saved = saved.filter((p) => p.id !== id);
    return saved;
  }

  function getAllPresets() {
    return [...BUILT_IN_PRESETS, ...saved];
  }

  return { getSavedPresets, savePreset, deletePreset, getAllPresets };
}

// ---- Tests ----

test('BUILT_IN_PRESETS has 4 entries', () => {
  assert.equal(BUILT_IN_PRESETS.length, 4);
});

test('all built-in preset ids are unique', () => {
  const ids = BUILT_IN_PRESETS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('all built-in presets have labels', () => {
  for (const p of BUILT_IN_PRESETS) {
    assert.ok(p.label && p.label.length > 0, `${p.id} missing label`);
  }
});

test('all built-in presets have at least one layer on', () => {
  for (const p of BUILT_IN_PRESETS) {
    const anyOn = Object.values(p.state.layerVisibility).some(Boolean);
    assert.ok(anyOn, `${p.id}: all layers off`);
  }
});

test('all built-in presets have at least one fuel selected', () => {
  for (const p of BUILT_IN_PRESETS) {
    assert.ok(p.state.selectedFuels.length > 0, `${p.id}: no fuels selected`);
  }
});

test('renewables preset only selects renewable fuels', () => {
  const p = BUILT_IN_PRESETS.find((x) => x.id === 'renewables-focus');
  assert.ok(p, 'renewables-focus preset not found');
  assert.deepEqual(p.state.selectedFuels.sort(), ['hydro', 'solar', 'wind']);
});

test('gas-linked preset selects only gas fuel', () => {
  const p = BUILT_IN_PRESETS.find((x) => x.id === 'gas-linked');
  assert.ok(p, 'gas-linked preset not found');
  assert.deepEqual(p.state.selectedFuels, ['gas']);
});

test('intraday preset has flows and prices on', () => {
  const p = BUILT_IN_PRESETS.find((x) => x.id === 'intraday');
  assert.ok(p, 'intraday preset not found');
  assert.equal(p.state.layerVisibility.flows, true);
  assert.equal(p.state.layerVisibility.prices, true);
});

test('day-ahead preset has plants and prices on', () => {
  const p = BUILT_IN_PRESETS.find((x) => x.id === 'day-ahead');
  assert.ok(p, 'day-ahead preset not found');
  assert.equal(p.state.layerVisibility.plants, true);
  assert.equal(p.state.layerVisibility.prices, true);
});

test('day-ahead preset has higher minCapacity than renewables', () => {
  const da = BUILT_IN_PRESETS.find((x) => x.id === 'day-ahead');
  const ren = BUILT_IN_PRESETS.find((x) => x.id === 'renewables-focus');
  assert.ok(da.state.minCapacity > ren.state.minCapacity);
});

test('built-in presets have selectedCountries: null (all countries)', () => {
  for (const p of BUILT_IN_PRESETS) {
    assert.equal(p.state.selectedCountries, null, `${p.id}: should default to all countries`);
  }
});

test('savePreset adds a preset and returns updated list', () => {
  const store = makePresetStore();
  const state = {
    layerVisibility: { ...ALL_LAYERS_OFF, prices: true },
    selectedFuels: ALL_FUELS,
    minCapacity: 50,
    selectedCountries: null,
  };
  const result = store.savePreset('My View', state);
  assert.equal(result.length, 1);
  assert.equal(result[0].label, 'My View');
  assert.equal(result[0].builtIn, false);
  assert.ok(result[0].id.startsWith('user:'));
  assert.ok(result[0].savedAt);
});

test('savePreset uses "Untitled" for blank label', () => {
  const store = makePresetStore();
  const state = { layerVisibility: ALL_LAYERS_OFF, selectedFuels: [], minCapacity: 0, selectedCountries: null };
  const result = store.savePreset('  ', state);
  assert.equal(result[0].label, 'Untitled');
});

test('savePreset prepends new presets (newest first)', () => {
  const store = makePresetStore();
  const state = { layerVisibility: ALL_LAYERS_OFF, selectedFuels: [], minCapacity: 0, selectedCountries: null };
  store.savePreset('First', state);
  store.savePreset('Second', state);
  const saved = store.getSavedPresets();
  assert.equal(saved[0].label, 'Second');
  assert.equal(saved[1].label, 'First');
});

test('deletePreset removes the correct preset', () => {
  const store = makePresetStore();
  const state = { layerVisibility: ALL_LAYERS_OFF, selectedFuels: [], minCapacity: 0, selectedCountries: null };
  store.savePreset('A', state);
  store.savePreset('B', state);
  const saved = store.getSavedPresets();
  const idToDelete = saved[0].id; // newest = B
  const result = store.deletePreset(idToDelete);
  assert.equal(result.length, 1);
  assert.equal(result[0].label, 'A');
});

test('deletePreset with unknown id leaves list unchanged', () => {
  const store = makePresetStore();
  const state = { layerVisibility: ALL_LAYERS_OFF, selectedFuels: [], minCapacity: 0, selectedCountries: null };
  store.savePreset('A', state);
  const before = store.getSavedPresets().length;
  store.deletePreset('nonexistent');
  assert.equal(store.getSavedPresets().length, before);
});

test('getAllPresets returns built-ins then saved', () => {
  const store = makePresetStore();
  const state = { layerVisibility: ALL_LAYERS_OFF, selectedFuels: [], minCapacity: 0, selectedCountries: null };
  store.savePreset('User Preset', state);
  const all = store.getAllPresets();
  // built-ins come first
  assert.equal(all[0].id, 'intraday');
  assert.equal(all[1].id, 'day-ahead');
  assert.equal(all[2].id, 'renewables-focus');
  assert.equal(all[3].id, 'gas-linked');
  // saved preset at the end
  assert.equal(all[4].label, 'User Preset');
  assert.equal(all.length, 5);
});

test('getAllPresets returns only built-ins when no saved presets', () => {
  const store = makePresetStore();
  const all = store.getAllPresets();
  assert.equal(all.length, 4);
  assert.ok(all.every((p) => p.builtIn));
});

test('savePreset preserves state correctly', () => {
  const store = makePresetStore();
  const state = {
    layerVisibility: { ...ALL_LAYERS_OFF, plants: true, prices: true },
    selectedFuels: ['wind', 'solar'],
    minCapacity: 300,
    selectedCountries: ['DE', 'FR', 'GB'],
  };
  store.savePreset('Custom', state);
  const saved = store.getSavedPresets();
  assert.deepEqual(saved[0].state.selectedFuels, ['wind', 'solar']);
  assert.equal(saved[0].state.minCapacity, 300);
  assert.deepEqual(saved[0].state.selectedCountries, ['DE', 'FR', 'GB']);
  assert.equal(saved[0].state.layerVisibility.plants, true);
  assert.equal(saved[0].state.layerVisibility.prices, true);
  assert.equal(saved[0].state.layerVisibility.flows, false);
});

test('multiple saves and deletes stay consistent', () => {
  const store = makePresetStore();
  const state = { layerVisibility: ALL_LAYERS_OFF, selectedFuels: [], minCapacity: 0, selectedCountries: null };
  store.savePreset('A', state);
  store.savePreset('B', state);
  store.savePreset('C', state);
  // order: C, B, A
  const all = store.getSavedPresets();
  store.deletePreset(all[1].id); // delete B
  const remaining = store.getSavedPresets();
  assert.equal(remaining.length, 2);
  assert.equal(remaining[0].label, 'C');
  assert.equal(remaining[1].label, 'A');
});
