import type {
  CountryForecast,
  CountryOutage,
  CountryPrice,
  CrossBorderFlow,
  PowerPlant,
  PriceHistory,
  TransmissionLine,
} from './data-fetcher';

export type LiveDataSource = 'live' | 'fallback' | 'estimated';

export interface LiveDataset<T> {
  data: T;
  provider: string | null;
  lastUpdated: string | null;
  intervalStart: string | null;
  intervalEnd: string | null;
  source: LiveDataSource;
  isLoading: boolean;
  isRefreshing: boolean;
  isStale: boolean;
  hasFallback: boolean;
  error: string | null;
}

export interface LiveDashboardData {
  plants: PowerPlant[];
  prices: CountryPrice[];
  flows: CrossBorderFlow[];
  transmissionLines: TransmissionLine[];
  outages: CountryOutage[];
  forecasts: CountryForecast[];
  history: PriceHistory | null;
}

export interface LiveDatasetResponse<T> {
  dataset: string;
  provider: string | null;
  lastUpdated: string | null;
  intervalStart: string | null;
  intervalEnd: string | null;
  source: LiveDataSource;
  isRefreshing?: boolean;
  isStale?: boolean;
  hasFallback: boolean;
  data: T;
  error: string | null;
}
