/**
 * Fetch and compare ENTSO-E wind/solar forecast (A69) vs actual generation (A75).
 * Returns per-country forecast error data for the current day.
 */

// PSR type codes for wind and solar
const WIND_PSR = ['B18', 'B19']; // Offshore, Onshore
const SOLAR_PSR = ['B16'];

function extractTimeSeriesQuantities(xml, psrTypes) {
  const blocks = xml.split(/<TimeSeries>/g).slice(1);
  const pointBuckets = new Map();

  for (const block of blocks) {
    const psrMatch = block.match(/<psrType>([^<]+)<\/psrType>/);
    if (!psrMatch || !psrTypes.includes(psrMatch[1])) continue;

    const periods = block.split(/<Period>/g).slice(1);
    for (const period of periods) {
      const startMatch = period.match(/<start>([^<]+)<\/start>/);
      const resMatch = period.match(/<resolution>([^<]+)<\/resolution>/);
      if (!startMatch) continue;

      const startTime = new Date(startMatch[1]);
      const resolution = resMatch ? resMatch[1] : 'PT1H';
      const stepMs = resolution === 'PT15M' ? 15 * 60 * 1000 : 60 * 60 * 1000;

      const points = [...period.matchAll(/<Point>[\s\S]*?<position>(\d+)<\/position>[\s\S]*?<quantity>([\d.-]+)<\/quantity>[\s\S]*?<\/Point>/g)];

      for (const [, posStr, qtyStr] of points) {
        const pos = Number(posStr);
        const qty = Number(qtyStr);
        if (!Number.isFinite(pos) || !Number.isFinite(qty)) continue;
        const pointTime = new Date(startTime.getTime() + (pos - 1) * stepMs);
        pointBuckets.set(pointTime.toISOString(), (pointBuckets.get(pointTime.toISOString()) ?? 0) + qty);
      }
    }
  }

  const hourlyBuckets = new Map();
  for (const [timestamp, totalQty] of pointBuckets) {
    const hour = new Date(timestamp);
    hour.setUTCMinutes(0, 0, 0);
    const hourKey = hour.toISOString();
    if (!hourlyBuckets.has(hourKey)) hourlyBuckets.set(hourKey, []);
    hourlyBuckets.get(hourKey).push(totalQty);
  }

  const ordered = [...hourlyBuckets.entries()]
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());
  const timestampsUtc = ordered.map(([timestamp]) => timestamp);
  const hourly = ordered.map(([, values]) => values.reduce((a, b) => a + b, 0) / values.length);
  const totalMW = hourly.length > 0 ? hourly.reduce((a, b) => a + b, 0) / hourly.length : 0;

  return { totalMW, hourly, timestampsUtc };
}

function computeForecastMetrics(forecastHourly, actualHourly) {
  if (forecastHourly.length === 0 || actualHourly.length === 0) {
    return { mae: 0, mape: 0, bias: 0, surpriseDirection: 'none', surpriseMagnitude: 0 };
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

  // Latest surprise: compare most recent actual vs forecast
  const latestActual = actualHourly[actualHourly.length - 1];
  const latestForecast = forecastHourly[Math.min(forecastHourly.length - 1, actualHourly.length - 1)];
  const surpriseMagnitude = Math.abs(latestActual - latestForecast);
  const surpriseDirection = latestActual > latestForecast * 1.1
    ? 'above'
    : latestActual < latestForecast * 0.9
    ? 'below'
    : 'none';

  return { mae: Math.round(mae), mape: Math.round(mape * 10) / 10, bias: Math.round(bias), surpriseDirection, surpriseMagnitude: Math.round(surpriseMagnitude) };
}

module.exports = {
  WIND_PSR,
  SOLAR_PSR,
  extractTimeSeriesQuantities,
  computeForecastMetrics,
};
