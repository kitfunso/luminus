import type { CountryPrice, ForecastSource, HistoryCountry } from './data-fetcher';

function currentUtcDayStartIso() {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  )).toISOString();
}

export function buildHourlyTimestamps(startIso: string, length: number) {
  const start = new Date(startIso);
  if (!Number.isFinite(start.getTime()) || length <= 0) {
    return [];
  }

  return Array.from({ length }, (_, index) =>
    new Date(start.getTime() + index * 60 * 60 * 1000).toISOString(),
  );
}

export function resolvePriceTimestamps(price: Pick<CountryPrice, 'hourly' | 'hourlyTimestampsUtc'>) {
  if (price.hourlyTimestampsUtc?.length) {
    return price.hourlyTimestampsUtc;
  }
  return buildHourlyTimestamps(currentUtcDayStartIso(), price.hourly?.length ?? 0);
}

export function resolveForecastTimestamps(source: Pick<ForecastSource, 'forecastHourly' | 'actualHourly' | 'timestampsUtc'>) {
  if (source.timestampsUtc?.length) {
    return source.timestampsUtc;
  }
  return buildHourlyTimestamps(
    currentUtcDayStartIso(),
    Math.max(source.forecastHourly.length, source.actualHourly.length),
  );
}

export function resolveHistoryTimestamps(
  historyCountry: Pick<HistoryCountry, 'hourly' | 'timestampsUtc'> | null | undefined,
  fallbackStartUtc: string,
) {
  if (!historyCountry) {
    return [];
  }
  if (historyCountry.timestampsUtc?.length) {
    return historyCountry.timestampsUtc;
  }
  return buildHourlyTimestamps(fallbackStartUtc, historyCountry.hourly.length);
}
