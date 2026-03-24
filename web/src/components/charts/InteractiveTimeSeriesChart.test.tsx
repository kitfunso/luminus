import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import InteractiveTimeSeriesChart from './InteractiveTimeSeriesChart';

describe('InteractiveTimeSeriesChart', () => {
  it('tracks hovered timestamp and value', () => {
    render(
      <InteractiveTimeSeriesChart
        title="Price profile"
        unitLabel="EUR/MWh"
        timestampsUtc={[
          '2026-03-24T00:00:00.000Z',
          '2026-03-24T01:00:00.000Z',
          '2026-03-24T02:00:00.000Z',
        ]}
        series={[
          {
            id: 'fr-price',
            label: 'France price',
            values: [50, 65, 80],
            color: '#38bdf8',
          },
        ]}
      />,
    );

    const track = screen.getByTestId('timeseries-track');
    fireEvent.mouseMove(track, { nativeEvent: { offsetX: 160 } });

    expect(screen.getByText('France price')).toBeInTheDocument();
    expect(screen.getByText(/EUR\/MWh/)).toBeInTheDocument();
  });
});
