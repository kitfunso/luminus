import { TextLayer } from '@deck.gl/layers';

export interface SignalLabelDatum {
  position: [number, number];
  text: string;
  color: [number, number, number, number];
}

export interface SignalLayerOptions {
  data: SignalLabelDatum[];
}

export function createSignalLayer({ data }: SignalLayerOptions) {
  return new TextLayer<SignalLabelDatum>({
    id: 'signal-labels',
    data,
    getPosition: (d) => d.position,
    getText: (d) => d.text,
    getSize: 12,
    getPixelOffset: [0, 14],
    getColor: (d) => d.color,
    fontFamily: 'system-ui, sans-serif',
    fontWeight: 700,
    outlineWidth: 3,
    outlineColor: [10, 14, 23, 220],
    billboard: true,
    characterSet: 'auto',
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'center',
    pickable: false,
    parameters: {
      depthTest: false,
    } as any,
  });
}
