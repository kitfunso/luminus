import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ForecastPanel from './ForecastPanel';

describe('ForecastPanel', () => {
  it('expands chart analysis from forecast cards', () => {
    const onExpandSeries = vi.fn();

    render(
      <ForecastPanel
        embedded
        onClose={vi.fn()}
        onExpandSeries={onExpandSeries}
        forecasts={[
          {
            country: 'France',
            iso2: 'FR',
            wind: {
              forecastMW: 10000,
              actualMW: 9300,
              forecastHourly: [9800, 10000, 10100],
              actualHourly: [9200, 9300, 9500],
              mae: 700,
              mape: 7.2,
              bias: -700,
              surpriseDirection: 'below',
              surpriseMagnitude: 700,
            },
            solar: {
              forecastMW: 2400,
              actualMW: 2500,
              forecastHourly: [0, 900, 2400],
              actualHourly: [0, 940, 2500],
              mae: 100,
              mape: 4.1,
              bias: 100,
              surpriseDirection: 'none',
              surpriseMagnitude: 0,
            },
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /france/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /expand/i })[0]);

    expect(onExpandSeries).toHaveBeenCalledTimes(1);
  });

  it('marks missing actual coverage as pending instead of showing a false error rate', () => {
    render(
      <ForecastPanel
        embedded
        onClose={vi.fn()}
        forecasts={[
          {
            country: 'Germany',
            iso2: 'DE',
            wind: {
              forecastMW: 12000,
              actualMW: 0,
              forecastHourly: [11800, 12000, 12200, 12100, 11900, 11750],
              actualHourly: [],
              mae: 0,
              mape: 0,
              bias: 0,
              surpriseDirection: 'none',
              surpriseMagnitude: 0,
            },
            solar: {
              forecastMW: 3400,
              actualMW: 0,
              forecastHourly: [0, 1200, 3400, 2800, 900, 0],
              actualHourly: [],
              mae: 0,
              mape: 0,
              bias: 0,
              surpriseDirection: 'none',
              surpriseMagnitude: 0,
            },
          },
        ]}
      />,
    );

    expect(screen.getByText(/actual pending/i)).toBeInTheDocument();
    expect(screen.queryByText(/100.0% err/i)).not.toBeInTheDocument();
  });
});
