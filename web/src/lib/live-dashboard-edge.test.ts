import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getLiveFlowsResponse,
  getLiveHistoryResponse,
  getLiveOutagesResponse,
} from './live-dashboard-edge';
import {
  validateChartWindow,
  validateDatasetEnvelope,
  validateOutageRollup,
  validateReplayAlignment,
} from './live-validation';

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    status: init?.status ?? 200,
    statusText: init?.statusText,
  });
}

function textResponse(body: string, init?: ResponseInit) {
  return new Response(body, {
    headers: init?.headers,
    status: init?.status ?? 200,
    statusText: init?.statusText,
  });
}

function installFetchMock(
  routes: Record<string, Response | (() => Response | Promise<Response>)>,
) {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);
    for (const [match, response] of Object.entries(routes)) {
      if (url.includes(match)) {
        return typeof response === 'function' ? await response() : response;
      }
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('live-validation', () => {
  it('accepts estimated envelopes when provenance metadata is present', () => {
    expect(
      validateDatasetEnvelope({
        dataset: 'flows-profile',
        data: { hourlyFlowMW: [100, 120] },
        source: 'estimated',
        provider: 'derived-spread-model',
        lastUpdated: '2026-03-24T09:00:00Z',
        intervalStart: '2026-03-24T00:00:00Z',
        intervalEnd: '2026-03-24T01:00:00Z',
        hasFallback: false,
        error: null,
      }),
    ).toEqual([]);
  });

  it('verifies country outage MW matches summed plant outages', () => {
    expect(
      validateOutageRollup(
        { unavailableMW: 220 },
        [{ unavailableMW: 100 }, { unavailableMW: 120 }],
      ),
    ).toEqual([]);
  });

  it('flags misaligned chart windows', () => {
    expect(validateChartWindow(['2026-03-24T00:00:00Z'], [1, 2])).not.toEqual([]);
  });

  it('flags replay cursors outside the returned interval', () => {
    expect(
      validateReplayAlignment(
        '2026-03-24T00:00:00Z',
        '2026-03-24T01:00:00Z',
        '2026-03-24T23:00:00Z',
      ),
    ).not.toEqual([]);
  });

  it('requires stale datasets to retain lastUpdated provenance', () => {
    expect(
      validateDatasetEnvelope({
        dataset: 'prices',
        data: {},
        source: 'live',
        provider: 'entsoe',
        lastUpdated: null,
        intervalStart: '2026-03-24T00:00:00Z',
        intervalEnd: '2026-03-24T23:00:00Z',
        hasFallback: false,
        isStale: true,
        error: null,
      }),
    ).not.toEqual([]);
  });
});

describe('live-dashboard-edge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns live historical price series for replay windows', async () => {
    installFetchMock({
      '/data/history.json': jsonResponse({
        startUtc: '2026-03-23T00:00:00.000Z',
        endUtc: '2026-03-23T23:00:00.000Z',
        days: 1,
        countries: [{ iso2: 'GB', country: 'United Kingdom', hourly: [70] }],
      }),
      'data.elexon.co.uk/bmrs/api/v1/balancing/pricing/market-index': jsonResponse({
        data: Array.from({ length: 24 }, (_, hour) => ({
          startTime: `2026-03-23T${String(hour).padStart(2, '0')}:00:00Z`,
          price: 50 + hour,
          volume: 1000,
          dataProvider: 'APXMIDP',
        })),
      }),
    });

    const history = await getLiveHistoryResponse('https://example.com');

    expect(history.data?.countries[0]?.hourly.length).toBeGreaterThanOrEqual(24);
    expect(history).toMatchObject({
      source: 'live',
      hasFallback: false,
      provider: 'elexon',
      intervalStart: expect.any(String),
      intervalEnd: expect.any(String),
    });
  });

  it('returns true corridor hourly series instead of a synthesized proxy', async () => {
    installFetchMock({
      '/data/flows.json': jsonResponse([
        {
          from: 'FR',
          to: 'GB',
          fromLat: 46.6,
          fromLon: 2.35,
          toLat: 53,
          toLon: -2,
          flowMW: 3010,
          capacityMW: 3000,
        },
      ]),
      'web-api.tp.entsoe.eu/api': textResponse(`
        <Publication_MarketDocument>
          <TimeSeries>
            <Period>
              <timeInterval>
                <start>2026-03-23T00:00:00Z</start>
                <end>2026-03-24T00:00:00Z</end>
              </timeInterval>
              <resolution>PT1H</resolution>
              <Point><position>1</position><quantity>1100</quantity></Point>
              <Point><position>2</position><quantity>1200</quantity></Point>
              <Point><position>3</position><quantity>1300</quantity></Point>
            </Period>
          </TimeSeries>
        </Publication_MarketDocument>
      `),
    });

    const flows = await getLiveFlowsResponse('https://example.com');

    expect(flows.data[0]?.hourlyFlowMW).toBeDefined();
    expect(flows.data[0]?.hourlyTimestampsUtc).toEqual([
      '2026-03-23T00:00:00.000Z',
      '2026-03-23T01:00:00.000Z',
      '2026-03-23T02:00:00.000Z',
    ]);
  });

  it('marks bootstrap replay as fallback when live history fetch fails', async () => {
    installFetchMock({
      '/data/history.json': jsonResponse({
        startUtc: '2026-03-23T00:00:00.000Z',
        endUtc: '2026-03-23T23:00:00.000Z',
        days: 1,
        countries: [{ iso2: 'GB', country: 'United Kingdom', hourly: [70, 71] }],
      }),
      'data.elexon.co.uk/bmrs/api/v1/balancing/pricing/market-index': new Response(null, { status: 503 }),
    });

    const history = await getLiveHistoryResponse('https://example.com');

    expect(history).toMatchObject({
      source: 'fallback',
      hasFallback: true,
      intervalStart: '2026-03-23T00:00:00.000Z',
      intervalEnd: '2026-03-23T23:00:00.000Z',
    });
  });

  it('enriches bootstrap outages with plant metadata for drill-down', async () => {
    installFetchMock({
      '/data/outages.json': jsonResponse([
        {
          country: 'France',
          iso2: 'FR',
          unavailableMW: 1500,
          outageCount: 1,
          topOutages: [
            {
              name: 'CHOOZ 2',
              fuel: 'Nuclear',
              unavailableMW: 1500,
              type: 'planned',
              start: '2026-03-20T00:00:00.000Z',
              expectedReturn: '2026-03-27T00:00:00.000Z',
            },
          ],
        },
      ]),
      '/data/power-plants.json': jsonResponse([
        {
          name: 'CHOOZ 2',
          fuel: 'Nuclear',
          capacity: 1500,
          lat: 50.09,
          lon: 4.79,
          country: 'FR',
          year: '2000',
        },
      ]),
    });

    const outages = await getLiveOutagesResponse('https://example.com');
    const plant = outages.data[0]?.topOutages[0];

    expect(outages).toMatchObject({
      source: 'fallback',
      hasFallback: true,
      provider: expect.any(String),
      intervalStart: expect.any(String),
      intervalEnd: expect.any(String),
    });
    expect(plant?.plantKey).toBeTruthy();
    expect(plant?.country).toBe('FR');
    expect(plant?.coordinates).toEqual([50.09, 4.79]);
    expect(plant?.outageType).toBe('planned');
  });
});
