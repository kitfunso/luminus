import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AssetTimeSeries from './AssetTimeSeries';

describe('AssetTimeSeries', () => {
  it('opens expanded analysis from the country price chart', () => {
    const onExpandSeries = vi.fn();

    render(
      <AssetTimeSeries
        asset={{ kind: 'country', iso2: 'FR' }}
        prices={[
          {
            country: 'France',
            iso2: 'FR',
            price: 72,
            hourly: [66, 72, 81],
            source: 'live',
            provider: 'entsoe',
          },
        ]}
        flows={[]}
        history={{
          startUtc: '2026-03-20T00:00:00.000Z',
          endUtc: '2026-03-24T00:00:00.000Z',
          days: 4,
          countries: [
            {
              iso2: 'FR',
              country: 'France',
              hourly: [60, 64, 70],
              timestampsUtc: [
                '2026-03-20T00:00:00.000Z',
                '2026-03-20T01:00:00.000Z',
                '2026-03-20T02:00:00.000Z',
              ],
            },
          ],
        }}
        onClose={vi.fn()}
        onExpandSeries={onExpandSeries}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /expand/i })[0]);

    expect(onExpandSeries).toHaveBeenCalledTimes(1);
  });
});
