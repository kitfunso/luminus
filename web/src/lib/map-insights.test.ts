import { describe, expect, it } from 'vitest';

import { buildCountryMarketPulse, buildMapMetricLabelData } from './map-insights';
import type {
  CountryForecast,
  CountryOutage,
  CountryPrice,
  CrossBorderFlow,
} from './data-fetcher';

describe('map-insights', () => {
  it('builds map labels from live day-ahead prices', () => {
    const labels = buildMapMetricLabelData([
      { country: 'France', iso2: 'FR', price: 71.8, source: 'live', provider: 'entsoe' },
      { country: 'Germany', iso2: 'DE', price: -4.2, source: 'live', provider: 'entsoe' },
    ]);

    expect(labels).toEqual([
      { position: [2.3488, 46.6034], text: 'EUR72' },
      { position: [10.4515, 51.1657], text: '-EUR4' },
    ]);
  });

  it('builds a market pulse without repeating day-ahead price', () => {
    const prices: CountryPrice[] = [
      { country: 'France', iso2: 'FR', price: 71.8, source: 'live', provider: 'entsoe' },
    ];
    const flows: CrossBorderFlow[] = [
      {
        from: 'FR',
        to: 'DE',
        fromLat: 46.6034,
        fromLon: 2.3488,
        toLat: 51.1657,
        toLon: 10.4515,
        flowMW: 1820,
        capacityMW: 4000,
      },
      {
        from: 'ES',
        to: 'FR',
        fromLat: 40.4637,
        fromLon: -3.7492,
        toLat: 46.6034,
        toLon: 2.3488,
        flowMW: 200,
        capacityMW: 2600,
      },
    ];
    const outages: CountryOutage[] = [
      {
        country: 'France',
        iso2: 'FR',
        unavailableMW: 1800,
        outageCount: 2,
        topOutages: [],
      },
    ];
    const forecasts: CountryForecast[] = [
      {
        country: 'France',
        iso2: 'FR',
        wind: {
          forecastMW: 10000,
          actualMW: 11050,
          forecastHourly: [9800, 10000, 10300],
          actualHourly: [10200, 11050, 10800],
          mae: 650,
          mape: 6.4,
          bias: 1050,
          surpriseDirection: 'above',
          surpriseMagnitude: 1050,
        },
        solar: {
          forecastMW: 2400,
          actualMW: 2280,
          forecastHourly: [0, 900, 2400],
          actualHourly: [0, 850, 2280],
          mae: 120,
          mape: 4.8,
          bias: -120,
          surpriseDirection: 'none',
          surpriseMagnitude: 0,
        },
      },
    ];

    const pulse = buildCountryMarketPulse('FR', prices, flows, outages, forecasts);

    expect(pulse.title).toBe('France');
    expect(pulse.eyebrow).toBe('Market Pulse');
    expect(pulse.content).toEqual({
      'Net position': 'Exporting 1,620 MW',
      Outages: '2 outages, 1,800 MW offline',
      'Forecast surprise': 'Wind above forecast by 1,050 MW',
      Live: 'Live via ENTSO-E',
    });
    expect(Object.keys(pulse.content)).not.toContain('Day-Ahead Price');
  });
});
