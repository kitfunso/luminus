import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetForecastActualCacheForTests,
  __resetForecastResponseCacheForTests,
  extractEntsoePriceSeries,
  getLiveForecastsResponse,
} from './live-dashboard-edge';

function buildSeriesXml(psrType: string, start: string, quantities: number[]) {
  const points = quantities
    .map((quantity, index) => `
      <Point>
        <position>${index + 1}</position>
        <quantity>${quantity}</quantity>
      </Point>
    `)
    .join('');

  return `
    <TimeSeries>
      <MktPSRType>
        <psrType>${psrType}</psrType>
      </MktPSRType>
      <Period>
        <timeInterval>
          <start>${start}</start>
          <end>2026-03-24T02:00Z</end>
        </timeInterval>
        <resolution>PT60M</resolution>
        ${points}
      </Period>
    </TimeSeries>
  `;
}

function buildGenerationXml(parts: Array<{ psrType: string; start: string; quantities: number[] }>) {
  return `
    <Publication_MarketDocument>
      ${parts.map((part) => buildSeriesXml(part.psrType, part.start, part.quantities)).join('\n')}
    </Publication_MarketDocument>
  `;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(data: string, status = 200) {
  return new Response(data, {
    status,
    headers: { 'content-type': 'application/xml' },
  });
}

describe('extractEntsoePriceSeries', () => {
  it('aggregates duplicate positions by their real timestamps across periods', () => {
    const xml = `
      <Publication_MarketDocument>
        <TimeSeries>
          <Period>
            <timeInterval>
              <start>2026-03-24T00:00Z</start>
              <end>2026-03-24T02:00Z</end>
            </timeInterval>
            <resolution>PT60M</resolution>
            <Point>
              <position>1</position>
              <price.amount>10</price.amount>
            </Point>
            <Point>
              <position>2</position>
              <price.amount>20</price.amount>
            </Point>
          </Period>
          <Period>
            <timeInterval>
              <start>2026-03-24T02:00Z</start>
              <end>2026-03-24T04:00Z</end>
            </timeInterval>
            <resolution>PT60M</resolution>
            <Point>
              <position>1</position>
              <price.amount>30</price.amount>
            </Point>
            <Point>
              <position>2</position>
              <price.amount>40</price.amount>
            </Point>
          </Period>
        </TimeSeries>
      </Publication_MarketDocument>
    `;

    expect(extractEntsoePriceSeries(xml)).toEqual({
      timestampsUtc: [
        '2026-03-24T00:00:00.000Z',
        '2026-03-24T01:00:00.000Z',
        '2026-03-24T02:00:00.000Z',
        '2026-03-24T03:00:00.000Z',
      ],
      hourly: [10, 20, 30, 40],
    });
  });
});

describe('getLiveForecastsResponse', () => {
  beforeEach(() => {
    __resetForecastActualCacheForTests();
    __resetForecastResponseCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    __resetForecastActualCacheForTests();
    __resetForecastResponseCacheForTests();
  });

  it('keeps live forecast data when actual generation is temporarily unavailable', async () => {
    const forecastXml = buildGenerationXml([
      { psrType: 'B18', start: '2026-03-24T00:00Z', quantities: [100, 120] },
      { psrType: 'B16', start: '2026-03-24T00:00Z', quantities: [40, 50] },
    ]);

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'https://example.com/data/forecast-errors.json') {
        return jsonResponse([]);
      }
      if (url.includes('in_Domain=10YFR-RTE------C') && url.includes('documentType=A69')) {
        return textResponse(forecastXml);
      }
      if (url.includes('in_Domain=10YFR-RTE------C') && url.includes('documentType=A75')) {
        return textResponse('', 503);
      }
      return textResponse('', 503);
    }));

    const response = await getLiveForecastsResponse('https://example.com');
    const france = response.data.find((entry) => entry.iso2 === 'FR');

    expect(response.source).toBe('live');
    expect(france).toMatchObject({
      iso2: 'FR',
      wind: {
        forecastHourly: [100, 120],
        actualHourly: [],
      },
      solar: {
        forecastHourly: [40, 50],
        actualHourly: [],
      },
    });
  });

  it('reuses the last good actual series when a later refresh misses actual generation', async () => {
    const forecastXml = buildGenerationXml([
      { psrType: 'B18', start: '2026-03-24T00:00Z', quantities: [100, 120] },
    ]);
    const actualXml = buildGenerationXml([
      { psrType: 'B18', start: '2026-03-24T00:00Z', quantities: [92, 118] },
    ]);

    let actualRequests = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'https://example.com/data/forecast-errors.json') {
        return jsonResponse([]);
      }
      if (url.includes('in_Domain=10YFR-RTE------C') && url.includes('documentType=A69')) {
        return textResponse(forecastXml);
      }
      if (url.includes('in_Domain=10YFR-RTE------C') && url.includes('documentType=A75')) {
        actualRequests += 1;
        return actualRequests === 1 ? textResponse(actualXml) : textResponse('', 503);
      }
      return textResponse('', 503);
    }));

    const firstResponse = await getLiveForecastsResponse('https://example.com');
    const firstFrance = firstResponse.data.find((entry) => entry.iso2 === 'FR');
    expect(firstFrance?.wind.actualHourly).toEqual([92, 118]);

    const secondResponse = await getLiveForecastsResponse('https://example.com');
    const secondFrance = secondResponse.data.find((entry) => entry.iso2 === 'FR');

    expect(secondResponse.source).toBe('live');
    expect(secondFrance?.wind.actualHourly).toEqual([92, 118]);
  });

  it('serves a short-lived cached forecast response unless refresh=1 is requested', async () => {
    const forecastXml = buildGenerationXml([
      { psrType: 'B18', start: '2026-03-24T00:00Z', quantities: [100, 120] },
    ]);

    let allowLive = true;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith('https://example.com/data/forecast-errors.json')) {
        return jsonResponse([]);
      }
      if (allowLive && url.includes('in_Domain=10YFR-RTE------C') && url.includes('documentType=A69')) {
        return textResponse(forecastXml);
      }
      return textResponse('', 503);
    }));

    const firstResponse = await getLiveForecastsResponse('https://example.com');
    expect(firstResponse.source).toBe('live');
    expect(firstResponse.data.find((entry) => entry.iso2 === 'FR')?.wind.forecastHourly).toEqual([100, 120]);

    allowLive = false;

    const cachedResponse = await getLiveForecastsResponse('https://example.com');
    expect(cachedResponse.source).toBe('live');
    expect(cachedResponse.data.find((entry) => entry.iso2 === 'FR')?.wind.forecastHourly).toEqual([100, 120]);

    const refreshedResponse = await getLiveForecastsResponse('https://example.com?refresh=1');
    expect(refreshedResponse.source).toBe('fallback');
    expect(refreshedResponse.data).toEqual([]);
  });
});
