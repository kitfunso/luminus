/**
 * Parse ENTSO-E historical price documents into one hourly series.
 * Handles duplicate TimeSeries blocks by averaging values at the same timestamp,
 * then aggregates sub-hourly prices into hourly means.
 */

function parseResolutionMs(resolution) {
  const match = resolution.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  const totalMs =
    (Number(days || 0) * 24 * 60 * 60 * 1000) +
    (Number(hours || 0) * 60 * 60 * 1000) +
    (Number(minutes || 0) * 60 * 1000) +
    (Number(seconds || 0) * 1000);
  return totalMs > 0 ? totalMs : null;
}

function extractHourlyPrices(xml) {
  const periodBlocks = [...xml.matchAll(/<Period>([\s\S]*?)<\/Period>/g)].map((m) => m[1]);
  const timestampValues = new Map();

  for (const block of periodBlocks) {
    const startMatch = block.match(/<start>([^<]+)<\/start>/);
    const resolutionMatch = block.match(/<resolution>([^<]+)<\/resolution>/);
    if (!startMatch || !resolutionMatch) continue;

    const startAt = new Date(startMatch[1]);
    const stepMs = parseResolutionMs(resolutionMatch[1]);
    if (Number.isNaN(startAt.getTime()) || !stepMs) continue;

    const points = [...block.matchAll(/<Point>[\s\S]*?<position>(\d+)<\/position>[\s\S]*?<price\.amount>([\d.-]+)<\/price\.amount>[\s\S]*?<\/Point>/g)];
    for (const [, posStr, priceStr] of points) {
      const position = Number(posStr);
      const price = Number(priceStr);
      if (!Number.isFinite(position) || !Number.isFinite(price)) continue;

      const ts = startAt.getTime() + (position - 1) * stepMs;
      if (!timestampValues.has(ts)) timestampValues.set(ts, []);
      timestampValues.get(ts).push(price);
    }
  }

  if (timestampValues.size === 0) {
    return { startUtc: null, endUtc: null, hourly: [] };
  }

  // Average duplicate values at the same timestamp across TimeSeries blocks.
  const averagedPoints = [...timestampValues.entries()]
    .map(([ts, values]) => ({
      ts,
      value: values.reduce((sum, v) => sum + v, 0) / values.length,
    }))
    .sort((a, b) => a.ts - b.ts);

  // Aggregate into hourly means.
  const hourlyBuckets = new Map();
  for (const point of averagedPoints) {
    const hourStart = point.ts - (point.ts % (60 * 60 * 1000));
    if (!hourlyBuckets.has(hourStart)) hourlyBuckets.set(hourStart, []);
    hourlyBuckets.get(hourStart).push(point.value);
  }

  const sortedHours = [...hourlyBuckets.entries()].sort((a, b) => a[0] - b[0]);
  const hourly = sortedHours.map(([, values]) =>
    Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10
  );

  return {
    startUtc: new Date(sortedHours[0][0]).toISOString(),
    endUtc: new Date(sortedHours[sortedHours.length - 1][0] + 60 * 60 * 1000).toISOString(),
    hourly,
  };
}

function extractHourlyFlows(xml) {
  const flows = [];
  const points = [...xml.matchAll(/<quantity>([\d.-]+)<\/quantity>/g)];
  for (const match of points) {
    flows.push(Number(match[1]));
  }
  return flows;
}

module.exports = {
  extractHourlyPrices,
  extractHourlyFlows,
  parseResolutionMs,
};
