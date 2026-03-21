/**
 * Fetch and compare ENTSO-E wind/solar forecast (A69) vs actual generation (A75).
 * Returns per-country forecast error data for the current day.
 */

// PSR type codes for wind and solar
const WIND_PSR = ['B18', 'B19']; // Offshore, Onshore
const SOLAR_PSR = ['B16'];

function extractTimeSeriesQuantities(xml, psrTypes) {
  // Split into TimeSeries blocks
  const blocks = xml.split(/<TimeSeries>/g).slice(1);
  let totalMW = 0;
  const hourlyBuckets = new Map(); // hour -> [values]

  for (const block of blocks) {
    const psrMatch = block.match(/<psrType>([^<]+)<\/psrType>/);
    if (!psrMatch || !psrTypes.includes(psrMatch[1])) continue;

    // Get all periods
    const periods = block.split(/<Period>/g).slice(1);
    for (const period of periods) {
      const startMatch = period.match(/<start>([^<]+)<\/start>/);
      const resMatch = period.match(/<resolution>([^<]+)<\/resolution>/);
      if (!startMatch) continue;

      const startTime = new Date(startMatch[1]);
      const resolution = resMatch ? resMatch[1] : 'PT1H';
      const stepMs = resolution === 'PT15M' ? 15 * 60 * 1000 : 60 * 60 * 1000;

      const points = [...period.matchAll(/<Point>[\s\S]*?<position>(\d+)<\/position>[\s\S]*?<quantity>([\d.]+)<\/quantity>[\s\S]*?<\/Point>/g)];

      for (const [, posStr, qtyStr] of points) {
        const pos = Number(posStr);
        const qty = Number(qtyStr);
        const pointTime = new Date(startTime.getTime() + (pos - 1) * stepMs);
        const hourKey = pointTime.getUTCHours();

        if (!hourlyBuckets.has(hourKey)) hourlyBuckets.set(hourKey, []);
        hourlyBuckets.get(hourKey).push(qty);
      }
    }
  }

  // Average within each hour bucket (handles 15-min -> hourly aggregation)
  const hourly = [];
  for (let h = 0; h < 24; h++) {
    const vals = hourlyBuckets.get(h);
    if (vals && vals.length > 0) {
      // Sum across fuel types (wind onshore + offshore), average across sub-hourly
      hourly.push(vals.reduce((a, b) => a + b, 0) / (vals.length / psrTypes.length || 1));
    }
  }

  totalMW = hourly.length > 0 ? hourly.reduce((a, b) => a + b, 0) / hourly.length : 0;

  return { totalMW, hourly };
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
