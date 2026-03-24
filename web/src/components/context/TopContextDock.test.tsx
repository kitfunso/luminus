import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import TopContextDock from './TopContextDock';

describe('TopContextDock', () => {
  it('renders a country context in the top dock', () => {
    render(
      <TopContextDock
        detail={{
          kind: 'country',
          data: {
            country: 'France',
            iso2: 'FR',
            price: 72,
            hourly: [60, 72, 88],
            source: 'live',
            provider: 'entsoe',
          },
        }}
        plants={[]}
        prices={[
          {
            country: 'France',
            iso2: 'FR',
            price: 72,
            hourly: [60, 72, 88],
            source: 'live',
            provider: 'entsoe',
          },
        ]}
        flows={[]}
        outages={[]}
        forecasts={[]}
        onClose={vi.fn()}
        onExpandSeries={vi.fn()}
      />,
    );

    expect(screen.getByText('France')).toBeInTheDocument();
    expect(screen.getAllByText(/Day-ahead price/i).length).toBeGreaterThan(0);
  });
});
