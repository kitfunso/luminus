import type { CountryPrice, CrossBorderFlow } from './data-fetcher';
import { COUNTRY_CENTROIDS } from './countries';
import { getPriceCurrencySymbol, sharesPriceCurrency } from './price-format';

export interface SpreadPair {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  spread: number;
  absSpread: number;
  flowMW: number;
  capacityMW: number;
  utilization: number;
  congestionRent: number;
  currency: string;
  hourlySpread: number[];
  spreadVol: number;
  spreadDirection: 'widening' | 'narrowing' | 'stable';
}

export interface DirectionalSignal {
  iso2: string;
  name: string;
  priceMomentum: 'rising' | 'falling' | 'flat';
  momentumStrength: number;
  currentPrice: number;
  priceChange4h: number;
}

export function computeSpreadPairs(
  prices: CountryPrice[],
  flows: CrossBorderFlow[],
): SpreadPair[] {
  const priceMap = new Map<string, CountryPrice>();
  for (const p of prices) priceMap.set(p.iso2, p);

  return flows
    .map((flow) => {
      const fromPrice = priceMap.get(flow.from);
      const toPrice = priceMap.get(flow.to);
      if (!fromPrice || !toPrice) return null;
      if (!sharesPriceCurrency(flow.from, flow.to)) return null;

      const spread = toPrice.price - fromPrice.price;
      const utilization = flow.capacityMW > 0 ? flow.flowMW / flow.capacityMW : 0;
      const congestionRent = Math.abs(spread) * flow.flowMW;

      const fromHourly = fromPrice.hourly ?? [];
      const toHourly = toPrice.hourly ?? [];
      const minLen = Math.min(fromHourly.length, toHourly.length);
      const hourlySpread = Array.from({ length: minLen }, (_, i) => toHourly[i] - fromHourly[i]);

      const spreadVol = computeVolatility(hourlySpread);
      const spreadDirection = computeSpreadDirection(hourlySpread);

      return {
        from: flow.from,
        to: flow.to,
        fromName: COUNTRY_CENTROIDS[flow.from]?.name ?? flow.from,
        toName: COUNTRY_CENTROIDS[flow.to]?.name ?? flow.to,
        spread: Math.round(spread * 10) / 10,
        absSpread: Math.abs(Math.round(spread * 10) / 10),
        flowMW: flow.flowMW,
        capacityMW: flow.capacityMW,
        utilization: Math.round(utilization * 100),
        congestionRent: Math.round(congestionRent),
        currency: getPriceCurrencySymbol(flow.from),
        hourlySpread,
        spreadVol: Math.round(spreadVol * 10) / 10,
        spreadDirection,
      };
    })
    .filter(Boolean) as SpreadPair[];
}

export function topArbitrageOpportunities(pairs: SpreadPair[], limit = 5): SpreadPair[] {
  return [...pairs]
    .sort((a, b) => b.absSpread - a.absSpread)
    .slice(0, limit);
}

export function topCongestionRents(pairs: SpreadPair[], limit = 5): SpreadPair[] {
  return [...pairs]
    .sort((a, b) => b.congestionRent - a.congestionRent)
    .slice(0, limit);
}

export function computeDirectionalSignals(prices: CountryPrice[]): DirectionalSignal[] {
  return prices
    .map((p) => {
      const hourly = p.hourly ?? [];
      if (hourly.length < 4) return null;

      const recent = hourly.slice(-4);
      const slope = (recent[recent.length - 1] - recent[0]) / recent.length;
      const absSlope = Math.abs(slope);

      const momentum: DirectionalSignal['priceMomentum'] =
        absSlope < 2 ? 'flat' : slope > 0 ? 'rising' : 'falling';

      return {
        iso2: p.iso2,
        name: COUNTRY_CENTROIDS[p.iso2]?.name ?? p.iso2,
        priceMomentum: momentum,
        momentumStrength: Math.round(absSlope * 10) / 10,
        currentPrice: p.price,
        priceChange4h: Math.round((recent[recent.length - 1] - recent[0]) * 10) / 10,
      };
    })
    .filter(Boolean) as DirectionalSignal[];
}

function computeVolatility(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function computeSpreadDirection(hourlySpread: number[]): SpreadPair['spreadDirection'] {
  if (hourlySpread.length < 4) return 'stable';
  const recent = hourlySpread.slice(-4);
  const early = hourlySpread.slice(0, 4);
  const recentAvg = recent.reduce((s, v) => s + Math.abs(v), 0) / recent.length;
  const earlyAvg = early.reduce((s, v) => s + Math.abs(v), 0) / early.length;
  const change = recentAvg - earlyAvg;
  if (Math.abs(change) < 3) return 'stable';
  return change > 0 ? 'widening' : 'narrowing';
}
