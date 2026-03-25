import { ArcLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import { COUNTRY_CENTROIDS } from '../countries';
import type { CrossBorderFlow, CountryPrice } from '../data-fetcher';
import { getPriceCurrencySymbol, sharesPriceCurrency } from '../price-format';

/** Neutral steel-blue for all flow arcs (decoupled from price heatmap color channel). */
const FLOW_COLOR: [number, number, number, number] = [200, 210, 230, 180];

export interface FlowLayerOptions {
  flows: CrossBorderFlow[];
  priceLookup: Map<string, CountryPrice>;
  onHover: (info: {
    x: number;
    y: number;
    from: string;
    to: string;
    flowMW: number;
    capacityMW: number;
    spread: number | null;
    spreadUnit: string | null;
  } | null) => void;
  onClick: (flow: CrossBorderFlow) => void;
  opacity?: number;
}

/** Tiered width by magnitude: <500=2, 500-2000=4, 2000-5000=6, >5000=8 */
function flowWidth(d: CrossBorderFlow): number {
  if (d.flowMW > 5000) return 8;
  if (d.flowMW > 2000) return 6;
  if (d.flowMW > 500) return 4;
  return 2;
}

export function createFlowLayer({
  flows,
  priceLookup,
  onHover,
  onClick,
  opacity = 180,
}: FlowLayerOptions) {
  const color: [number, number, number, number] = [
    FLOW_COLOR[0],
    FLOW_COLOR[1],
    FLOW_COLOR[2],
    opacity,
  ];

  return new ArcLayer<CrossBorderFlow>({
    id: 'cross-border-flows',
    data: flows,
    getSourcePosition: (d) => [d.fromLon, d.fromLat],
    getTargetPosition: (d) => [d.toLon, d.toLat],
    getSourceColor: color,
    getTargetColor: color,
    getWidth: flowWidth,
    widthMinPixels: 2,
    widthMaxPixels: 10,
    greatCircle: true,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 60],
    onHover: (info: PickingInfo<CrossBorderFlow>) => {
      if (!info.object) {
        onHover(null);
        return;
      }
      const d = info.object;
      const fromName = COUNTRY_CENTROIDS[d.from]?.name || d.from;
      const toName = COUNTRY_CENTROIDS[d.to]?.name || d.to;
      const fp = priceLookup.get(d.from);
      const tp = priceLookup.get(d.to);
      const sameCurrency = sharesPriceCurrency(d.from, d.to);
      const spread = fp && tp && sameCurrency
        ? Math.round((tp.price - fp.price) * 10) / 10
        : null;
      onHover({
        x: info.x,
        y: info.y,
        from: fromName,
        to: toName,
        flowMW: d.flowMW,
        capacityMW: d.capacityMW,
        spread,
        spreadUnit: sameCurrency ? `${getPriceCurrencySymbol(d.from)}/MWh` : null,
      });
    },
    onClick: (info: PickingInfo<CrossBorderFlow>) => {
      if (!info.object) return;
      onClick(info.object);
    },
  });
}
