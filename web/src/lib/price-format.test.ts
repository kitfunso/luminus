import { describe, expect, it } from 'vitest';

import {
  formatPriceLabel,
  formatPriceValue,
  formatPriceWithUnit,
  getPriceUnitLabel,
  sharesPriceCurrency,
} from './price-format';

describe('price-format', () => {
  it('formats euro and pound labels by market', () => {
    expect(formatPriceLabel(71.8, 'FR')).toBe('€72');
    expect(formatPriceLabel(-4.2, 'DE')).toBe('-€4');
    expect(formatPriceLabel(63.4, 'GB')).toBe('£63');
  });

  it('formats units and values for display surfaces', () => {
    expect(formatPriceValue(71.8, 'FR')).toBe('€71.8');
    expect(formatPriceWithUnit(63.4, 'GB')).toBe('£63.4/MWh');
    expect(getPriceUnitLabel('GB')).toBe('£/MWh');
  });

  it('detects mixed-currency corridors', () => {
    expect(sharesPriceCurrency('FR', 'DE')).toBe(true);
    expect(sharesPriceCurrency('FR', 'GB')).toBe(false);
  });
});
