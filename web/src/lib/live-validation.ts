import type { LiveDatasetResponse } from './live-data-types';

export function validateDatasetEnvelope<T>(envelope: LiveDatasetResponse<T>): string[] {
  const issues: string[] = [];

  if (!envelope.dataset) {
    issues.push('dataset is required');
  }

  if (!envelope.source) {
    issues.push('source is required');
  }

  if (envelope.source === 'live' && !envelope.provider) {
    issues.push('live datasets must declare a provider');
  }

  if (envelope.source === 'live' && !envelope.lastUpdated) {
    issues.push('live datasets must declare lastUpdated');
  }

  if (envelope.isStale && !envelope.lastUpdated) {
    issues.push('stale datasets must retain lastUpdated');
  }

  if (envelope.hasFallback && envelope.source === 'live' && envelope.error) {
    issues.push('live datasets with fallback should not expose a blocking error');
  }

  if (envelope.intervalStart && envelope.intervalEnd) {
    const start = Date.parse(envelope.intervalStart);
    const end = Date.parse(envelope.intervalEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      issues.push('interval bounds must be valid and ordered');
    }
  }

  if ((envelope.intervalStart && !envelope.intervalEnd) || (!envelope.intervalStart && envelope.intervalEnd)) {
    issues.push('intervalStart and intervalEnd must be provided together');
  }

  if (envelope.source === 'fallback' && !envelope.hasFallback) {
    issues.push('fallback datasets must set hasFallback');
  }

  if (envelope.source === 'estimated' && envelope.provider == null) {
    issues.push('estimated datasets should declare provenance');
  }

  return issues;
}

export function validateOutageRollup(
  country: { unavailableMW: number },
  plants: Array<{ unavailableMW: number }>,
): string[] {
  const sum = Math.round(plants.reduce((total, plant) => total + plant.unavailableMW, 0));
  if (Math.round(country.unavailableMW) !== sum) {
    return [`country unavailableMW ${country.unavailableMW} does not match plant sum ${sum}`];
  }
  return [];
}

export function validateChartWindow(
  timestampsUtc: string[],
  values: number[],
): string[] {
  const issues: string[] = [];
  if (timestampsUtc.length !== values.length) {
    issues.push('timestamps and values length mismatch');
  }

  for (let index = 1; index < timestampsUtc.length; index += 1) {
    const prev = Date.parse(timestampsUtc[index - 1]);
    const current = Date.parse(timestampsUtc[index]);
    if (!Number.isFinite(prev) || !Number.isFinite(current) || current <= prev) {
      issues.push('timestamps must be strictly increasing');
      break;
    }
  }

  return issues;
}

export function validateReplayAlignment(
  selectedTimestamp: string,
  intervalStart: string,
  intervalEnd: string,
): string[] {
  const selected = Date.parse(selectedTimestamp);
  const start = Date.parse(intervalStart);
  const end = Date.parse(intervalEnd);

  if (!Number.isFinite(selected) || !Number.isFinite(start) || !Number.isFinite(end)) {
    return ['replay timestamps must be valid ISO strings'];
  }

  if (selected < start || selected > end) {
    return ['selected replay timestamp falls outside interval'];
  }

  return [];
}
