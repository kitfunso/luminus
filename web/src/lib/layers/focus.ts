import type { FocusMode } from '../store';

type LayerName = 'prices' | 'flows' | 'plants' | 'lines' | 'tyndp' | 'labels';

/**
 * Returns the effective opacity (0-255) for a layer given the current focus mode.
 * Focused layer gets full opacity, others get dimmed to 30%.
 * When focusMode is 'none', all layers get default opacity.
 */
export function layerOpacity(layer: LayerName, focusMode: FocusMode): number {
  if (focusMode === 'none') return 200;

  // Which layers are "in focus" for each mode
  const focusGroups: Record<Exclude<FocusMode, 'none'>, LayerName[]> = {
    prices: ['prices', 'labels'],
    flows: ['flows', 'lines', 'labels'],
    plants: ['plants'],
  };

  const focused = focusGroups[focusMode];
  return focused.includes(layer) ? 220 : 60;
}
