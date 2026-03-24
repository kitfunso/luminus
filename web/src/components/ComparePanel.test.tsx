import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ComparePanel from './ComparePanel';

describe('ComparePanel', () => {
  it('expands country comparison charts', () => {
    const onExpandSeries = vi.fn();

    render(
      <ComparePanel
        selectedCountries={['FR', 'DE']}
        plants={[]}
        prices={[
          { country: 'France', iso2: 'FR', price: 72, hourly: [66, 72, 81] },
          { country: 'Germany', iso2: 'DE', price: 81, hourly: [76, 81, 88] },
        ]}
        flows={[]}
        onRemoveCountry={vi.fn()}
        onClose={vi.fn()}
        onExpandSeries={onExpandSeries}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /expand/i })[0]);

    expect(onExpandSeries).toHaveBeenCalledTimes(1);
  });
});
