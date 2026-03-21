/**
 * Great Britain power price helper.
 *
 * ENTSO-E currently returns "No matching data found" for GB day-ahead prices,
 * so we fall back to Elexon BMRS market-index data for GB only.
 *
 * This stays honest:
 * - provider is tagged as 'elexon'
 * - we prefer rows with real traded volume
 * - we aggregate half-hourly periods into hourly values for chart compatibility
 */

/**
 * Pick one meaningful market-index row per timestamp.
 * If multiple providers exist for the same timestamp, keep the highest-volume row.
 * This avoids zero-volume placeholders like N2EXMIDP dominating the result.
 *
 * @param {Array<{ startTime: string, price: number|string, volume?: number|string, dataProvider?: string }>} rows
 * @returns {Array<{ startTime: string, price: number, volume: number, dataProvider: string|null }>}
 */
function selectMarketIndexRows(rows) {
  if (!Array.isArray(rows)) return [];

  const byTimestamp = new Map();

  for (const row of rows) {
    if (!row || !row.startTime) continue;
    const price = Number(row.price);
    const volume = Number(row.volume ?? 0);
    if (!Number.isFinite(price) || !Number.isFinite(volume) || volume <= 0) continue;

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
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
}

/**
 * Convert half-hourly market-index rows into hourly values.
 * @param {ReturnType<typeof selectMarketIndexRows>} rows
 * @returns {number[]}
 */
function aggregateHourlyPrices(rows) {
  const buckets = new Map();

  for (const row of rows) {
    const hour = new Date(row.startTime);
    hour.setUTCMinutes(0, 0, 0);
    const key = hour.toISOString();
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row.price);
  }

  return [...buckets.entries()]
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .map(([, prices]) => Math.round((prices.reduce((sum, value) => sum + value, 0) / prices.length) * 10) / 10);
}

/**
 * Extract a GB-compatible hourly price surface from the BMRS market-index payload.
 * @param {{ data?: Array<{ startTime: string, price: number|string, volume?: number|string, dataProvider?: string }> } | null | undefined} payload
 * @returns {{ avg: number, hourly: number[], provider: 'elexon' } | null}
 */
function extractGbMarketIndexPrice(payload) {
  const selected = selectMarketIndexRows(payload?.data ?? []);
  if (selected.length === 0) return null;

  const hourly = aggregateHourlyPrices(selected).slice(-24);
  if (hourly.length === 0) return null;

  const avg = Math.round((hourly.reduce((sum, value) => sum + value, 0) / hourly.length) * 10) / 10;
  return {
    avg,
    hourly,
    provider: 'elexon',
  };
}

module.exports = {
  selectMarketIndexRows,
  aggregateHourlyPrices,
  extractGbMarketIndexPrice,
};
