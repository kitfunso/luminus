import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import type {
  CountryForecast,
  CountryOutage,
  CountryPrice,
  CrossBorderFlow,
  PriceHistory,
} from './data-fetcher';
import type { LiveDatasetResponse } from './live-data-types';

const require = createRequire(import.meta.url);
const { extractGbMarketIndexPrice } = require('../../scripts/lib/gb-market-index.js') as {
  extractGbMarketIndexPrice: (payload: { data?: unknown[] } | null | undefined) => {
    avg: number;
    hourly: number[];
    provider: 'elexon';
  } | null;
};
const { mergePricesWithFallback } = require('../../scripts/lib/price-merge.js') as {
  mergePricesWithFallback: (live: CountryPrice[], baseline: CountryPrice[]) => CountryPrice[];
};
const {
  extractTimeSeriesQuantities,
  computeForecastMetrics,
  WIND_PSR,
  SOLAR_PSR,
} = require('../../scripts/lib/entsoe-forecast.js') as {
  extractTimeSeriesQuantities: (xml: string, psrTypes: string[]) => { totalMW: number; hourly: number[] };
  computeForecastMetrics: (
    forecastHourly: number[],
    actualHourly: number[],
  ) => {
    mae: number;
    mape: number;
    bias: number;
    surpriseDirection: 'above' | 'below' | 'none';
    surpriseMagnitude: number;
  };
  WIND_PSR: string[];
  SOLAR_PSR: string[];
};
const {
  extractXmlDocumentsFromZipBuffer,
  parseCurrentGenerationOutage,
} = require('../../scripts/lib/entsoe-outages.js') as {
  extractXmlDocumentsFromZipBuffer: (buf: Buffer) => string[];
  parseCurrentGenerationOutage: (xml: string, now?: Date) => {
    name: string;
    fuel: string;
    unavailableMW: number;
    type: 'planned' | 'unplanned';
    start: string;
    expectedReturn: string;
  } | null;
};

const ENTSOE_API = 'https://web-api.tp.entsoe.eu/api';
const BMRS_API = 'https://data.elexon.co.uk/bmrs/api/v1';
const ENTSOE_DEFAULT_KEY = 'ffaa7bca-32bf-4430-9877-84efae8f38b1';
const REQUEST_TIMEOUT_MS = 6_000;
const CONCURRENCY = 4;

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

function ensureEntsoeApiKey() {
  if (!process.env.ENTSOE_API_KEY) {
    process.env.ENTSOE_API_KEY = ENTSOE_DEFAULT_KEY;
  }
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

async function readBootstrapJson<T>(fileName: string): Promise<T> {
  const candidates = [
    path.join(process.cwd(), 'public', 'data', fileName),
    path.join(process.cwd(), 'web', 'public', 'data', fileName),
  ];

  for (const candidate of candidates) {
    try {
      const text = await fs.readFile(candidate, 'utf8');
      return JSON.parse(text) as T;
    } catch {
      continue;
    }
  }

  throw new Error(`Bootstrap data file not found: ${fileName}`);
}

async function readBootstrapStat(fileName: string): Promise<string | null> {
  const candidates = [
    path.join(process.cwd(), 'public', 'data', fileName),
    path.join(process.cwd(), 'web', 'public', 'data', fileName),
  ];

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      return stat.mtime.toISOString();
    } catch {
      continue;
    }
  }

  return null;
}

function datasetEnvelope<T>(
  dataset: string,
  data: T,
  source: 'live' | 'fallback' | 'estimated',
  lastUpdated: string | null,
  hasFallback: boolean,
  error?: string | null,
): LiveDatasetResponse<T> {
  return {
    dataset,
    data,
    provider: null,
    source,
    lastUpdated,
    intervalStart: null,
    intervalEnd: null,
    hasFallback,
    error: error ?? null,
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

async function fetchZonePrice(zone: string): Promise<{ avg: number; hourly: number[] } | null> {
  ensureEntsoeApiKey();

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const params = new URLSearchParams({
    securityToken: process.env.ENTSOE_API_KEY!,
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
    const xml = await response.text();
    const matches = [...xml.matchAll(/<Point>[\s\S]*?<position>(\d+)<\/position>[\s\S]*?<price\.amount>([\d.-]+)<\/price\.amount>[\s\S]*?<\/Point>/g)];
    if (matches.length === 0) {
      return null;
    }

    const points = matches
      .map(([, position, price]) => ({
        hour: Number(position) - 1,
        price: Number(price),
      }))
      .filter((point) => Number.isFinite(point.hour) && Number.isFinite(point.price))
      .sort((a, b) => a.hour - b.hour);

    if (points.length === 0) {
      return null;
    }

    const hourly = points.map((point) => round1(point.price)).slice(0, 24);
    const avg = round1(hourly.reduce((sum, value) => sum + value, 0) / hourly.length);
    return { avg, hourly };
  } catch {
    return null;
  }
}

function aggregateZonePrices(results: Array<{ avg: number; hourly: number[] } | null>): { avg: number; hourly: number[] } | null {
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

  const resolvedIso2 = entry.iso2;
  const resolvedStrategy = PRICE_ZONE_STRATEGIES[resolvedIso2];

  if (!resolvedStrategy?.zones || resolvedStrategy.zones.length === 0) {
    return null;
  }

  try {
    const zoneResults = await mapConcurrent(resolvedStrategy.zones, fetchZonePrice, Math.min(resolvedStrategy.zones.length, CONCURRENCY));
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

export async function getLivePricesResponse(): Promise<LiveDatasetResponse<CountryPrice[]>> {
  const bootstrap = await readBootstrapJson<CountryPrice[]>('prices.json');
  const cache = new Map<string, CountryPrice>();
  const directEntries = bootstrap.filter((entry) => !PRICE_ZONE_STRATEGIES[entry.iso2]?.aliasOf);
  const aliasEntries = bootstrap.filter((entry) => PRICE_ZONE_STRATEGIES[entry.iso2]?.aliasOf);

  const directResults = await mapConcurrent(directEntries, async (entry) => {
    const next = await fetchCountryPrice(entry, cache);
    if (next) {
      cache.set(entry.iso2, next);
    }
    return next;
  }, 8);

  const aliasResults = aliasEntries.map((entry) => fetchCountryPrice(entry, cache));

  const live = [
    ...directResults.filter((entry): entry is CountryPrice => Boolean(entry)),
    ...(await Promise.all(aliasResults)).filter((entry): entry is CountryPrice => Boolean(entry)),
  ];

  const updated = mergePricesWithFallback(live, bootstrap);
  const liveCount = updated.filter((entry) => entry.source === 'live').length;
  const lastUpdated = liveCount > 0 ? new Date().toISOString() : await readBootstrapStat('prices.json');

  return datasetEnvelope(
    'prices',
    updated,
    liveCount > 0 ? 'live' : 'fallback',
    lastUpdated,
    liveCount !== updated.length,
    liveCount > 0 ? null : 'Live price refresh unavailable; serving bootstrap data.',
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
    ensureEntsoeApiKey();
    const fromEic = ISO2_TO_EIC[entry.from];
    const toEic = ISO2_TO_EIC[entry.to];
    if (!fromEic || !toEic) {
      return entry;
    }

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const params = new URLSearchParams({
      securityToken: process.env.ENTSOE_API_KEY!,
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
    const flowMW = extractFlowQuantity(xml);
    if (flowMW === null) {
      return entry;
    }

    return {
      ...entry,
      flowMW,
    };
  } catch {
    return entry;
  }
}

export async function getLiveFlowsResponse(): Promise<LiveDatasetResponse<CrossBorderFlow[]>> {
  const bootstrap = await readBootstrapJson<CrossBorderFlow[]>('flows.json');
  const updated = await mapConcurrent(bootstrap, fetchCorridorFlow, 4);
  const changed = updated.some((entry, index) => entry.flowMW !== bootstrap[index]?.flowMW);
  const lastUpdated = changed ? new Date().toISOString() : await readBootstrapStat('flows.json');

  return datasetEnvelope(
    'flows',
    updated,
    changed ? 'live' : 'fallback',
    lastUpdated,
    !changed,
    changed ? null : 'Live corridor refresh unavailable; serving bootstrap data.',
  );
}

async function extractEntsoeXmlDocuments(response: Response): Promise<string[]> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('zip') || contentType.includes('octet-stream')) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return extractXmlDocumentsFromZipBuffer(buffer);
  }
  return [await response.text()];
}

async function fetchCountryOutages(iso2: string): Promise<CountryOutage | null> {
  const eic = ISO2_TO_EIC[iso2];
  if (!eic) {
    return null;
  }

  ensureEntsoeApiKey();

  const now = new Date();
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const windowEnd = new Date(windowStart);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 2);

  const params = new URLSearchParams({
    securityToken: process.env.ENTSOE_API_KEY!,
    documentType: 'A80',
    biddingZone_Domain: eic,
    periodStart: formatEntsoeDate(windowStart),
    periodEnd: formatEntsoeDate(windowEnd),
  });

  try {
    const response = await fetchWithTimeout(`${ENTSOE_API}?${params.toString()}`);
    if (!response.ok) {
      return null;
    }

    const docs = await extractEntsoeXmlDocuments(response);
    const parsed = docs
      .map((xml) => parseCurrentGenerationOutage(xml, now))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (parsed.length === 0) {
      return null;
    }

    const byName = new Map<string, (typeof parsed)[number]>();
    for (const outage of parsed) {
      const existing = byName.get(outage.name);
      if (!existing || outage.unavailableMW > existing.unavailableMW) {
        byName.set(outage.name, outage);
      }
    }

    const topOutages = [...byName.values()].sort((a, b) => b.unavailableMW - a.unavailableMW);
    return {
      country: COUNTRY_NAMES[iso2] ?? iso2,
      iso2,
      unavailableMW: Math.round(topOutages.reduce((sum, outage) => sum + outage.unavailableMW, 0)),
      outageCount: topOutages.length,
      topOutages: topOutages.slice(0, 5),
    };
  } catch {
    return null;
  }
}

export async function getLiveOutagesResponse(): Promise<LiveDatasetResponse<CountryOutage[]>> {
  const bootstrap = await readBootstrapJson<CountryOutage[]>('outages.json');
  const results = await mapConcurrent(Object.keys(COUNTRY_NAMES), fetchCountryOutages, 4);
  const live = results
    .filter((entry): entry is CountryOutage => Boolean(entry))
    .sort((a, b) => b.unavailableMW - a.unavailableMW);

  const hasLive = live.length > 0;
  return datasetEnvelope(
    'outages',
    hasLive ? live : bootstrap,
    hasLive ? 'live' : 'fallback',
    hasLive ? new Date().toISOString() : await readBootstrapStat('outages.json'),
    !hasLive,
    hasLive ? null : 'Live outage refresh unavailable; serving bootstrap data.',
  );
}

async function fetchEntsoeXml(iso2: string, documentType: string, processType: string): Promise<string | null> {
  const eic = ISO2_TO_EIC[iso2];
  if (!eic) {
    return null;
  }

  ensureEntsoeApiKey();

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const params = new URLSearchParams({
    securityToken: process.env.ENTSOE_API_KEY!,
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

export async function getLiveForecastsResponse(): Promise<LiveDatasetResponse<CountryForecast[]>> {
  const bootstrap = await readBootstrapJson<CountryForecast[]>('forecast-errors.json');
  const results = await mapConcurrent(FORECAST_COUNTRIES, fetchCountryForecast, 3);
  const live = results
    .filter((entry): entry is CountryForecast => Boolean(entry))
    .sort((a, b) => (Math.abs(b.wind.bias) + Math.abs(b.solar.bias)) - (Math.abs(a.wind.bias) + Math.abs(a.solar.bias)));

  const hasLive = live.length > 0;
  return datasetEnvelope(
    'forecasts',
    hasLive ? live : bootstrap,
    hasLive ? 'live' : 'fallback',
    hasLive ? new Date().toISOString() : await readBootstrapStat('forecast-errors.json'),
    !hasLive,
    hasLive ? null : 'Live forecast refresh unavailable; serving bootstrap data.',
  );
}

export async function getLiveHistoryResponse(): Promise<LiveDatasetResponse<PriceHistory | null>> {
  const bootstrap = await readBootstrapJson<PriceHistory>('history.json');
  return datasetEnvelope(
    'history',
    bootstrap,
    'fallback',
    await readBootstrapStat('history.json'),
    false,
    null,
  );
}
