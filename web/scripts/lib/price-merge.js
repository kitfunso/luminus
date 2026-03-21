/**
 * Pure price merge helper.
 *
 * Merges live price results onto a stable baseline so the bundled prices.json
 * always contains the full country set. Countries where live fetch failed are
 * preserved from the baseline and tagged source:'fallback' so the UI can
 * distinguish stale reference data from fresh live data.
 *
 * No IO. No side-effects. Tested via scripts/fetch-data.test.js.
 */

/**
 * @typedef {{ iso2: string, country: string, price: number, hourly?: number[] }} PriceEntry
 * @typedef {PriceEntry & { source: 'live'|'fallback' }} TaggedPriceEntry
 */

/**
 * Merge live prices onto a baseline, preserving every baseline country.
 * - Countries with a live result → tagged source:'live'
 * - Countries missing from live → taken from baseline, tagged source:'fallback'
 * - Live entries not in baseline are included tagged source:'live' (edge-case completeness)
 *
 * @param {PriceEntry[]} live     Array of successfully fetched prices (may be empty)
 * @param {PriceEntry[]} baseline Stable reference prices covering the full country set
 * @returns {TaggedPriceEntry[]}
 */
function mergePricesWithFallback(live, baseline) {
  const liveByIso2 = new Map(live.map((p) => [p.iso2, p]));
  const result = [];

  for (const base of baseline) {
    const liveEntry = liveByIso2.get(base.iso2);
    if (liveEntry) {
      result.push({ ...liveEntry, source: 'live' });
    } else {
      result.push({ ...base, source: 'fallback' });
    }
  }

  // Include any live entries not covered by the baseline (shouldn't occur in
  // normal operation but keeps the output complete if the baseline is ever stale).
  const baselineIso2s = new Set(baseline.map((b) => b.iso2));
  for (const [iso2, liveEntry] of liveByIso2) {
    if (!baselineIso2s.has(iso2)) {
      result.push({ ...liveEntry, source: 'live' });
    }
  }

  return result;
}

module.exports = { mergePricesWithFallback };
