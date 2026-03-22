import { ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import { getFuelColor, normalizeFuel, FUEL_LABELS } from '../colors';
import { COUNTRY_CENTROIDS } from '../countries';
import type { PowerPlant } from '../data-fetcher';

export interface PlantLayerOptions {
  filteredPlants: PowerPlant[];
  zoomLevel: number;
  onHover: (info: { x: number; y: number; name: string; fuel: string; fuelLabel: string; capacity: number; country: string; year: string } | null) => void;
  onClick: (plant: PowerPlant) => void;
  opacity?: number;
}

export function createPlantLayer({
  filteredPlants,
  zoomLevel,
  onHover,
  onClick,
}: PlantLayerOptions) {
  return new ScatterplotLayer<PowerPlant>({
    id: 'power-plants',
    data: filteredPlants,
    getPosition: (d) => [d.lon, d.lat],
    getFillColor: (d) => getFuelColor(d.fuel),
    getRadius: (d) =>
      Math.max(800, Math.sqrt(d.capacity) * (zoomLevel > 6 ? 150 : 120)),
    radiusMinPixels: 2,
    radiusMaxPixels: zoomLevel > 6 ? 30 : 20,
    pickable: true,
    antialiasing: true,
    onHover: (info: PickingInfo<PowerPlant>) => {
      if (!info.object) {
        onHover(null);
        return;
      }
      const d = info.object;
      const fuel = normalizeFuel(d.fuel);
      onHover({
        x: info.x,
        y: info.y,
        name: d.name,
        fuel,
        fuelLabel: FUEL_LABELS[fuel] || fuel,
        capacity: d.capacity,
        country: COUNTRY_CENTROIDS[d.country]?.name || d.country,
        year: d.year || 'Unknown',
      });
    },
    onClick: (info: PickingInfo<PowerPlant>) => {
      if (!info.object) return;
      onClick(info.object);
    },
  });
}
