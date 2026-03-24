import { describe, expect, it } from 'vitest';
import type { CountryOutage, CountryPrice } from './data-fetcher';
import type { LiveDataset } from './live-data-types';
import {
  createLiveDataset,
  failLiveDatasetRefresh,
  markDatasetStale,
} from './live-data-store';

function samplePrices(): CountryPrice[] {
  return [
    {
      country: 'Germany',
      iso2: 'DE',
      price: 72.4,
      hourly: [70, 71, 72],
      source: 'live',
      provider: 'entsoe',
    },
  ];
}

function sampleOutages(): CountryOutage[] {
  return [
    {
      country: 'France',
      iso2: 'FR',
      unavailableMW: 1800,
      outageCount: 2,
      topOutages: [],
    },
  ];
}

describe('live data dataset state', () => {
  it('keeps last good payload when refresh fails', () => {
    const lastGoodPrices = samplePrices();
    const current: LiveDataset<CountryPrice[]> = createLiveDataset(lastGoodPrices, {
      lastUpdated: '2026-03-24T09:42:00Z',
      source: 'live',
    });

    const next = failLiveDatasetRefresh(current, new Error('ENTSO-E timeout'), {
      hasFallback: true,
    });

    expect(next.data).toEqual(lastGoodPrices);
    expect(next.hasFallback).toBe(true);
    expect(next.error).toBe('ENTSO-E timeout');
    expect(next.isRefreshing).toBe(false);
    expect(next.isLoading).toBe(false);
  });

  it('marks a dataset stale after the stale threshold passes', () => {
    const current: LiveDataset<CountryOutage[]> = createLiveDataset(sampleOutages(), {
      lastUpdated: '2026-03-24T09:42:00Z',
      source: 'live',
    });

    const stale = markDatasetStale(
      current,
      Date.parse('2026-03-24T09:50:01Z'),
      8 * 60 * 1000,
    );

    expect(stale.isStale).toBe(true);
    expect(stale.lastUpdated).toBe('2026-03-24T09:42:00Z');
    expect(stale.data).toEqual(current.data);
  });
});
