import type { LiveDataSource, LiveDataset } from './live-data-types';

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
