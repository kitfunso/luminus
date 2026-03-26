import { TextLayer } from '@deck.gl/layers';

export interface SpreadLabelDatum {
  position: [number, number];
  text: string;
  spread: number;
}

export interface MetricLabelDatum {
  position: [number, number];
  text: string;
}

export interface SpreadLabelLayerOptions {
  data: SpreadLabelDatum[];
}

export interface MetricLabelLayerOptions {
  data: MetricLabelDatum[];
}

export function createSpreadLabelLayer({ data }: SpreadLabelLayerOptions) {
  return new TextLayer<SpreadLabelDatum>({
    id: 'spread-labels',
    data,
    getPosition: (d) => d.position,
    getText: (d) => d.text,
    getSize: 11,
    getColor: (d) =>
      d.spread > 5
        ? [74, 222, 128, 210]
        : d.spread < -5
          ? [248, 113, 113, 210]
          : [250, 204, 21, 200],
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

export function createMetricLabelLayer({ data }: MetricLabelLayerOptions) {
  return new TextLayer<MetricLabelDatum>({
    id: 'metric-labels',
    data,
    getPosition: (d) => d.position,
    getText: (d) => d.text,
    getSize: 16,
    getPixelOffset: [0, -2],
    getColor: [255, 255, 255, 220],
    fontFamily: 'system-ui, sans-serif',
    fontWeight: 700,
    fontSettings: {
      buffer: 16,
    },
    outlineWidth: 3,
    outlineColor: [10, 14, 23, 200],
    billboard: true,
    characterSet: 'auto',
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'center',
    parameters: {
      depthTest: false,
    } as any,
  });
}

export type GenMixLabelDatum = MetricLabelDatum;
export type GenMixLabelLayerOptions = MetricLabelLayerOptions;
export const createGenMixLabelLayer = createMetricLabelLayer;
