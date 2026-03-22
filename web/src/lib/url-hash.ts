/**
 * URL hash state serialization / deserialization for Luminus map.
 *
 * Encodes view position, filter state, and layer visibility into the
 * browser URL hash so bookmarks and shared links restore the user's view.
 */

import type { LayerKey, ViewState } from './store';
import { FILTER_FUELS } from './colors';

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

export interface HashState {
  lat?: number;
  lon?: number;
  z?: number;
  cap?: number;
  fuels?: Set<string>;
  countries?: Set<string>;
  layers?: Record<LayerKey, boolean>;
}

export function parseHashState(): HashState | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.slice(1);
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const result: HashState = {};

  if (params.has('lat')) result.lat = parseFloat(params.get('lat')!);
  if (params.has('lon')) result.lon = parseFloat(params.get('lon')!);
  if (params.has('z')) result.z = parseFloat(params.get('z')!);
  if (params.has('cap')) result.cap = parseFloat(params.get('cap')!);

  const fuels = params.get('fuels');
  if (fuels !== null) {
    result.fuels = new Set(fuels.split(',').map((f) => f.trim()).filter(Boolean));
  }

  const countries = params.get('countries');
  if (countries !== null) {
    result.countries = new Set(
      countries === 'none' ? [] : countries.split(',').map((c) => c.trim()).filter(Boolean),
    );
  }

  const layers = params.get('layers');
  if (layers !== null) {
    const enabled = new Set(layers.split(',').map((l) => l.trim()).filter(Boolean));
    result.layers = {
      plants: enabled.has('plants'), prices: enabled.has('prices'),
      flows: enabled.has('flows'), lines: enabled.has('lines'),
      tyndp: enabled.has('tyndp'), genMix: enabled.has('genMix'),
      outages: enabled.has('outages'), forecast: enabled.has('forecast'),
      history: enabled.has('history'),
    };
  }

  return Object.keys(result).length > 0 ? result : null;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const DEFAULT_LAYER_VISIBILITY: Record<LayerKey, boolean> = {
  plants: true, prices: true, flows: true, lines: true, tyndp: false,
  genMix: true, outages: false, forecast: false, history: false,
};

export function buildHash(
  vs: ViewState,
  minCapacity: number,
  selectedFuels: Set<string>,
  selectedCountries: Set<string> | null,
  layerVisibility: Record<LayerKey, boolean>,
): string {
  const params = new URLSearchParams({
    lat: vs.latitude.toFixed(2),
    lon: vs.longitude.toFixed(2),
    z: vs.zoom.toFixed(1),
  });

  if (minCapacity !== 50) params.set('cap', String(minCapacity));

  if (selectedFuels.size !== FILTER_FUELS.length) {
    params.set('fuels', [...selectedFuels].sort().join(','));
  }

  if (selectedCountries !== null) {
    params.set('countries', selectedCountries.size > 0 ? [...selectedCountries].sort().join(',') : 'none');
  }

  const defaultLayers = JSON.stringify(DEFAULT_LAYER_VISIBILITY);
  if (JSON.stringify(layerVisibility) !== defaultLayers) {
    params.set(
      'layers',
      (Object.entries(layerVisibility) as [LayerKey, boolean][])
        .filter(([, on]) => on).map(([k]) => k).sort().join(','),
    );
  }

  return `#${params.toString()}`;
}
