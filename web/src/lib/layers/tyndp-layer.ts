import { ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import type { TyndpProject } from '../tyndp';

export interface TyndpLayerOptions {
  projects: TyndpProject[];
  onHover: (info: { x: number; y: number; name: string; fuel: string; capacity: number; status: string; expectedYear: string } | null) => void;
  onClick: (project: TyndpProject) => void;
}

function statusColor(d: TyndpProject): [number, number, number, number] {
  if (d.status === 'under_construction') return [74, 222, 128, 210];
  if (d.status === 'permitted') return [56, 189, 248, 190];
  if (d.status === 'planned') return [250, 204, 21, 170];
  return [148, 163, 184, 140];
}

export function createTyndpLayer({
  projects,
  onHover,
  onClick,
}: TyndpLayerOptions) {
  return new ScatterplotLayer<TyndpProject>({
    id: 'tyndp-projects',
    data: projects,
    getPosition: (d) => [d.lon, d.lat],
    getRadius: (d) => Math.max(1200, Math.sqrt(d.capacity) * 150),
    radiusMinPixels: 4,
    radiusMaxPixels: 28,
    filled: false,
    stroked: true,
    getLineColor: statusColor,
    getLineWidth: 2,
    lineWidthMinPixels: 2,
    lineWidthMaxPixels: 4,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 40],
    onHover: (info: PickingInfo<TyndpProject>) => {
      if (!info.object) {
        onHover(null);
        return;
      }
      const d = info.object;
      const statusLabel = d.status.replace('_', ' ');
      onHover({
        x: info.x,
        y: info.y,
        name: d.name,
        fuel: d.fuel,
        capacity: d.capacity,
        status: statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1),
        expectedYear: d.expectedYear,
      });
    },
    onClick: (info: PickingInfo<TyndpProject>) => {
      if (!info.object) return;
      onClick(info.object);
    },
  });
}
