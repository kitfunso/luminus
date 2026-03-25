import { describe, expect, it } from 'vitest';

import { extractEntsoePriceSeries } from './live-dashboard-edge';

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
