const GBP_MARKETS = new Set(['GB']);

export const MIXED_PRICE_UNIT_LABEL = 'Local currency/MWh';

function normalizeIso2(iso2: string | null | undefined) {
  return iso2?.trim().toUpperCase() ?? '';
}

export function usesPound(iso2: string | null | undefined) {
  return GBP_MARKETS.has(normalizeIso2(iso2));
}

export function sharesPriceCurrency(leftIso2: string | null | undefined, rightIso2: string | null | undefined) {
  return usesPound(leftIso2) === usesPound(rightIso2);
}

export function getPriceCurrencySymbol(iso2: string | null | undefined) {
  return usesPound(iso2) ? '\u00A3' : '\u20AC';
}

export function getPriceUnitLabel(iso2: string | null | undefined) {
  return `${getPriceCurrencySymbol(iso2)}/MWh`;
}

export function formatPriceLabel(value: number, iso2: string | null | undefined) {
  const rounded = Math.round(value);
  const symbol = getPriceCurrencySymbol(iso2);
  return `${rounded < 0 ? '-' : ''}${symbol}${Math.abs(rounded)}`;
}

export function formatPriceValue(
  value: number,
  iso2: string | null | undefined,
  fractionDigits = 1,
) {
  const symbol = getPriceCurrencySymbol(iso2);
  const formatter = new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${value < 0 ? '-' : ''}${symbol}${formatter.format(Math.abs(value))}`;
}

export function formatPriceWithUnit(
  value: number,
  iso2: string | null | undefined,
  fractionDigits = 1,
) {
  return `${formatPriceValue(value, iso2, fractionDigits)}/MWh`;
}
