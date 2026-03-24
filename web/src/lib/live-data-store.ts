import type { LiveDataSource, LiveDataset } from './live-data-types';
import type {
  CountryForecast,
  CountryOutage,
  CountryPrice,
  CrossBorderFlow,
  PriceHistory,
} from './data-fetcher';

interface CreateLiveDatasetOptions {
  lastUpdated?: string | null;
  source?: LiveDataSource;
  isLoading?: boolean;
  isRefreshing?: boolean;
  isStale?: boolean;
  hasFallback?: boolean;
  error?: string | null;
}

interface FailedRefreshOptions {
  hasFallback?: boolean;
  source?: LiveDataSource;
}

export interface LiveDatasetMap {
  prices: LiveDataset<CountryPrice[]>;
  flows: LiveDataset<CrossBorderFlow[]>;
  outages: LiveDataset<CountryOutage[]>;
  forecasts: LiveDataset<CountryForecast[]>;
  history: LiveDataset<PriceHistory | null>;
}

export interface LiveStatusSummary {
  status: 'live' | 'refreshing' | 'stale' | 'fallback';
  label: string;
  updatedAtLabel: string;
  timestampLabel: string;
  autoRefreshLabel: string;
  hasFallback: boolean;
  hasStale: boolean;
  isRefreshing: boolean;
}

const EMPTY_PRICES: CountryPrice[] = [];
const EMPTY_FLOWS: CrossBorderFlow[] = [];
const EMPTY_OUTAGES: CountryOutage[] = [];
const EMPTY_FORECASTS: CountryForecast[] = [];

function formatUtcLabel(iso: string | null): { updatedAtLabel: string; timestampLabel: string } {
  if (!iso) {
    return {
      updatedAtLabel: 'Updated pending',
      timestampLabel: 'pending',
    };
  }

  const formatted = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(new Date(iso));

  return {
    updatedAtLabel: `Updated ${formatted} UTC`,
    timestampLabel: `${formatted} UTC`,
  };
}

export function createEmptyLiveDatasetMap(): LiveDatasetMap {
  return {
    prices: createLiveDataset(EMPTY_PRICES, { isLoading: true }),
    flows: createLiveDataset(EMPTY_FLOWS, { isLoading: true }),
    outages: createLiveDataset(EMPTY_OUTAGES, { isLoading: true }),
    forecasts: createLiveDataset(EMPTY_FORECASTS, { isLoading: true }),
    history: createLiveDataset<PriceHistory | null>(null, { isLoading: true }),
  };
}

export function beginDatasetRefresh<T>(current: LiveDataset<T>): LiveDataset<T> {
  return {
    ...current,
    isLoading: current.data == null || (Array.isArray(current.data) && current.data.length === 0),
    isRefreshing: true,
    error: null,
  };
}

export function summarizeLiveStatus(
  datasets: LiveDatasetMap,
  refreshIntervalMs: number,
): LiveStatusSummary {
  const entries = Object.values(datasets);
  const lastUpdatedCandidates = entries
    .map((dataset) => dataset.lastUpdated)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  const mostRecentUpdatedAt = lastUpdatedCandidates[0] ?? null;
  const hasFallback = entries.some((dataset) => dataset.hasFallback || dataset.source === 'fallback');
  const hasStale = entries.some((dataset) => dataset.isStale);
  const isRefreshing = entries.some((dataset) => dataset.isRefreshing);
  const autoRefreshMinutes = Math.max(1, Math.round(refreshIntervalMs / 60_000));
  const timestamp = formatUtcLabel(mostRecentUpdatedAt);

  if (isRefreshing) {
    return {
      status: 'refreshing',
      label: 'Refreshing',
      updatedAtLabel: timestamp.updatedAtLabel,
      timestampLabel: timestamp.timestampLabel,
      autoRefreshLabel: `Auto-refresh ${autoRefreshMinutes}m`,
      hasFallback,
      hasStale,
      isRefreshing,
    };
  }

  if (hasStale) {
    return {
      status: 'stale',
      label: 'Stale',
      updatedAtLabel: timestamp.updatedAtLabel,
      timestampLabel: timestamp.timestampLabel,
      autoRefreshLabel: `Auto-refresh ${autoRefreshMinutes}m`,
      hasFallback,
      hasStale,
      isRefreshing,
    };
  }

  if (hasFallback) {
    return {
      status: 'fallback',
      label: 'Fallback',
      updatedAtLabel: timestamp.updatedAtLabel,
      timestampLabel: timestamp.timestampLabel,
      autoRefreshLabel: `Auto-refresh ${autoRefreshMinutes}m`,
      hasFallback,
      hasStale,
      isRefreshing,
    };
  }

  return {
    status: 'live',
    label: 'Live',
    updatedAtLabel: timestamp.updatedAtLabel,
    timestampLabel: timestamp.timestampLabel,
    autoRefreshLabel: `Auto-refresh ${autoRefreshMinutes}m`,
    hasFallback,
    hasStale,
    isRefreshing,
  };
}

export function createLiveDataset<T>(
  data: T,
  options: CreateLiveDatasetOptions = {},
): LiveDataset<T> {
  return {
    data,
    lastUpdated: options.lastUpdated ?? null,
    source: options.source ?? 'bootstrap',
    isLoading: options.isLoading ?? false,
    isRefreshing: options.isRefreshing ?? false,
    isStale: options.isStale ?? false,
    hasFallback: options.hasFallback ?? false,
    error: options.error ?? null,
  };
}

export function failLiveDatasetRefresh<T>(
  current: LiveDataset<T>,
  error: Error,
  options: FailedRefreshOptions = {},
): LiveDataset<T> {
  return {
    ...current,
    source: options.source ?? current.source,
    isLoading: false,
    isRefreshing: false,
    hasFallback: options.hasFallback ?? current.hasFallback,
    error: error.message,
  };
}

export function markDatasetStale<T>(
  current: LiveDataset<T>,
  nowMs: number,
  staleAfterMs: number,
): LiveDataset<T> {
  if (!current.lastUpdated) {
    return current;
  }

  return {
    ...current,
    isStale: nowMs - Date.parse(current.lastUpdated) > staleAfterMs,
  };
}
