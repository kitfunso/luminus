import { GeoJsonLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import { priceToColor } from '../colors';
import { COUNTRY_CENTROIDS } from '../countries';
import type { CountryPrice } from '../data-fetcher';

export interface PriceLayerOptions {
  geoJson: unknown;
  priceLookup: Map<string, CountryPrice>;
  onHover: (info: { x: number; y: number; country: string; iso2: string; price: number | null } | null) => void;
  onClick: (iso2: string) => void;
  opacity?: number;
}

export function createPriceLayer({
  geoJson,
  priceLookup,
  onHover,
  onClick,
  opacity = 200,
}: PriceLayerOptions) {
  return new GeoJsonLayer({
    id: 'price-heatmap',
    data: geoJson as any,
    filled: true,
    stroked: true,
    getFillColor: (f: any) => {
      const iso = f.properties?.ISO_A2 || '';
      const priceData = priceLookup.get(iso);
      if (!priceData) return [60, 60, 80, Math.round(opacity * 0.35)];
      const [r, g, b, a] = priceToColor(priceData.price);
      return [r, g, b, Math.round(Math.min(a, opacity) * 0.72)];
    },
    getLineColor: [132, 151, 176, 36],
    getLineWidth: 0.7,
    lineWidthMinPixels: 0.35,
    pickable: true,
    autoHighlight: true,
    highlightColor: [56, 189, 248, 60],
    updateTriggers: { getFillColor: [priceLookup] },
    onHover: (info: PickingInfo) => {
      if (!info.object) {
        onHover(null);
        return;
      }
      const props = (info.object as any).properties || {};
      const iso = props.ISO_A2 || '';
      const priceData = priceLookup.get(iso);
      const countryName = COUNTRY_CENTROIDS[iso]?.name || props.name || iso;
      onHover({
        x: info.x,
        y: info.y,
        country: countryName,
        iso2: iso,
        price: priceData?.price ?? null,
      });
    },
    onClick: (info: PickingInfo) => {
      if (!info.object) return;
      const iso = (info.object as any).properties?.ISO_A2 || '';
      if (iso) onClick(iso);
    },
  });
}
