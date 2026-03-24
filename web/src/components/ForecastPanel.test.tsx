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
});
