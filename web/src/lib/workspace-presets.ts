/**
 * Workspace presets: built-in trader modes + local-first user saves.
 *
 * State captured:
 *   - layerVisibility (which map layers are on)
 *   - selectedFuels (fuel filter set)
 *   - minCapacity (MW threshold slider)
 *   - selectedCountries (country filter, null = all)
 *
 * Panel state (showDashboard etc.) is intentionally excluded — those panels are
 * transient and re-opening them is one click. Keeping the preset shape small
 * means it stays useful across version changes.
 *
 * Storage key: luminus:presets (JSON array of UserPreset)
 */

import type { LayerKey } from '../components/Sidebar';

export interface PresetState {
  layerVisibility: Record<LayerKey, boolean>;
  selectedFuels: string[];     // stored as array for JSON serialisation
  minCapacity: number;
  selectedCountries: string[] | null;  // null = all countries
}

export interface WorkspacePreset {
  id: string;
  label: string;
  description: string;
  builtIn: boolean;
  savedAt?: string;
  state: PresetState;
}

// ---------------------------------------------------------------------------
// Built-in presets
// ---------------------------------------------------------------------------

const ALL_LAYERS_OFF: Record<LayerKey, boolean> = {
  plants: false, prices: false, flows: false, lines: false,
  tyndp: false, genMix: false, outages: false, forecast: false, history: false,
};

const ALL_FUELS = ['nuclear', 'wind', 'solar', 'gas', 'coal', 'hydro', 'other'];

export const BUILT_IN_PRESETS: WorkspacePreset[] = [
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

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'luminus:presets';

let _idCounter = 0;

function loadSaved(): WorkspacePreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as WorkspacePreset[];
  } catch {
    return [];
  }
}

function persistSaved(items: WorkspacePreset[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage quota or private mode — degrade silently
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getSavedPresets(): WorkspacePreset[] {
  return loadSaved();
}

export function getAllPresets(): WorkspacePreset[] {
  return [...BUILT_IN_PRESETS, ...loadSaved()];
}

export function savePreset(label: string, state: PresetState): WorkspacePreset[] {
  const id = `user:${Date.now()}-${++_idCounter}`;
  const preset: WorkspacePreset = {
    id,
    label: label.trim() || 'Untitled',
    description: 'Saved workspace',
    builtIn: false,
    savedAt: new Date().toISOString(),
    state,
  };
  const next = [preset, ...loadSaved()];
  persistSaved(next);
  return next;
}

export function deletePreset(id: string): WorkspacePreset[] {
  const next = loadSaved().filter((p) => p.id !== id);
  persistSaved(next);
  return next;
}

/**
 * Capture current workspace state into a serialisable PresetState.
 * selectedCountries Set → array (or null to preserve "all countries" sentinel).
 */
export function captureState(
  layerVisibility: Record<LayerKey, boolean>,
  selectedFuels: Set<string>,
  minCapacity: number,
  selectedCountries: Set<string> | null,
): PresetState {
  return {
    layerVisibility: { ...layerVisibility },
    selectedFuels: [...selectedFuels].sort(),
    minCapacity,
    selectedCountries: selectedCountries !== null ? [...selectedCountries].sort() : null,
  };
}
