import type {
  CountryForecast,
  CountryOutage,
  CountryPrice,
  CrossBorderFlow,
  PowerPlant,
  PriceHistory,
} from './data-fetcher';
import type { LiveDatasetResponse } from './live-data-types';

const ENTSOE_API = 'https://web-api.tp.entsoe.eu/api';
const BMRS_API = 'https://data.elexon.co.uk/bmrs/api/v1';
const ENTSOE_DEFAULT_KEY = 'ffaa7bca-32bf-4430-9877-84efae8f38b1';
const REQUEST_TIMEOUT_MS = 6_000;
const CONCURRENCY = 4;

const WIND_PSR = ['B18', 'B19'];
const SOLAR_PSR = ['B16'];

const COUNTRY_NAMES: Record<string, string> = {
  DE: 'Germany',
  FR: 'France',
  GB: 'United Kingdom',
  ES: 'Spain',
  IT: 'Italy',
  NL: 'Netherlands',
  BE: 'Belgium',
  PL: 'Poland',
  AT: 'Austria',
  CH: 'Switzerland',
  CZ: 'Czech Republic',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  PT: 'Portugal',
  GR: 'Greece',
  RO: 'Romania',
  HU: 'Hungary',
  BG: 'Bulgaria',
  HR: 'Croatia',
  SK: 'Slovakia',
  SI: 'Slovenia',
  IE: 'Ireland',
  LT: 'Lithuania',
  LV: 'Latvia',
  EE: 'Estonia',
  LU: 'Luxembourg',
};

const ISO2_TO_EIC: Record<string, string> = {
  DE: '10Y1001A1001A83F',
  FR: '10YFR-RTE------C',
  GB: '10YGB----------A',
  ES: '10YES-REE------0',
  IT: '10YIT-GRTN-----B',
  NL: '10YNL----------L',
  BE: '10YBE----------2',
  PL: '10YPL-AREA-----S',
  AT: '10YAT-APG------L',
  CH: '10YCH-SWISSGRIDZ',
  CZ: '10YCZ-CEPS-----N',
  SE: '10YSE-1--------K',
  NO: '10YNO-0--------C',
  DK: '10Y1001A1001A796',
  FI: '10YFI-1--------U',
  PT: '10YPT-REN------W',
  GR: '10YGR-HTSO-----Y',
  RO: '10YRO-TEL------P',
  HU: '10YHU-MAVIR----U',
  BG: '10YCA-BULGARIA-R',
  HR: '10YHR-HEP------M',
  SK: '10YSK-SEPS-----K',
  SI: '10YSI-ELES-----O',
  IE: '10Y1001A1001A59C',
  LT: '10YLT-1001A0008Q',
  LV: '10YLV-1001A00074',
  EE: '10Y1001A1001A39I',
  LU: '10Y1001A1001A83F',
};

const FORECAST_COUNTRIES = ['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'PL', 'AT', 'SE', 'DK', 'PT', 'GR', 'FI', 'CZ', 'RO', 'HU'];

const PRICE_ZONE_STRATEGIES: Record<string, { zones?: string[]; aliasOf?: string }> = {
  DE: { zones: ['10Y1001A1001A82H'] },
  LU: { aliasOf: 'DE' },
  FR: { zones: ['10YFR-RTE------C'] },
  GB: { zones: ['10YGB----------A'] },
  ES: { zones: ['10YES-REE------0'] },
  IT: {
    zones: [
      '10Y1001A1001A73I',
      '10Y1001A1001A70O',
      '10Y1001A1001A71M',
      '10Y1001A1001A788',
      '10Y1001A1001A74G',
      '10Y1001A1001A75E',
    ],
  },
  NL: { zones: ['10YNL----------L'] },
  BE: { zones: ['10YBE----------2'] },
  PL: { zones: ['10YPL-AREA-----S'] },
  AT: { zones: ['10YAT-APG------L'] },
  CH: { zones: ['10YCH-SWISSGRIDZ'] },
  CZ: { zones: ['10YCZ-CEPS-----N'] },
  SE: {
    zones: [
      '10Y1001A1001A44P',
      '10Y1001A1001A45N',
      '10Y1001A1001A46L',
      '10Y1001A1001A47J',
    ],
  },
  NO: {
    zones: [
      '10YNO-1--------2',
      '10YNO-2--------T',
      '10YNO-3--------J',
      '10YNO-4--------9',
      '10Y1001A1001A48H',
    ],
  },
  DK: { zones: ['10YDK-1--------W', '10YDK-2--------M'] },
  FI: { zones: ['10YFI-1--------U'] },
  PT: { zones: ['10YPT-REN------W'] },
  GR: { zones: ['10YGR-HTSO-----Y'] },
  RO: { zones: ['10YRO-TEL------P'] },
  HU: { zones: ['10YHU-MAVIR----U'] },
  BG: { zones: ['10YCA-BULGARIA-R'] },
  HR: { zones: ['10YHR-HEP------M'] },
  SK: { zones: ['10YSK-SEPS-----K'] },
  SI: { zones: ['10YSI-ELES-----O'] },
  IE: { zones: ['10Y1001A1001A59C'] },
  LT: { zones: ['10YLT-1001A0008Q'] },
  LV: { zones: ['10YLV-1001A00074'] },
  EE: { zones: ['10Y1001A1001A39I'] },
};

type BootstrapResponse<T> = {
  data: T;
  lastUpdated: string | null;
};

function getEntsoeApiKey(): string {
  if (typeof process !== 'undefined' && process.env?.ENTSOE_API_KEY) {
    return process.env.ENTSOE_API_KEY;
  }
  return ENTSOE_DEFAULT_KEY;
}

function formatEntsoeDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  return `${y}${m}${d}${h}${min}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function datasetEnvelope<T>(
  dataset: string,
  data: T,
  source: 'live' | 'fallback' | 'estimated',
  lastUpdated: string | null,
  hasFallback: boolean,
  options: {
    provider?: string | null;
    intervalStart?: string | null;
    intervalEnd?: string | null;
    error?: string | null;
  } = {},
): LiveDatasetResponse<T> {
  return {
    dataset,
    data,
    provider: options.provider ?? null,
    intervalStart: options.intervalStart ?? null,
    intervalEnd: options.intervalEnd ?? null,
    source,
    lastUpdated,
    hasFallback,
    error: options.error ?? null,
  };
}

async function fetchWithTimeout(url: string, ms = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

async function mapConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit = CONCURRENCY,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function fetchBootstrapJson<T>(requestUrl: string, fileName: string): Promise<BootstrapResponse<T>> {
  const response = await fetch(new URL(`/data/${fileName}`, requestUrl), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Bootstrap data file not found: ${fileName}`);
  }
  return {
    data: await response.json() as T,
    lastUpdated: response.headers.get('last-modified'),
  };
}

function intervalFromTimestamps(timestampsUtc: string[]) {
  if (timestampsUtc.length === 0) {
    return { intervalStart: null, intervalEnd: null };
  }
  return {
    intervalStart: timestampsUtc[0],
    intervalEnd: timestampsUtc[timestampsUtc.length - 1],
  };
}

function toHourStartIso(date: Date) {
  const next = new Date(date);
  next.setUTCMinutes(0, 0, 0);
  return next.toISOString();
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function buildHourlyTimestamps(startIso: string, length: number) {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime()) || length <= 0) {
    return [];
  }
  return Array.from({ length }, (_, index) => addHours(start, index).toISOString());
}

function intervalFromHistory(history: PriceHistory | null) {
  if (!history) {
    return { intervalStart: null, intervalEnd: null };
  }
  if (history.startUtc && history.endUtc) {
    return { intervalStart: history.startUtc, intervalEnd: history.endUtc };
  }

  const timestamps = history.countries.flatMap((country) => {
    if (country.timestampsUtc?.length) {
      return country.timestampsUtc;
    }
    if (history.startUtc) {
      return buildHourlyTimestamps(history.startUtc, country.hourly.length);
    }
    return [];
  });

  return intervalFromTimestamps(timestamps);
}

function intervalFromOutages(outages: CountryOutage[]) {
  const starts = outages
    .flatMap((country) => country.topOutages.map((outage) => Date.parse(outage.start)))
    .filter((value) => Number.isFinite(value));
  const ends = outages
    .flatMap((country) => country.topOutages.map((outage) => Date.parse(outage.expectedReturn)))
    .filter((value) => Number.isFinite(value));

  if (starts.length === 0 || ends.length === 0) {
    return { intervalStart: null, intervalEnd: null };
  }

  return {
    intervalStart: new Date(Math.min(...starts)).toISOString(),
    intervalEnd: new Date(Math.max(...ends)).toISOString(),
  };
}

function meanHourly(hourlySeries: number[][]): number[] {
  const maxLength = hourlySeries.reduce((max, current) => Math.max(max, current.length), 0);
  return Array.from({ length: maxLength }, (_, index) => {
    const values = hourlySeries.map((series) => series[index]).filter((value) => Number.isFinite(value));
    if (values.length === 0) {
      return 0;
    }
    return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
  });
}

function selectMarketIndexRows(
  rows: Array<{ startTime: string; price: number | string; volume?: number | string; dataProvider?: string }> | undefined,
) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const byTimestamp = new Map<string, { startTime: string; price: number; volume: number; dataProvider: string | null }>();

  for (const row of rows) {
    if (!row?.startTime) {
      continue;
    }
    const price = Number(row.price);
    const volume = Number(row.volume ?? 0);
    if (!Number.isFinite(price) || !Number.isFinite(volume) || volume <= 0) {
      continue;
    }

    const current = byTimestamp.get(row.startTime);
    if (!current || volume > current.volume) {
      byTimestamp.set(row.startTime, {
        startTime: row.startTime,
        price,
        volume,
        dataProvider: row.dataProvider ?? null,
      });
    }
  }

  return [...byTimestamp.values()].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
}

function aggregateHourlyPrices(rows: ReturnType<typeof selectMarketIndexRows>): number[] {
  const buckets = new Map<string, number[]>();

  for (const row of rows) {
    const hour = new Date(row.startTime);
    hour.setUTCMinutes(0, 0, 0);
    const key = hour.toISOString();
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key)!.push(row.price);
  }

  return [...buckets.entries()]
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .map(([, prices]) => round1(prices.reduce((sum, value) => sum + value, 0) / prices.length));
}

function aggregateHourlyPriceSeries(rows: ReturnType<typeof selectMarketIndexRows>) {
  const buckets = new Map<string, number[]>();

  for (const row of rows) {
    const hour = new Date(row.startTime);
    hour.setUTCMinutes(0, 0, 0);
    const key = hour.toISOString();
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key)!.push(row.price);
  }

  const ordered = [...buckets.entries()]
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());

  return {
    timestampsUtc: ordered.map(([timestamp]) => timestamp),
    hourly: ordered.map(([, prices]) => round1(prices.reduce((sum, value) => sum + value, 0) / prices.length)),
  };
}

function extractGbMarketIndexPrice(
  payload: { data?: Array<{ startTime: string; price: number | string; volume?: number | string; dataProvider?: string }> } | null | undefined,
) {
  const selected = selectMarketIndexRows(payload?.data);
  if (selected.length === 0) {
    return null;
  }

  const hourly = aggregateHourlyPrices(selected).slice(-24);
  if (hourly.length === 0) {
    return null;
  }

  return {
    avg: round1(hourly.reduce((sum, value) => sum + value, 0) / hourly.length),
    hourly,
    provider: 'elexon' as const,
  };
}

function extractGbMarketIndexSeries(
  payload: { data?: Array<{ startTime: string; price: number | string; volume?: number | string; dataProvider?: string }> } | null | undefined,
) {
  const selected = selectMarketIndexRows(payload?.data);
  if (selected.length === 0) {
    return null;
  }

  const { hourly, timestampsUtc } = aggregateHourlyPriceSeries(selected);
  if (hourly.length === 0) {
    return null;
  }

  return {
    avg: round1(hourly.reduce((sum, value) => sum + value, 0) / hourly.length),
    hourly,
    timestampsUtc,
    provider: 'elexon' as const,
  };
}

function mergePricesWithFallback(live: CountryPrice[], baseline: CountryPrice[]): CountryPrice[] {
  const liveByIso2 = new Map(live.map((entry) => [entry.iso2, entry]));
  const result: CountryPrice[] = [];

  for (const base of baseline) {
    const liveEntry = liveByIso2.get(base.iso2);
    if (liveEntry) {
      result.push({ ...liveEntry, source: 'live', provider: liveEntry.provider || 'entsoe' });
    } else {
      result.push({ ...base, source: 'fallback', provider: base.provider || 'fallback' });
    }
  }

  const baselineIso2s = new Set(baseline.map((entry) => entry.iso2));
  for (const [iso2, liveEntry] of liveByIso2) {
    if (!baselineIso2s.has(iso2)) {
      result.push({ ...liveEntry, source: 'live' });
    }
  }

  return result;
}

async function fetchZonePrice(zone: string): Promise<{ avg: number; hourly: number[] } | null> {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const params = new URLSearchParams({
    securityToken: getEntsoeApiKey(),
    documentType: 'A44',
    in_Domain: zone,
    out_Domain: zone,
    periodStart: formatEntsoeDate(dayStart),
    periodEnd: formatEntsoeDate(dayEnd),
  });

  try {
    const response = await fetchWithTimeout(`${ENTSOE_API}?${params.toString()}`);
    if (!response.ok) {
      return null;
    }

    const series = extractEntsoePriceSeries(await response.text());
    if (!series || series.hourly.length === 0) {
      return null;
    }

    const hourly = series.hourly.slice(-24);
    const avg = round1(hourly.reduce((sum, value) => sum + value, 0) / hourly.length);
    return { avg, hourly };
  } catch {
    return null;
  }
}

export function extractEntsoePriceSeries(xml: string) {
  const periodBlocks = [...xml.matchAll(/<Period>([\s\S]*?)<\/Period>/g)];
  if (periodBlocks.length === 0) {
    return null;
  }

  const parsedPeriods = periodBlocks
    .map(([, periodBlock]) => {
      const periodStartMatch = periodBlock.match(/<timeInterval>[\s\S]*?<start>([^<]+)<\/start>/);
      const resolutionMatch = periodBlock.match(/<resolution>([^<]+)<\/resolution>/);
      const periodStart = periodStartMatch ? new Date(periodStartMatch[1]) : null;
      const resolution = resolutionMatch?.[1] === 'PT15M' ? 15 * 60 * 1000 : 60 * 60 * 1000;

      if (!periodStart || Number.isNaN(periodStart.getTime())) {
        return null;
      }

      const ordered = [...periodBlock.matchAll(/<Point>[\s\S]*?<position>(\d+)<\/position>[\s\S]*?<price\.amount>([\d.-]+)<\/price\.amount>[\s\S]*?<\/Point>/g)]
        .map(([, position, price]) => ({
          timestamp: toHourStartIso(new Date(periodStart.getTime() + (Number(position) - 1) * resolution)),
          price: round1(Number(price)),
        }))
        .filter((point) => Number.isFinite(point.price))
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

      if (ordered.length === 0) {
        return null;
      }

      return {
        timestampsUtc: ordered.map((point) => point.timestamp),
        hourly: ordered.map((point) => point.price),
      };
    })
    .filter((entry): entry is { timestampsUtc: string[]; hourly: number[] } => Boolean(entry));

  if (parsedPeriods.length === 0) {
    return null;
  }

  return aggregateZonePriceSeries(parsedPeriods);
}

async function fetchZonePriceSeries(
  zone: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<{ timestampsUtc: string[]; hourly: number[] } | null> {
  const params = new URLSearchParams({
    securityToken: getEntsoeApiKey(),
    documentType: 'A44',
    in_Domain: zone,
    out_Domain: zone,
    periodStart: formatEntsoeDate(periodStart),
    periodEnd: formatEntsoeDate(periodEnd),
  });

  try {
    const response = await fetchWithTimeout(`${ENTSOE_API}?${params.toString()}`);
    if (!response.ok) {
      return null;
    }
    return extractEntsoePriceSeries(await response.text());
  } catch {
    return null;
  }
}

function aggregateZonePrices(results: Array<{ avg: number; hourly: number[] } | null>) {
  const valid = results.filter((entry): entry is { avg: number; hourly: number[] } => Boolean(entry));
  if (valid.length === 0) {
    return null;
  }

  const hourly = meanHourly(valid.map((entry) => entry.hourly)).filter((value) => Number.isFinite(value));
  if (hourly.length === 0) {
    return null;
  }

  return {
    avg: round1(hourly.reduce((sum, value) => sum + value, 0) / hourly.length),
    hourly,
  };
}

function aggregateZonePriceSeries(
  results: Array<{ timestampsUtc: string[]; hourly: number[] } | null>,
) {
  const buckets = new Map<string, number[]>();

  for (const result of results) {
    if (!result) {
      continue;
    }
    result.timestampsUtc.forEach((timestamp, index) => {
      const value = result.hourly[index];
      if (!Number.isFinite(value)) {
        return;
      }
      if (!buckets.has(timestamp)) {
        buckets.set(timestamp, []);
      }
      buckets.get(timestamp)!.push(value);
    });
  }

  const ordered = [...buckets.entries()]
    .sort((a, b) => Date.parse(a[0]) - Date.parse(b[0]));

  if (ordered.length === 0) {
    return null;
  }

  return {
    timestampsUtc: ordered.map(([timestamp]) => timestamp),
    hourly: ordered.map(([, values]) => round1(values.reduce((sum, value) => sum + value, 0) / values.length)),
  };
}

async function fetchGbMarketIndexSeriesData(
  periodStart: Date,
  periodEnd: Date,
): Promise<{ timestampsUtc: string[]; hourly: number[]; provider: 'elexon' } | null> {
  const params = new URLSearchParams({
    from: periodStart.toISOString(),
    to: periodEnd.toISOString(),
    format: 'json',
  });

  try {
    const response = await fetchWithTimeout(`${BMRS_API}/balancing/pricing/market-index?${params.toString()}`);
    if (!response.ok) {
      return null;
    }
    const payload = await response.json();
    const priceData = extractGbMarketIndexSeries(payload);
    if (!priceData) {
      return null;
    }
    return priceData;
  } catch {
    return null;
  }
}

type HistorySeriesResult = {
  country: PriceHistory['countries'][number];
  provider: 'entsoe' | 'elexon';
};

async function fetchHistoryCountrySeries(
  entry: PriceHistory['countries'][number],
  periodStart: Date,
  periodEnd: Date,
  cache: Map<string, HistorySeriesResult>,
): Promise<HistorySeriesResult | null> {
  const strategy = PRICE_ZONE_STRATEGIES[entry.iso2];

  if (strategy?.aliasOf) {
    const aliased = cache.get(strategy.aliasOf);
    if (!aliased) {
      return null;
    }
    const next = {
      country: {
        ...aliased.country,
        iso2: entry.iso2,
        country: entry.country,
      },
      provider: aliased.provider,
    } satisfies HistorySeriesResult;
    cache.set(entry.iso2, next);
    return next;
  }

  if (entry.iso2 === 'GB') {
    const gbSeries = await fetchGbMarketIndexSeriesData(periodStart, periodEnd);
    if (gbSeries) {
      const next = {
        country: {
          iso2: 'GB',
          country: entry.country,
          hourly: gbSeries.hourly,
          timestampsUtc: gbSeries.timestampsUtc,
        },
        provider: gbSeries.provider,
      } satisfies HistorySeriesResult;
      cache.set(entry.iso2, next);
      return next;
    }
  }

  if (!strategy?.zones?.length) {
    return null;
  }

  const results = await mapConcurrent(
    strategy.zones,
    (zone) => fetchZonePriceSeries(zone, periodStart, periodEnd),
    Math.min(strategy.zones.length, CONCURRENCY),
  );
  const aggregated = aggregateZonePriceSeries(results);
  if (!aggregated) {
    return null;
  }

  const next = {
    country: {
      iso2: entry.iso2,
      country: entry.country,
      hourly: aggregated.hourly,
      timestampsUtc: aggregated.timestampsUtc,
    },
    provider: 'entsoe',
  } satisfies HistorySeriesResult;
  cache.set(entry.iso2, next);
  return next;
}

function ensureHistoryCountryTimestamps(
  country: PriceHistory['countries'][number],
  startUtc: string,
) {
  return {
    ...country,
    timestampsUtc: country.timestampsUtc?.length
      ? country.timestampsUtc
      : buildHourlyTimestamps(startUtc, country.hourly.length),
  };
}

function resolveEnvelopeProvider(providers: string[], fallback = 'bootstrap') {
  const distinct = [...new Set(providers.filter(Boolean))];
  if (distinct.length === 0) {
    return fallback;
  }
  if (distinct.length === 1) {
    return distinct[0];
  }
  return 'mixed';
}

function extractFlowSeries(xml: string) {
  const periods = xml.split(/<Period>/g).slice(1);
  const buckets = new Map<string, number[]>();

  for (const period of periods) {
    const startMatch = period.match(/<start>([^<]+)<\/start>/);
    const resolutionMatch = period.match(/<resolution>([^<]+)<\/resolution>/);
    if (!startMatch) {
      continue;
    }

    const start = new Date(startMatch[1]);
    if (Number.isNaN(start.getTime())) {
      continue;
    }

    const resolution = resolutionMatch?.[1] === 'PT15M' ? 15 * 60 * 1000 : 60 * 60 * 1000;
    const points = [...period.matchAll(/<Point>[\s\S]*?<position>(\d+)<\/position>[\s\S]*?<quantity>([\d.-]+)<\/quantity>[\s\S]*?<\/Point>/g)];

    for (const [, position, quantity] of points) {
      const value = Number(quantity);
      if (!Number.isFinite(value)) {
        continue;
      }
      const timestamp = toHourStartIso(new Date(start.getTime() + (Number(position) - 1) * resolution));
      if (!buckets.has(timestamp)) {
        buckets.set(timestamp, []);
      }
      buckets.get(timestamp)!.push(value);
    }
  }

  const ordered = [...buckets.entries()]
    .sort((a, b) => Date.parse(a[0]) - Date.parse(b[0]));
  if (ordered.length === 0) {
    return null;
  }

  return {
    timestampsUtc: ordered.map(([timestamp]) => timestamp),
    hourlyFlowMW: ordered.map(([, values]) => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)),
  };
}

function normalizeText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function plantKeyFor(country: string, name: string) {
  return `${country.toUpperCase()}:${normalizeText(name).replace(/\s+/g, '-')}`;
}

function matchPlantToOutage(outage: { name: string; fuel: string }, plants: PowerPlant[]) {
  const outageName = normalizeText(outage.name);
  const exact = plants.find((plant) => normalizeText(plant.name) === outageName);
  if (exact) {
    return exact;
  }

  const fuelMatches = plants.filter((plant) => normalizeText(plant.fuel) === normalizeText(outage.fuel));
  const partial = fuelMatches.find((plant) => {
    const plantName = normalizeText(plant.name);
    return plantName.includes(outageName) || outageName.includes(plantName);
  });

  return partial ?? fuelMatches[0] ?? null;
}

async function fetchGbMarketIndexPrice(): Promise<CountryPrice | null> {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const params = new URLSearchParams({
    from: yesterday.toISOString(),
    to: now.toISOString(),
    format: 'json',
  });

  try {
    const response = await fetchWithTimeout(`${BMRS_API}/balancing/pricing/market-index?${params.toString()}`);
    if (!response.ok) {
      return null;
    }
    const payload = await response.json();
    const priceData = extractGbMarketIndexPrice(payload);
    if (!priceData) {
      return null;
    }
    return {
      country: COUNTRY_NAMES.GB,
      iso2: 'GB',
      price: priceData.avg,
      hourly: priceData.hourly,
      source: 'live',
      provider: priceData.provider,
    };
  } catch {
    return null;
  }
}

async function fetchCountryPrice(entry: CountryPrice, cache: Map<string, CountryPrice>): Promise<CountryPrice | null> {
  const strategy = PRICE_ZONE_STRATEGIES[entry.iso2];
  if (strategy?.aliasOf) {
    const aliased = cache.get(strategy.aliasOf);
    if (!aliased) {
      return null;
    }
    return {
      country: entry.country,
      iso2: entry.iso2,
      price: aliased.price,
      hourly: aliased.hourly,
      source: 'live',
      provider: aliased.provider,
    };
  }

  if (!strategy?.zones?.length) {
    return null;
  }

  try {
    const zoneResults = await mapConcurrent(strategy.zones, fetchZonePrice, Math.min(strategy.zones.length, CONCURRENCY));
    const priceData = aggregateZonePrices(zoneResults);
    if (!priceData) {
      if (entry.iso2 === 'GB') {
        const gbPrice = await fetchGbMarketIndexPrice();
        if (gbPrice) {
          cache.set(entry.iso2, gbPrice);
          return gbPrice;
        }
      }
      return null;
    }

    const livePrice: CountryPrice = {
      ...entry,
      price: priceData.avg,
      hourly: priceData.hourly,
      source: 'live',
      provider: 'entsoe',
    };
    cache.set(entry.iso2, livePrice);
    return livePrice;
  } catch {
    return null;
  }
}

export async function getLivePricesResponse(requestUrl: string): Promise<LiveDatasetResponse<CountryPrice[]>> {
  const bootstrap = await fetchBootstrapJson<CountryPrice[]>(requestUrl, 'prices.json');
  const cache = new Map<string, CountryPrice>();
  const directEntries = bootstrap.data.filter((entry) => !PRICE_ZONE_STRATEGIES[entry.iso2]?.aliasOf);
  const aliasEntries = bootstrap.data.filter((entry) => PRICE_ZONE_STRATEGIES[entry.iso2]?.aliasOf);

  const directResults = await mapConcurrent(directEntries, async (entry) => {
    const next = await fetchCountryPrice(entry, cache);
    if (next) {
      cache.set(entry.iso2, next);
    }
    return next;
  }, 8);

  const aliasResults = await Promise.all(aliasEntries.map((entry) => fetchCountryPrice(entry, cache)));

  const live = [
    ...directResults.filter((entry): entry is CountryPrice => Boolean(entry)),
    ...aliasResults.filter((entry): entry is CountryPrice => Boolean(entry)),
  ];

  const updated = mergePricesWithFallback(live, bootstrap.data);
  const liveCount = updated.filter((entry) => entry.source === 'live').length;
  const priceWindow = updated.find((entry) => entry.hourly?.length)?.hourly?.length ?? 24;
  const now = new Date();
  const intervalStart = toHourStartIso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
  const intervalEnd = addHours(new Date(intervalStart), Math.max(priceWindow - 1, 0)).toISOString();

  return datasetEnvelope(
    'prices',
    updated,
    liveCount > 0 ? 'live' : 'fallback',
    liveCount > 0 ? new Date().toISOString() : bootstrap.lastUpdated,
    liveCount !== updated.length,
    {
      provider: liveCount > 0
        ? resolveEnvelopeProvider(updated.filter((entry) => entry.source === 'live').map((entry) => entry.provider ?? ''))
        : 'bootstrap',
      intervalStart,
      intervalEnd,
      error: liveCount > 0 ? null : 'Live price refresh unavailable; serving bootstrap data.',
    },
  );
}

function extractFlowQuantity(xml: string): number | null {
  const matches = [...xml.matchAll(/<quantity>([\d.-]+)<\/quantity>/g)];
  if (matches.length === 0) {
    return null;
  }
  const values = matches.map(([, value]) => Number(value)).filter((value) => Number.isFinite(value));
  if (values.length === 0) {
    return null;
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function fetchCorridorFlow(entry: CrossBorderFlow): Promise<CrossBorderFlow> {
  try {
    const fromEic = ISO2_TO_EIC[entry.from];
    const toEic = ISO2_TO_EIC[entry.to];
    if (!fromEic || !toEic) {
      return entry;
    }

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const params = new URLSearchParams({
      securityToken: getEntsoeApiKey(),
      documentType: 'A11',
      in_Domain: toEic,
      out_Domain: fromEic,
      periodStart: formatEntsoeDate(yesterday),
      periodEnd: formatEntsoeDate(now),
    });

    const response = await fetchWithTimeout(`${ENTSOE_API}?${params.toString()}`);
    if (!response.ok) {
      return entry;
    }

    const xml = await response.text();
    const series = extractFlowSeries(xml);
    const flowMW = extractFlowQuantity(xml);
    if (flowMW === null && !series) {
      return entry;
    }

    return {
      ...entry,
      flowMW: series?.hourlyFlowMW.at(-1) ?? flowMW ?? entry.flowMW,
      hourlyFlowMW: series?.hourlyFlowMW ?? entry.hourlyFlowMW,
      hourlyTimestampsUtc: series?.timestampsUtc ?? entry.hourlyTimestampsUtc,
    };
  } catch {
    return entry;
  }
}

export async function getLiveFlowsResponse(requestUrl: string): Promise<LiveDatasetResponse<CrossBorderFlow[]>> {
  const bootstrap = await fetchBootstrapJson<CrossBorderFlow[]>(requestUrl, 'flows.json');
  const updated = await mapConcurrent(bootstrap.data, fetchCorridorFlow, 4);
  const changed = updated.some((entry, index) =>
    entry.flowMW !== bootstrap.data[index]?.flowMW
    || (entry.hourlyFlowMW?.length ?? 0) > 0,
  );
  const flowTimestamps = updated.flatMap((entry) => entry.hourlyTimestampsUtc ?? []);
  const flowInterval = intervalFromTimestamps(flowTimestamps);

  return datasetEnvelope(
    'flows',
    updated,
    changed ? 'live' : 'fallback',
    changed ? new Date().toISOString() : bootstrap.lastUpdated,
    !changed,
    {
      provider: changed ? 'entsoe' : 'bootstrap',
      intervalStart: flowInterval.intervalStart,
      intervalEnd: flowInterval.intervalEnd,
      error: changed ? null : 'Live corridor refresh unavailable; serving bootstrap data.',
    },
  );
}

function extractTimeSeriesQuantities(xml: string, psrTypes: string[]) {
  const blocks = xml.split(/<TimeSeries>/g).slice(1);
  const hourlyBuckets = new Map<number, number[]>();

  for (const block of blocks) {
    const psrMatch = block.match(/<psrType>([^<]+)<\/psrType>/);
    if (!psrMatch || !psrTypes.includes(psrMatch[1])) {
      continue;
    }

    const periods = block.split(/<Period>/g).slice(1);
    for (const period of periods) {
      const startMatch = period.match(/<start>([^<]+)<\/start>/);
      const resMatch = period.match(/<resolution>([^<]+)<\/resolution>/);
      if (!startMatch) {
        continue;
      }

      const startTime = new Date(startMatch[1]);
      const resolution = resMatch ? resMatch[1] : 'PT1H';
      const stepMs = resolution === 'PT15M' ? 15 * 60 * 1000 : 60 * 60 * 1000;
      const points = [...period.matchAll(/<Point>[\s\S]*?<position>(\d+)<\/position>[\s\S]*?<quantity>([\d.]+)<\/quantity>[\s\S]*?<\/Point>/g)];

      for (const [, posStr, qtyStr] of points) {
        const pos = Number(posStr);
        const qty = Number(qtyStr);
        const pointTime = new Date(startTime.getTime() + (pos - 1) * stepMs);
        const hourKey = pointTime.getUTCHours();

        if (!hourlyBuckets.has(hourKey)) {
          hourlyBuckets.set(hourKey, []);
        }
        hourlyBuckets.get(hourKey)!.push(qty);
      }
    }
  }

  const hourly: number[] = [];
  for (let h = 0; h < 24; h++) {
    const vals = hourlyBuckets.get(h);
    if (vals && vals.length > 0) {
      hourly.push(vals.reduce((a, b) => a + b, 0) / (vals.length / psrTypes.length || 1));
    }
  }

  return {
    totalMW: hourly.length > 0 ? hourly.reduce((a, b) => a + b, 0) / hourly.length : 0,
    hourly,
  };
}

function computeForecastMetrics(forecastHourly: number[], actualHourly: number[]) {
  if (forecastHourly.length === 0 || actualHourly.length === 0) {
    return { mae: 0, mape: 0, bias: 0, surpriseDirection: 'none' as const, surpriseMagnitude: 0 };
  }

  const len = Math.min(forecastHourly.length, actualHourly.length);
  let sumAbsError = 0;
  let sumError = 0;
  let sumAbsPctError = 0;
  let validPctCount = 0;

  for (let i = 0; i < len; i++) {
    const error = actualHourly[i] - forecastHourly[i];
    sumAbsError += Math.abs(error);
    sumError += error;
    if (forecastHourly[i] > 0) {
      sumAbsPctError += Math.abs(error / forecastHourly[i]);
      validPctCount++;
    }
  }

  const mae = sumAbsError / len;
  const bias = sumError / len;
  const mape = validPctCount > 0 ? (sumAbsPctError / validPctCount) * 100 : 0;
  const latestActual = actualHourly[actualHourly.length - 1];
  const latestForecast = forecastHourly[Math.min(forecastHourly.length - 1, actualHourly.length - 1)];
  const surpriseMagnitude = Math.abs(latestActual - latestForecast);
  const surpriseDirection: 'above' | 'below' | 'none' =
    latestActual > latestForecast * 1.1 ? 'above' :
    latestActual < latestForecast * 0.9 ? 'below' :
    'none';

  return {
    mae: Math.round(mae),
    mape: Math.round(mape * 10) / 10,
    bias: Math.round(bias),
    surpriseDirection,
    surpriseMagnitude: Math.round(surpriseMagnitude),
  };
}

async function fetchEntsoeXml(iso2: string, documentType: string, processType: string): Promise<string | null> {
  const eic = ISO2_TO_EIC[iso2];
  if (!eic) {
    return null;
  }

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const params = new URLSearchParams({
    securityToken: getEntsoeApiKey(),
    documentType,
    processType,
    in_Domain: eic,
    periodStart: formatEntsoeDate(dayStart),
    periodEnd: formatEntsoeDate(dayEnd),
  });

  try {
    const response = await fetchWithTimeout(`${ENTSOE_API}?${params.toString()}`);
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

async function fetchCountryForecast(iso2: string): Promise<CountryForecast | null> {
  const [forecastXml, actualXml] = await Promise.all([
    fetchEntsoeXml(iso2, 'A69', 'A01'),
    fetchEntsoeXml(iso2, 'A75', 'A16'),
  ]);

  if (!forecastXml || !actualXml) {
    return null;
  }

  const windForecast = extractTimeSeriesQuantities(forecastXml, WIND_PSR);
  const solarForecast = extractTimeSeriesQuantities(forecastXml, SOLAR_PSR);
  const windActual = extractTimeSeriesQuantities(actualXml, WIND_PSR);
  const solarActual = extractTimeSeriesQuantities(actualXml, SOLAR_PSR);

  if (windForecast.hourly.length === 0 && solarForecast.hourly.length === 0) {
    return null;
  }

  return {
    country: COUNTRY_NAMES[iso2] ?? iso2,
    iso2,
    wind: {
      forecastMW: Math.round(windForecast.totalMW),
      actualMW: Math.round(windActual.totalMW),
      forecastHourly: windForecast.hourly.map((value) => Math.round(value)),
      actualHourly: windActual.hourly.map((value) => Math.round(value)),
      ...computeForecastMetrics(windForecast.hourly, windActual.hourly),
    },
    solar: {
      forecastMW: Math.round(solarForecast.totalMW),
      actualMW: Math.round(solarActual.totalMW),
      forecastHourly: solarForecast.hourly.map((value) => Math.round(value)),
      actualHourly: solarActual.hourly.map((value) => Math.round(value)),
      ...computeForecastMetrics(solarForecast.hourly, solarActual.hourly),
    },
  };
}

export async function getLiveForecastsResponse(requestUrl: string): Promise<LiveDatasetResponse<CountryForecast[]>> {
  const bootstrap = await fetchBootstrapJson<CountryForecast[]>(requestUrl, 'forecast-errors.json');
  const results = await mapConcurrent(FORECAST_COUNTRIES, fetchCountryForecast, 3);
  const live = results
    .filter((entry): entry is CountryForecast => Boolean(entry))
    .sort((a, b) => (Math.abs(b.wind.bias) + Math.abs(b.solar.bias)) - (Math.abs(a.wind.bias) + Math.abs(a.solar.bias)));

  const hasLive = live.length > 0;
  const forecastWindow = (hasLive ? live : bootstrap.data)[0]?.wind.forecastHourly.length ?? 24;
  const forecastStart = toHourStartIso(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())));
  return datasetEnvelope(
    'forecasts',
    hasLive ? live : bootstrap.data,
    hasLive ? 'live' : 'fallback',
    hasLive ? new Date().toISOString() : bootstrap.lastUpdated,
    !hasLive,
    {
      provider: hasLive ? 'entsoe' : 'bootstrap',
      intervalStart: forecastStart,
      intervalEnd: addHours(new Date(forecastStart), Math.max(forecastWindow - 1, 0)).toISOString(),
      error: hasLive ? null : 'Live forecast refresh unavailable; serving bootstrap data.',
    },
  );
}

export async function getLiveOutagesResponse(requestUrl: string): Promise<LiveDatasetResponse<CountryOutage[]>> {
  const bootstrap = await fetchBootstrapJson<CountryOutage[]>(requestUrl, 'outages.json');
  const plants = (await fetchBootstrapJson<PowerPlant[]>(requestUrl, 'power-plants.json')).data;
  const plantsByCountry = new Map<string, PowerPlant[]>();

  for (const plant of plants) {
    if (!plantsByCountry.has(plant.country)) {
      plantsByCountry.set(plant.country, []);
    }
    plantsByCountry.get(plant.country)!.push(plant);
  }

  const enriched = bootstrap.data.map((country) => ({
    ...country,
    topOutages: country.topOutages.map((outage) => {
      const plant = matchPlantToOutage(outage, plantsByCountry.get(country.iso2) ?? []);
      return {
        ...outage,
        country: country.iso2,
        outageType: outage.type,
        plantKey: plant ? plantKeyFor(country.iso2, plant.name) : plantKeyFor(country.iso2, outage.name),
        coordinates: plant ? [plant.lat, plant.lon] as [number, number] : null,
      };
    }),
  }));
  const outageInterval = intervalFromOutages(enriched);
  return datasetEnvelope(
    'outages',
    enriched,
    'fallback',
    bootstrap.lastUpdated,
    true,
    {
      provider: 'bootstrap',
      intervalStart: outageInterval.intervalStart,
      intervalEnd: outageInterval.intervalEnd,
      error: 'Live outage refresh unavailable on Pages deploy; serving bootstrap data.',
    },
  );
}

export async function getLiveHistoryResponse(requestUrl: string): Promise<LiveDatasetResponse<PriceHistory | null>> {
  const bootstrap = await fetchBootstrapJson<PriceHistory>(requestUrl, 'history.json');
  const bootstrapInterval = intervalFromHistory(bootstrap.data);
  if (!bootstrap.data?.countries?.length || !bootstrapInterval.intervalStart || !bootstrapInterval.intervalEnd) {
    return datasetEnvelope(
      'history',
      bootstrap.data,
      'fallback',
      bootstrap.lastUpdated,
      true,
      {
        provider: 'bootstrap',
        intervalStart: bootstrapInterval.intervalStart,
        intervalEnd: bootstrapInterval.intervalEnd,
        error: 'Live history refresh unavailable; serving bootstrap data.',
      },
    );
  }

  const periodStart = new Date(bootstrapInterval.intervalStart);
  const periodEnd = addHours(new Date(bootstrapInterval.intervalEnd), 1);
  const cache = new Map<string, HistorySeriesResult>();
  const directCountries = bootstrap.data.countries.filter((country) => !PRICE_ZONE_STRATEGIES[country.iso2]?.aliasOf);
  const aliasCountries = bootstrap.data.countries.filter((country) => PRICE_ZONE_STRATEGIES[country.iso2]?.aliasOf);

  const directResults = await mapConcurrent(
    directCountries,
    (country) => fetchHistoryCountrySeries(country, periodStart, periodEnd, cache),
    4,
  );
  const aliasResults = await Promise.all(aliasCountries.map((country) => fetchHistoryCountrySeries(country, periodStart, periodEnd, cache)));

  const liveResults = [...directResults, ...aliasResults].filter((entry): entry is HistorySeriesResult => Boolean(entry));
  const liveByIso2 = new Map(liveResults.map((entry) => [entry.country.iso2, entry]));

  const countries = bootstrap.data.countries.map((country) => {
    const liveCountry = liveByIso2.get(country.iso2)?.country;
    return liveCountry
      ? liveCountry
      : ensureHistoryCountryTimestamps(country, bootstrapInterval.intervalStart!);
  });
  const liveInterval = intervalFromTimestamps(countries.flatMap((country) => country.timestampsUtc ?? []));
  const hasLive = liveResults.length > 0;
  const hasFallback = liveResults.length !== bootstrap.data.countries.length;
  const resolvedInterval = hasLive
    ? {
        intervalStart: liveInterval.intervalStart ?? bootstrapInterval.intervalStart,
        intervalEnd: liveInterval.intervalEnd ?? bootstrapInterval.intervalEnd,
      }
    : bootstrapInterval;

  return datasetEnvelope(
    'history',
    {
      ...bootstrap.data,
      startUtc: resolvedInterval.intervalStart,
      endUtc: resolvedInterval.intervalEnd,
      countries,
    },
    hasLive ? 'live' : 'fallback',
    hasLive ? new Date().toISOString() : bootstrap.lastUpdated,
    hasFallback || !hasLive,
    {
      provider: hasLive
        ? resolveEnvelopeProvider(liveResults.map((entry) => entry.provider))
        : 'bootstrap',
      intervalStart: resolvedInterval.intervalStart,
      intervalEnd: resolvedInterval.intervalEnd,
      error: hasLive ? null : 'Live history refresh unavailable; serving bootstrap data.',
    },
  );
}
