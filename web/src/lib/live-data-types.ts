import type {
  CountryForecast,
  CountryOutage,
  CountryPrice,
  CrossBorderFlow,
  PowerPlant,
  PriceHistory,
  TransmissionLine,
} from './data-fetcher';

export type LiveDataSource = 'live' | 'bootstrap' | 'fallback';

export interface LiveDataset<T> {
  data: T;
  lastUpdated: string | null;
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
  lastUpdated: string | null;
  source: LiveDataSource;
  hasFallback: boolean;
  data: T;
  error?: string | null;
}
