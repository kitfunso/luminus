/**
 * Fetch 3 days of hourly ENTSO-E data for historical replay.
 * Returns per-country hourly prices, and per-corridor hourly flows.
 */

function extractHourlyPrices(xml) {
  const prices = [];
  const points = [...xml.matchAll(/<price\.amount>([\d.-]+)<\/price\.amount>/g)];
  for (const match of points) {
    prices.push(Number(match[1]));
  }
  return prices;
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
};
