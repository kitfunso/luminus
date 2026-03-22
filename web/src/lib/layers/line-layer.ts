import { PathLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import type { TransmissionLine, CrossBorderFlow } from '../data-fetcher';
import { corridorForLine, corridorId } from '../corridor-lines';

export interface FlowStressEntry {
  util: number;
  flowMW: number;
  capacityMW: number;
  from: string;
  to: string;
}

export interface LineLayerOptions {
  transmissionLines: TransmissionLine[];
  flowStressByCorridor: Map<string, FlowStressEntry>;
  selectedFlow: CrossBorderFlow | null;
  onHover: (info: { x: number; y: number; name: string; voltage: number; flowMW: number | null; stressLabel: string | null; corridorId: string | null } | null) => void;
  onClick: (corridorId: string) => void;
  opacity?: number;
}

/** Voltage-based opacity only — lines no longer encode stress via color. */
function lineColor(d: TransmissionLine): [number, number, number, number] {
  return d.voltage >= 400
    ? [140, 160, 190, 140]
    : [90, 110, 140, 100];
}

export function createLineLayer({
  transmissionLines,
  flowStressByCorridor,
  selectedFlow,
  onHover,
  onClick,
}: LineLayerOptions) {
  const selectedCid = selectedFlow
    ? corridorId(selectedFlow.from, selectedFlow.to)
    : null;

  const lineWidth = (d: TransmissionLine): number => {
    const cid = corridorForLine(d.name);
    const isSelected = cid !== null && cid === selectedCid;
    if (isSelected) return d.voltage >= 400 ? 600 : 400;
    return d.voltage >= 400 ? 300 : 200;
  };

  return new PathLayer<TransmissionLine>({
    id: 'transmission-lines',
    data: transmissionLines,
    getPath: (d) => d.path,
    getColor: lineColor,
    getWidth: lineWidth,
    widthMinPixels: 1,
    widthMaxPixels: 6,
    pickable: true,
    updateTriggers: {
      getColor: [flowStressByCorridor],
      getWidth: [selectedFlow],
    },
    onHover: (info: PickingInfo<TransmissionLine>) => {
      if (!info.object) {
        onHover(null);
        return;
      }
      const d = info.object;
      const cid = corridorForLine(d.name);
      const stress = cid ? flowStressByCorridor.get(cid) : null;
      const stressLabel = stress
        ? stress.util > 0.8 ? 'Congested'
        : stress.util > 0.5 ? 'Stressed'
        : 'Low'
        : null;
      onHover({
        x: info.x,
        y: info.y,
        name: d.name,
        voltage: d.voltage,
        flowMW: stress?.flowMW ?? null,
        stressLabel,
        corridorId: cid,
      });
    },
    onClick: (info: PickingInfo<TransmissionLine>) => {
      if (!info.object) return;
      const cid = corridorForLine(info.object.name);
      if (cid) onClick(cid);
    },
  });
}
