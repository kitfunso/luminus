/**
 * Pure corridor/flow computation utilities.
 * Tested via scripts/corridor-logic.test.js.
 * Must stay side-effect-free: no imports, no fetch, no state.
 */

/**
 * Classify utilisation level from raw flow and capacity values.
 * Thresholds mirror Map.tsx arc coloring (>80% red, >50% amber, else green).
 * @returns {{ pct: number, label: string, colorHex: string }}
 */
function utilisationLevel(flowMW, capacityMW) {
  const pct = capacityMW > 0 ? flowMW / capacityMW : 0;
  let label, colorHex;
  if (pct > 0.8) {
    label = 'Congested';
    colorHex = '#f87171';
  } else if (pct > 0.5) {
    label = 'Stressed';
    colorHex = '#facc15';
  } else {
    label = 'Low';
    colorHex = '#4ade80';
  }
  return { pct, label, colorHex };
}

/**
 * Compute price spread (to - from) and implied flow direction.
 * Positive spread means the destination country pays more -> flow toward it is commercial.
 * @returns {{ spread: number|null, label: string, direction: 'toward'|'away'|'neutral'|'unknown' }}
 */
function computeSpread(fromPrice, toPrice) {
  if (fromPrice == null || toPrice == null) {
    return { spread: null, label: 'N/A', direction: 'unknown' };
  }
  const spread = Math.round((toPrice - fromPrice) * 10) / 10;
  const direction = spread > 2 ? 'toward' : spread < -2 ? 'away' : 'neutral';
  const sign = spread >= 0 ? '+' : '';
  return {
    spread,
    label: sign + '\u20ac' + Math.abs(spread).toFixed(1) + '/MWh',
    direction,
  };
}

/**
 * Derive a synthetic 24h flow profile from hourly prices.
 * Correlation logic: when spread (to-from) is high, flow should be near capacity;
 * when spread reverses, flow drops toward zero.
 * Falls back to a flat profile if price data is unavailable.
 * @returns {number[]} Array of 24 MW values (non-negative)
 */
function syntheticFlowProfile(avgFlow, fromHourly, toHourly) {
  if (
    !fromHourly || !toHourly ||
    fromHourly.length === 0 || toHourly.length === 0
  ) {
    return Array(24).fill(Math.round(avgFlow));
  }

  const len = Math.min(24, fromHourly.length, toHourly.length);
  const spreads = [];
  for (let i = 0; i < len; i++) {
    spreads.push(toHourly[i] - fromHourly[i]);
  }

  const avgSpread = spreads.reduce((a, b) => a + b, 0) / len;
  const maxAbs = Math.max(1, ...spreads.map(Math.abs));

  return spreads.map((sp) => {
    // Normalise delta relative to max absolute spread, swing ±40%
    const delta = (sp - avgSpread) / (2 * maxAbs);
    const flow = avgFlow + delta * avgFlow * 0.8;
    return Math.max(0, Math.round(flow));
  });
}

/**
 * Geographic midpoint of an arc (flat average, sufficient for label placement).
 * @returns {[number, number]} [lon, lat]
 */
function arcMidpoint(fromLon, fromLat, toLon, toLat) {
  return [(fromLon + toLon) / 2, (fromLat + toLat) / 2];
}

/**
 * Stable corridor identifier regardless of direction.
 */
function corridorId(from, to) {
  return [from, to].sort().join('-');
}

/**
 * Static mapping from canonical corridorId to real line names in transmission-lines.json.
 * Coverage: 19 of 20 named interconnectors. Keys use corridorId() format (sorted A-Z).
 */
const CORRIDOR_LINE_MAP = {
  'FR-GB': ['IFA FR-GB', 'IFA2 FR-GB'],
  'GB-NL': ['BritNed NL-GB'],
  'GB-NO': ['North Sea Link NO-GB'],
  'DE-FR': ['Vigy-Uchtelfangen FR-DE'],
  'DE-NL': ['Meeden-Diele DE-NL'],
  'ES-FR': ['Baixas-Santa Llogaia FR-ES'],
  'AT-DE': ['St Peter-Simbach DE-AT'],
  'AT-IT': ['Lienz-Soverzene AT-IT'],
  'FR-IT': ['Albertville-Piossasco FR-IT'],
  'DE-PL': ['Vierraden-Krajnik DE-PL'],
  'CZ-DE': ['Hradec-Rohrsdorf DE-CZ'],
  'DE-DK': ['Kasso-Audorf DE-DK'],
  'NO-SE': ['Halden-Hasle NO-SE'],
  'FI-SE': ['Fennoskan SE-FI'],
  'BE-FR': ['Avelin-Avelgem FR-BE'],
  'CH-DE': ['Beznau-Tiengen DE-CH'],
  'AT-HU': ['Wien-Gyor AT-HU'],
  'CZ-PL': ['Dobrzen-Albrechtice PL-CZ'],
  'ES-PT': ['Balboa-Alqueva ES-PT'],
};

/**
 * Find the corridorId for a named transmission line, or null if unmapped.
 * @param {string} lineName
 * @returns {string|null}
 */
function corridorForLine(lineName) {
  for (const [cid, names] of Object.entries(CORRIDOR_LINE_MAP)) {
    if (names.includes(lineName)) return cid;
  }
  return null;
}

/**
 * Filter an array of line objects (must have .name) to only those belonging to a corridorId.
 * @param {string} cid
 * @param {{ name: string }[]} lines
 * @returns {{ name: string }[]}
 */
function matchCorridorLines(cid, lines) {
  const names = CORRIDOR_LINE_MAP[cid];
  if (!names || !names.length) return [];
  return lines.filter((l) => names.includes(l.name));
}

module.exports = {
  utilisationLevel,
  computeSpread,
  syntheticFlowProfile,
  arcMidpoint,
  corridorId,
  CORRIDOR_LINE_MAP,
  corridorForLine,
  matchCorridorLines,
};
