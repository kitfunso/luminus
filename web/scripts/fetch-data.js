#!/usr/bin/env node
/**
 * Build-time script: downloads WRI power plant data and ENTSO-E prices/flows,
 * writes JSON to public/data/ so the client never hits CORS issues.
 */
const fs = require('fs');
const path = require('path');
const { extractXmlDocumentsFromZipBuffer, parseCurrentGenerationOutage } = require('./lib/entsoe-outages');

const OUT_DIR = path.join(__dirname, '..', 'public', 'data');
const WRI_URL =
  'https://raw.githubusercontent.com/wri/global-power-plant-database/master/output_database/global_power_plant_database.csv';
const NE_GEOJSON_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const ENTSOE_API = 'https://web-api.tp.entsoe.eu/api';
const ENTSOE_KEY =
  process.env.ENTSOE_API_KEY || 'ffaa7bca-32bf-4430-9877-84efae8f38b1';
const MIN_CAPACITY_MW = 50;
const REQUEST_TIMEOUT_MS = 20_000;
const CONCURRENCY = 4;

// --- Country mappings ---

const ISO3_TO_ISO2 = {
  DEU: 'DE', FRA: 'FR', GBR: 'GB', ESP: 'ES', ITA: 'IT',
  NLD: 'NL', BEL: 'BE', POL: 'PL', AUT: 'AT', CHE: 'CH',
  CZE: 'CZ', SWE: 'SE', NOR: 'NO', DNK: 'DK', FIN: 'FI',
  PRT: 'PT', GRC: 'GR', ROU: 'RO', HUN: 'HU', BGR: 'BG',
  HRV: 'HR', SVK: 'SK', SVN: 'SI', IRL: 'IE', LTU: 'LT',
  LVA: 'LV', EST: 'EE', LUX: 'LU',
};
const EUROPEAN_ISO3 = new Set(Object.keys(ISO3_TO_ISO2));

const ISO2_TO_EIC = {
  DE: '10Y1001A1001A83F', FR: '10YFR-RTE------C', GB: '10YGB----------A',
  ES: '10YES-REE------0', IT: '10YIT-GRTN-----B', NL: '10YNL----------L',
  BE: '10YBE----------2', PL: '10YPL-AREA-----S', AT: '10YAT-APG------L',
  CH: '10YCH-SWISSGRIDZ', CZ: '10YCZ-CEPS-----N', SE: '10YSE-1--------K',
  NO: '10YNO-0--------C', DK: '10Y1001A1001A796', FI: '10YFI-1--------U',
  PT: '10YPT-REN------W', GR: '10YGR-HTSO-----Y', RO: '10YRO-TEL------P',
  HU: '10YHU-MAVIR----U', BG: '10YCA-BULGARIA-R', HR: '10YHR-HEP------M',
  SK: '10YSK-SEPS-----K', SI: '10YSI-ELES-----O', IE: '10Y1001A1001A59C',
  LT: '10YLT-1001A0008Q', LV: '10YLV-1001A00074', EE: '10Y1001A1001A39I',
  LU: '10Y1001A1001A83F',
};

// ENTSO-E prices are published on bidding zones, not always one control area per country.
// Root cause for the missing coverage was treating SE/NO/DK/IT/DE/LU as one-zone countries.
const PRICE_ZONE_STRATEGIES = {
  DE: { zones: ['10Y1001A1001A82H'] }, // DE-LU bidding zone
  LU: { aliasOf: 'DE' },
  FR: { zones: ['10YFR-RTE------C'] },
  GB: { zones: ['10YGB----------A'] },
  ES: { zones: ['10YES-REE------0'] },
  IT: {
    zones: [
      '10Y1001A1001A73I', // IT-North
      '10Y1001A1001A70O', // IT-Centre-North
      '10Y1001A1001A71M', // IT-Centre-South
      '10Y1001A1001A788', // IT-South
      '10Y1001A1001A74G', // IT-Sardinia
      '10Y1001A1001A75E', // IT-Sicily
    ],
  },
  NL: { zones: ['10YNL----------L'] },
  BE: { zones: ['10YBE----------2'] },
  PL: { zones: ['10YPL-AREA-----S'] },
  AT: { zones: ['10YAT-APG------L'] },
  CH: { zones: ['10YCH-SWISSGRIDZ'] },
  CZ: { zones: ['10YCZ-CEPS-----N'] },
  SE: {
    zones: [
      '10Y1001A1001A44P', // SE1
      '10Y1001A1001A45N', // SE2
      '10Y1001A1001A46L', // SE3
      '10Y1001A1001A47J', // SE4
    ],
  },
  NO: {
    zones: [
      '10YNO-1--------2', // NO1
      '10YNO-2--------T', // NO2
      '10YNO-3--------J', // NO3
      '10YNO-4--------9', // NO4
      '10Y1001A1001A48H', // NO5
    ],
  },
  DK: {
    zones: [
      '10YDK-1--------W', // DK1
      '10YDK-2--------M', // DK2
    ],
  },
  FI: { zones: ['10YFI-1--------U'] },
  PT: { zones: ['10YPT-REN------W'] },
  GR: { zones: ['10YGR-HTSO-----Y'] },
  RO: { zones: ['10YRO-TEL------P'] },
  HU: { zones: ['10YHU-MAVIR----U'] },
  BG: { zones: ['10YCA-BULGARIA-R'] },
  HR: { zones: ['10YHR-HEP------M'] },
  SK: { zones: ['10YSK-SEPS-----K'] },
  SI: { zones: ['10YSI-ELES-----O'] },
  IE: { zones: ['10Y1001A1001A59C'] }, // SEM price zone
  LT: { zones: ['10YLT-1001A0008Q'] },
  LV: { zones: ['10YLV-1001A00074'] },
  EE: { zones: ['10Y1001A1001A39I'] },
};

const COUNTRY_NAMES = {
  DE: 'Germany', FR: 'France', GB: 'United Kingdom', ES: 'Spain', IT: 'Italy',
  NL: 'Netherlands', BE: 'Belgium', PL: 'Poland', AT: 'Austria', CH: 'Switzerland',
  CZ: 'Czech Republic', SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland',
  PT: 'Portugal', GR: 'Greece', RO: 'Romania', HU: 'Hungary', BG: 'Bulgaria',
  HR: 'Croatia', SK: 'Slovakia', SI: 'Slovenia', IE: 'Ireland', LT: 'Lithuania',
  LV: 'Latvia', EE: 'Estonia', LU: 'Luxembourg',
};

const CENTROIDS = {
  DE: [51.17, 10.45], FR: [46.60, 2.35], GB: [53.00, -2.00],
  ES: [40.46, -3.75], IT: [42.50, 12.57], NL: [52.13, 5.29],
  BE: [50.50, 4.47], PL: [51.92, 19.15], AT: [47.52, 14.55],
  CH: [46.82, 8.23], CZ: [49.82, 15.47], SE: [60.13, 18.64],
  NO: [60.47, 8.47], DK: [56.26, 9.50], FI: [61.92, 25.75],
  PT: [39.40, -8.22], GR: [39.07, 21.82], RO: [45.94, 24.97],
  HU: [47.16, 19.50], BG: [42.73, 25.49], HR: [45.10, 15.20],
  SK: [48.67, 19.70], SI: [46.15, 15.00], IE: [53.41, -8.24],
  LT: [55.17, 23.88], LV: [56.88, 24.60], EE: [58.60, 25.01],
  LU: [49.82, 6.13],
};

const CORRIDORS = [
  { from: 'DE', to: 'FR', cap: 4800 },
  { from: 'FR', to: 'GB', cap: 3000 },
  { from: 'NL', to: 'GB', cap: 1000 },
  { from: 'NO', to: 'GB', cap: 1400 },
  { from: 'DE', to: 'NL', cap: 5000 },
  { from: 'FR', to: 'ES', cap: 2800 },
  { from: 'DE', to: 'PL', cap: 3000 },
  { from: 'AT', to: 'IT', cap: 1000 },
  { from: 'DE', to: 'AT', cap: 5000 },
  { from: 'DE', to: 'CZ', cap: 2500 },
  { from: 'DE', to: 'DK', cap: 2500 },
  { from: 'NO', to: 'SE', cap: 3500 },
  { from: 'SE', to: 'FI', cap: 2300 },
  { from: 'FR', to: 'BE', cap: 3000 },
  { from: 'FR', to: 'IT', cap: 4000 },
];

// --- Helpers ---

function formatEntsoeDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}0000`;
}

async function fetchWithTimeout(url, ms = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Run async tasks with limited concurrency */
async function mapConcurrent(items, fn, limit = CONCURRENCY) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// --- CSV parsing ---

function parseCSV(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  function parseRow(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = false;
        } else current += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') { fields.push(current.trim()); current = ''; }
      else current += ch;
    }
    fields.push(current.trim());
    return fields;
  }

  const headers = parseRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseRow(line);
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

// --- Power plants ---

async function fetchPowerPlants() {
  console.log('  Downloading WRI power plant database...');
  try {
    const res = await fetchWithTimeout(WRI_URL, 60_000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);
    const plants = [];
    for (const row of rows) {
      const iso3 = row.country || '';
      if (!EUROPEAN_ISO3.has(iso3)) continue;
      const capacity = parseFloat(row.capacity_mw || '0');
      if (capacity < MIN_CAPACITY_MW) continue;
      const lat = parseFloat(row.latitude || '');
      const lon = parseFloat(row.longitude || '');
      if (isNaN(lat) || isNaN(lon)) continue;
      plants.push({
        name: row.name || 'Unknown',
        fuel: row.primary_fuel || 'Other',
        capacity,
        lat, lon,
        country: ISO3_TO_ISO2[iso3] || iso3,
        year: row.commissioning_year || '',
      });
    }
    console.log(`  -> ${plants.length} European plants (>=${MIN_CAPACITY_MW} MW)`);
    return plants;
  } catch (err) {
    console.warn(`  WRI download failed: ${err.message}`);
    return null;
  }
}

// --- ENTSO-E prices ---

function extractPrices(xml) {
  const matches = [...xml.matchAll(/<price\.amount>([\d.]+)<\/price\.amount>/g)];
  if (matches.length === 0) return null;
  const values = matches.map(m => parseFloat(m[1]));
  const avg = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  // Keep hourly breakdown (up to 24 values)
  const hourly = values.slice(0, 24).map(v => Math.round(v * 10) / 10);
  return { avg, hourly };
}

async function fetchZonePrice(eic) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const params = new URLSearchParams({
    securityToken: ENTSOE_KEY,
    documentType: 'A44',
    in_Domain: eic,
    out_Domain: eic,
    periodStart: formatEntsoeDate(yesterday),
    periodEnd: formatEntsoeDate(now),
  });

  try {
    const res = await fetchWithTimeout(`${ENTSOE_API}?${params}`);
    if (!res.ok) return null;
    const xml = await res.text();
    return extractPrices(xml);
  } catch {
    return null;
  }
}

function aggregateZonePrices(zoneResults) {
  const valid = zoneResults.filter(Boolean);
  if (valid.length === 0) return null;

  const hourlyLen = Math.min(
    24,
    Math.max(...valid.map((zone) => zone.hourly.length))
  );

  const hourly = Array.from({ length: hourlyLen }, (_, hour) => {
    const values = valid
      .map((zone) => zone.hourly[hour])
      .filter((value) => Number.isFinite(value));
    if (values.length === 0) return null;
    return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
  }).filter((value) => value !== null);

  if (hourly.length === 0) return null;

  const avg = Math.round((hourly.reduce((sum, value) => sum + value, 0) / hourly.length) * 10) / 10;
  return { avg, hourly };
}

async function fetchPrice(iso2, cache = new Map()) {
  const strategy = PRICE_ZONE_STRATEGIES[iso2];
  if (!strategy) return null;

  if (strategy.aliasOf) {
    const aliased = cache.get(strategy.aliasOf);
    if (!aliased) return null;
    return {
      country: COUNTRY_NAMES[iso2],
      iso2,
      price: aliased.price,
      hourly: aliased.hourly,
    };
  }

  const zoneResults = await mapConcurrent(strategy.zones, fetchZonePrice, Math.min(strategy.zones.length, CONCURRENCY));
  const priceData = aggregateZonePrices(zoneResults);
  if (priceData === null) return null;

  const result = {
    country: COUNTRY_NAMES[iso2],
    iso2,
    price: priceData.avg,
    hourly: priceData.hourly,
  };
  cache.set(iso2, result);
  return result;
}

async function fetchAllPrices() {
  console.log('  Fetching ENTSO-E day-ahead prices...');

  const cache = new Map();
  const iso2s = Object.keys(COUNTRY_NAMES);
  const prices = [];

  for (const iso2 of iso2s) {
    const price = await fetchPrice(iso2, cache);
    if (price) prices.push(price);
  }

  const missing = iso2s.filter((iso2) => !prices.some((price) => price.iso2 === iso2));
  if (missing.length > 0) {
    console.warn(`  Missing live prices for: ${missing.join(', ')}`);
  }

  console.log(`  -> ${prices.length}/${iso2s.length} country prices fetched`);
  return prices.length > 0 ? prices : null;
}

// --- ENTSO-E flows ---

function extractFlowQuantity(xml) {
  const matches = [...xml.matchAll(/<quantity>([\d.]+)<\/quantity>/g)];
  if (matches.length === 0) return null;
  const values = matches.map(m => parseFloat(m[1]));
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

async function fetchFlow(corridor) {
  const fromEic = ISO2_TO_EIC[corridor.from];
  const toEic = ISO2_TO_EIC[corridor.to];
  if (!fromEic || !toEic) return null;

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const params = new URLSearchParams({
    securityToken: ENTSOE_KEY,
    documentType: 'A11',
    in_Domain: toEic,
    out_Domain: fromEic,
    periodStart: formatEntsoeDate(yesterday),
    periodEnd: formatEntsoeDate(now),
  });

  try {
    const res = await fetchWithTimeout(`${ENTSOE_API}?${params}`);
    if (!res.ok) return null;
    const xml = await res.text();
    const flowMW = extractFlowQuantity(xml);
    if (flowMW === null) return null;

    const fromC = CENTROIDS[corridor.from];
    const toC = CENTROIDS[corridor.to];
    return {
      from: corridor.from,
      to: corridor.to,
      fromLat: fromC[0], fromLon: fromC[1],
      toLat: toC[0], toLon: toC[1],
      flowMW,
      capacityMW: corridor.cap,
    };
  } catch {
    return null;
  }
}

async function fetchAllFlows() {
  console.log('  Fetching ENTSO-E cross-border flows...');
  const results = await mapConcurrent(CORRIDORS, fetchFlow);
  const flows = results.filter(Boolean);
  console.log(`  -> ${flows.length} corridor flows fetched`);
  return flows.length > 0 ? flows : null;
}

// --- ENTSO-E outages ---

const OUTAGE_COUNTRIES = Object.keys(COUNTRY_NAMES);

/** Extract XML documents from an ENTSO-E response (raw XML or ZIP archive). */
async function extractEntsoeXmlDocuments(res) {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('zip') || ct.includes('octet-stream')) {
    const buf = Buffer.from(await res.arrayBuffer());
    return extractXmlDocumentsFromZipBuffer(buf);
  }
  return [await res.text()];
}

async function fetchCountryOutages(iso2) {
  const eic = ISO2_TO_EIC[iso2];
  if (!eic) return null;

  const now = new Date();
  const windowStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0
  ));
  const windowEnd = new Date(windowStart);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 2);

  const params = new URLSearchParams({
    securityToken: ENTSOE_KEY,
    documentType: 'A80',
    biddingZone_Domain: eic,
    periodStart: formatEntsoeDate(windowStart),
    periodEnd: formatEntsoeDate(windowEnd),
  });

  try {
    const res = await fetchWithTimeout(`${ENTSOE_API}?${params}`);
    if (!res.ok) return null;

    const docs = await extractEntsoeXmlDocuments(res);
    const outages = docs
      .map((xml) => parseCurrentGenerationOutage(xml, now))
      .filter(Boolean);

    if (outages.length === 0) return null;

    // Deduplicate revisions / overlapping records by unit name, keep the largest current outage.
    const byName = new Map();
    for (const outage of outages) {
      const existing = byName.get(outage.name);
      if (!existing || outage.unavailableMW > existing.unavailableMW) {
        byName.set(outage.name, outage);
      }
    }

    const deduped = [...byName.values()].sort((a, b) => b.unavailableMW - a.unavailableMW);
    const totalMW = deduped.reduce((sum, outage) => sum + outage.unavailableMW, 0);

    return {
      country: COUNTRY_NAMES[iso2],
      iso2,
      unavailableMW: Math.round(totalMW),
      outageCount: deduped.length,
      topOutages: deduped.slice(0, 5),
    };
  } catch {
    return null;
  }
}

async function fetchAllOutages() {
  console.log('  Fetching ENTSO-E generation outages...');
  const results = await mapConcurrent(OUTAGE_COUNTRIES, fetchCountryOutages);
  const outages = results
    .filter(Boolean)
    .sort((a, b) => b.unavailableMW - a.unavailableMW);
  console.log(`  -> ${outages.length} countries with active outages fetched`);
  return outages.length > 0 ? outages : null;
}

// --- GeoJSON country boundaries ---

const EU_ISO2_SET = new Set(Object.values(ISO3_TO_ISO2));

async function fetchGeoJSON() {
  console.log('  Downloading Natural Earth country boundaries...');
  try {
    const res = await fetchWithTimeout(NE_GEOJSON_URL, 60_000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const features = data.features
      .filter((f) => {
        const iso =
          f.properties?.ISO_A2 ||
          f.properties?.iso_a2 ||
          f.properties?.ISO_A2_EH ||
          '';
        return EU_ISO2_SET.has(iso);
      })
      .map((f) => ({
        type: 'Feature',
        properties: {
          ISO_A2:
            f.properties?.ISO_A2 ||
            f.properties?.iso_a2 ||
            f.properties?.ISO_A2_EH ||
            '',
          name:
            f.properties?.ADMIN ||
            f.properties?.NAME ||
            f.properties?.name ||
            '',
        },
        geometry: f.geometry,
      }));

    console.log(`  -> ${features.length} EU country boundaries`);
    if (features.length < 20) {
      console.warn('  Too few countries matched, skipping GeoJSON update');
      return null;
    }
    return { type: 'FeatureCollection', features };
  } catch (err) {
    console.warn(`  GeoJSON download failed: ${err.message}`);
    return null;
  }
}

// --- Fallback data (used when APIs fail) ---

const DEMO_PRICES = [
  { country: 'Germany', iso2: 'DE', price: 72.4 },
  { country: 'France', iso2: 'FR', price: 58.3 },
  { country: 'United Kingdom', iso2: 'GB', price: 85.1 },
  { country: 'Spain', iso2: 'ES', price: 45.8 },
  { country: 'Italy', iso2: 'IT', price: 98.2 },
  { country: 'Netherlands', iso2: 'NL', price: 74.6 },
  { country: 'Belgium', iso2: 'BE', price: 71.2 },
  { country: 'Poland', iso2: 'PL', price: 82.7 },
  { country: 'Austria', iso2: 'AT', price: 69.5 },
  { country: 'Switzerland', iso2: 'CH', price: 67.8 },
  { country: 'Czech Republic', iso2: 'CZ', price: 73.1 },
  { country: 'Sweden', iso2: 'SE', price: 35.2 },
  { country: 'Norway', iso2: 'NO', price: 28.9 },
  { country: 'Denmark', iso2: 'DK', price: 52.6 },
  { country: 'Finland', iso2: 'FI', price: 41.3 },
  { country: 'Portugal', iso2: 'PT', price: 48.5 },
  { country: 'Greece', iso2: 'GR', price: 105.3 },
  { country: 'Romania', iso2: 'RO', price: 88.4 },
  { country: 'Hungary', iso2: 'HU', price: 79.6 },
  { country: 'Bulgaria', iso2: 'BG', price: 91.2 },
  { country: 'Croatia', iso2: 'HR', price: 76.3 },
  { country: 'Slovakia', iso2: 'SK', price: 74.8 },
  { country: 'Slovenia', iso2: 'SI', price: 72.1 },
  { country: 'Ireland', iso2: 'IE', price: 92.5 },
  { country: 'Lithuania', iso2: 'LT', price: 68.4 },
  { country: 'Latvia', iso2: 'LV', price: 65.7 },
  { country: 'Estonia', iso2: 'EE', price: 62.3 },
  { country: 'Luxembourg', iso2: 'LU', price: 70.9 },
];

const DEMO_FLOWS = [
  { from: 'DE', to: 'FR', fromLat: 51.17, fromLon: 10.45, toLat: 46.60, toLon: 2.35, flowMW: 1850, capacityMW: 4800 },
  { from: 'FR', to: 'GB', fromLat: 46.60, fromLon: 2.35, toLat: 53.00, toLon: -2.00, flowMW: 2100, capacityMW: 3000 },
  { from: 'NL', to: 'GB', fromLat: 52.13, fromLon: 5.29, toLat: 53.00, toLon: -2.00, flowMW: 950, capacityMW: 1000 },
  { from: 'NO', to: 'GB', fromLat: 60.47, fromLon: 8.47, toLat: 53.00, toLon: -2.00, flowMW: 1400, capacityMW: 1400 },
  { from: 'DE', to: 'NL', fromLat: 51.17, fromLon: 10.45, toLat: 52.13, toLon: 5.29, flowMW: 2300, capacityMW: 5000 },
  { from: 'FR', to: 'ES', fromLat: 46.60, fromLon: 2.35, toLat: 40.46, toLon: -3.75, flowMW: 1600, capacityMW: 2800 },
  { from: 'DE', to: 'PL', fromLat: 51.17, fromLon: 10.45, toLat: 51.92, toLon: 19.15, flowMW: 1200, capacityMW: 3000 },
  { from: 'AT', to: 'IT', fromLat: 47.52, fromLon: 14.55, toLat: 42.50, toLon: 12.57, flowMW: 800, capacityMW: 1000 },
];

// --- Main ---

async function main() {
  console.log('fetch-data: building static data bundle...');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const [plants, prices, flows, geo, outages] = await Promise.all([
    fetchPowerPlants(),
    fetchAllPrices(),
    fetchAllFlows(),
    fetchGeoJSON(),
    fetchAllOutages(),
  ]);

  const plantsOut = plants || [];
  const pricesOut = prices || DEMO_PRICES;
  const flowsOut = flows || DEMO_FLOWS;
  const outagesOut = outages || [];

  fs.writeFileSync(
    path.join(OUT_DIR, 'power-plants.json'),
    JSON.stringify(plantsOut)
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'prices.json'),
    JSON.stringify(pricesOut)
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'flows.json'),
    JSON.stringify(flowsOut)
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'outages.json'),
    JSON.stringify(outagesOut)
  );

  if (geo) {
    fs.writeFileSync(
      path.join(OUT_DIR, 'eu-countries.geojson'),
      JSON.stringify(geo)
    );
    console.log(`  GeoJSON updated: ${geo.features.length} countries`);
  } else {
    console.log('  GeoJSON: keeping existing file');
  }

  console.log(
    `fetch-data: done (${plantsOut.length} plants, ${pricesOut.length} prices, ${flowsOut.length} flows, ${outagesOut.length} outages)`
  );
}

main().catch((err) => {
  console.error('fetch-data: fatal error:', err);
  process.exit(1);
});
