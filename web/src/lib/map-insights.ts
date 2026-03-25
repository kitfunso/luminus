import { COUNTRY_CENTROIDS } from './countries';
import type {
  CountryForecast,
  CountryOutage,
  CountryPrice,
  CrossBorderFlow,
} from './data-fetcher';
import { formatPriceLabel } from './price-format';

export interface MapMetricLabelDatum {
  position: [number, number];
  text: string;
}

function formatNetPosition(flowMW: number) {
  const magnitude = Math.abs(Math.round(flowMW)).toLocaleString();
  if (flowMW > 25) {
    return `Exporting ${magnitude} MW`;
  }
  if (flowMW < -25) {
    return `Importing ${magnitude} MW`;
  }
  return 'Balanced';
}

function formatOutageSummary(outage: CountryOutage | null) {
  if (!outage || outage.unavailableMW <= 0) {
    return 'No active outages';
  }
  return `${outage.outageCount} outage${outage.outageCount === 1 ? '' : 's'}, ${outage.unavailableMW.toLocaleString()} MW offline`;
}

function formatForecastSurprise(forecast: CountryForecast | null) {
  if (!forecast) {
    return 'No live forecast signal';
  }

  const candidates = [
    { label: 'Wind', source: forecast.wind },
    { label: 'Solar', source: forecast.solar },
  ]
    .filter((entry) => entry.source.surpriseDirection !== 'none')
    .sort((left, right) => right.source.surpriseMagnitude - left.source.surpriseMagnitude);

  const strongest = candidates[0];
  if (!strongest) {
    return 'No material forecast surprise';
  }

  const direction = strongest.source.surpriseDirection === 'above' ? 'above' : 'below';
  return `${strongest.label} ${direction} forecast by ${strongest.source.surpriseMagnitude.toLocaleString()} MW`;
}

function formatLiveSource(price: CountryPrice | null) {
  if (!price) {
    return 'Price feed unavailable';
  }

  if (price.source === 'fallback') {
    return 'Fallback snapshot';
  }

  if (price.provider === 'elexon') {
    return 'Live via Elexon';
  }

  if (price.provider === 'entsoe') {
    return 'Live via ENTSO-E';
  }

  return 'Live';
}

export function buildMapMetricLabelData(prices: CountryPrice[]): MapMetricLabelDatum[] {
  return prices
    .map((price) => {
      const centroid = COUNTRY_CENTROIDS[price.iso2];
      if (!centroid || !Number.isFinite(price.price)) {
        return null;
      }

      return {
        position: [centroid.lon, centroid.lat] as [number, number],
        text: formatPriceLabel(price.price, price.iso2),
      };
    })
    .filter((entry): entry is MapMetricLabelDatum => Boolean(entry));
}

export function buildCountryMarketPulse(
  iso2: string,
  prices: CountryPrice[],
  flows: CrossBorderFlow[],
  outages: CountryOutage[],
  forecasts: CountryForecast[],
) {
  const price = prices.find((entry) => entry.iso2 === iso2) ?? null;
  const outage = outages.find((entry) => entry.iso2 === iso2) ?? null;
  const forecast = forecasts.find((entry) => entry.iso2 === iso2) ?? null;
  const countryName = COUNTRY_CENTROIDS[iso2]?.name ?? price?.country ?? iso2;

  const netFlowMW = flows.reduce((sum, flow) => {
    if (flow.from === iso2) {
      return sum + flow.flowMW;
    }
    if (flow.to === iso2) {
      return sum - flow.flowMW;
    }
    return sum;
  }, 0);

  return {
    title: countryName,
    eyebrow: 'Market Pulse',
    content: {
      'Net position': formatNetPosition(netFlowMW),
      Outages: formatOutageSummary(outage),
      'Forecast surprise': formatForecastSurprise(forecast),
      Live: formatLiveSource(price),
    } satisfies Record<string, string>,
  };
}
