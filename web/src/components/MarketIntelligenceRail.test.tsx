import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CountryForecast,
  CountryOutage,
  CountryPrice,
  CrossBorderFlow,
  PowerPlant,
} from '@/lib/data-fetcher';
import type { TyndpProject } from '@/lib/tyndp';
import type { IntelligenceView } from '@/lib/store';
import type { LiveStatusSummary } from '@/lib/live-data-store';
import MarketIntelligenceRail from './MarketIntelligenceRail';

afterEach(() => {
  cleanup();
});

function samplePrices(): CountryPrice[] {
  return [
    { country: 'Germany', iso2: 'DE', price: 72.4, hourly: [70, 72, 75] },
    { country: 'France', iso2: 'FR', price: 58.3, hourly: [56, 58, 60] },
  ];
}

function sampleFlows(): CrossBorderFlow[] {
  return [
    {
      from: 'DE',
      to: 'FR',
      fromLat: 51.17,
      fromLon: 10.45,
      toLat: 46.6,
      toLon: 2.35,
      flowMW: 1850,
      capacityMW: 4800,
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

function sampleForecasts(): CountryForecast[] {
  return [
    {
      country: 'Germany',
      iso2: 'DE',
      wind: {
        forecastMW: 12000,
        actualMW: 10900,
        forecastHourly: [11800, 12000, 12200],
        actualHourly: [10800, 10900, 11100],
        mae: 900,
        mape: 7.5,
        bias: -1100,
        surpriseDirection: 'below',
        surpriseMagnitude: 1100,
      },
      solar: {
        forecastMW: 3400,
        actualMW: 3600,
        forecastHourly: [0, 1200, 3400],
        actualHourly: [0, 1400, 3600],
        mae: 180,
        mape: 5.2,
        bias: 200,
        surpriseDirection: 'above',
        surpriseMagnitude: 200,
      },
    },
  ];
}

function samplePlants(): PowerPlant[] {
  return [
    {
      name: 'Cattenom',
      fuel: 'Nuclear',
      capacity: 5200,
      lat: 49.406,
      lon: 6.22,
      country: 'FR',
      year: '1986',
    },
  ];
}

function sampleLiveStatus(overrides: Partial<LiveStatusSummary> = {}): LiveStatusSummary {
  return {
    status: 'live',
    label: 'Live',
    updatedAtLabel: 'Updated 09:42 UTC',
    autoRefreshLabel: 'Auto-refresh 5m',
    hasFallback: false,
    hasStale: false,
    isRefreshing: false,
    ...overrides,
  };
}

function renderRail(activeView: IntelligenceView = 'outages') {
  const onViewChange = vi.fn();
  const onRefresh = vi.fn();

  render(
    <MarketIntelligenceRail
      activeView={activeView}
      prices={samplePrices()}
      flows={sampleFlows()}
      outages={sampleOutages()}
      forecasts={sampleForecasts()}
      plants={samplePlants()}
      projects={[] as TyndpProject[]}
      liveStatus={sampleLiveStatus()}
      onViewChange={onViewChange}
      onRefresh={onRefresh}
      onSelectCountry={vi.fn()}
      onSelectCorridor={vi.fn()}
      onSelectPlant={vi.fn()}
      onExpandSeries={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  return { onViewChange, onRefresh };
}

describe('MarketIntelligenceRail', () => {
  it('renders one intelligence view at a time and switches through the shared rail tabs', () => {
    const { onViewChange } = renderRail('outages');

    expect(screen.getAllByRole('heading', { name: /outage radar/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: /forecast vs actual/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /forecast vs actual/i }));

    expect(onViewChange).toHaveBeenCalledWith('forecast');
  });

  it('shows the live freshness strip and manual refresh control inside the rail header', () => {
    const { onRefresh } = renderRail('brief');

    expect(screen.getAllByText(/updated 09:42 utc/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/auto-refresh 5m/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /refresh now/i }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
