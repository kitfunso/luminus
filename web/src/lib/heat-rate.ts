import type { CountryPrice } from './data-fetcher';

/** TTF gas hub price in EUR/MWh (approximate; would be fetched from GIE in production) */
const DEFAULT_GAS_PRICE_EUR_MWH = 35;

/** Typical efficient CCGT heat rate (GJ_gas / MWh_elec) */
const TYPICAL_CCGT_HEAT_RATE = 2.0;

/** Spark spread thresholds (EUR/MWh) */
const PROFITABLE_THRESHOLD = 5;

export interface ImpliedHeatRate {
  iso2: string;
  name: string;
  powerPrice: number;
  gasPrice: number;
  heatRate: number;       // power_price / gas_price
  sparkSpread: number;    // power_price - (gas_price * typical_heat_rate)
  signal: 'profitable' | 'marginal' | 'uneconomic';
}

/**
 * Compute implied heat rates and spark spreads for each pricing zone.
 *
 * Heat rate = power price / gas price.
 * Spark spread = power price - (gas price * typical CCGT heat rate of 2.0).
 *
 * Signal thresholds:
 *  - profitable: spark spread > 5 EUR/MWh
 *  - marginal:   spark spread 0-5 EUR/MWh
 *  - uneconomic: spark spread < 0 EUR/MWh
 */
export function computeImpliedHeatRates(
  prices: CountryPrice[],
  gasPrice: number = DEFAULT_GAS_PRICE_EUR_MWH,
): ImpliedHeatRate[] {
  if (gasPrice <= 0) return [];

  return prices.map((p) => {
    const heatRate = p.price / gasPrice;
    const sparkSpread = p.price - gasPrice * TYPICAL_CCGT_HEAT_RATE;

    let signal: ImpliedHeatRate['signal'];
    if (sparkSpread > PROFITABLE_THRESHOLD) {
      signal = 'profitable';
    } else if (sparkSpread >= 0) {
      signal = 'marginal';
    } else {
      signal = 'uneconomic';
    }

    return {
      iso2: p.iso2,
      name: p.country,
      powerPrice: p.price,
      gasPrice,
      heatRate: Math.round(heatRate * 100) / 100,
      sparkSpread: Math.round(sparkSpread * 10) / 10,
      signal,
    };
  });
}
