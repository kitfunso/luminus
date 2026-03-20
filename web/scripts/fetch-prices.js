/**
 * Fetch day-ahead prices from ENTSO-E at build time.
 * Saves to public/data/prices.json
 */
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.ENTSOE_API_KEY || 'ffaa7bca-32bf-4430-9877-84efae8f38b1';
const BASE_URL = 'https://web-api.tp.entsoe.eu/api';

const ZONES = {
  DE: { code: '10Y1001A1001A82H', name: 'Germany' },
  FR: { code: '10YFR-RTE------C', name: 'France' },
  GB: { code: '10YGB----------A', name: 'United Kingdom' },
  ES: { code: '10YES-REE------0', name: 'Spain' },
  IT: { code: '10YIT-GRTN-----B', name: 'Italy' },
  NL: { code: '10YNL----------L', name: 'Netherlands' },
  BE: { code: '10YBE----------2', name: 'Belgium' },
  PL: { code: '10YPL-AREA-----S', name: 'Poland' },
  AT: { code: '10YAT-APG------L', name: 'Austria' },
  CH: { code: '10YCH-SWISSGRIDZ', name: 'Switzerland' },
  CZ: { code: '10YCZ-CEPS-----N', name: 'Czech Republic' },
  SE: { code: '10YSE-1--------K', name: 'Sweden' },
  NO: { code: '10YNO-1--------2', name: 'Norway' },
  DK: { code: '10Y1001A1001A796', name: 'Denmark' },
  FI: { code: '10YFI-1--------U', name: 'Finland' },
  PT: { code: '10YPT-REN------W', name: 'Portugal' },
  GR: { code: '10YGR-HTSO-----Y', name: 'Greece' },
  RO: { code: '10YRO-TEL------P', name: 'Romania' },
  HU: { code: '10YHU-MAVIR----U', name: 'Hungary' },
  BG: { code: '10YCA-BULGARIA-R', name: 'Bulgaria' },
  HR: { code: '10YHR-HEP------M', name: 'Croatia' },
  SK: { code: '10YSK-SEPS-----K', name: 'Slovakia' },
  SI: { code: '10YSI-ELES-----O', name: 'Slovenia' },
  IE: { code: '10Y1001A1001A59C', name: 'Ireland' },
  LT: { code: '10YLT-1001A0008Q', name: 'Lithuania' },
  LV: { code: '10YLV-1001A00074', name: 'Latvia' },
  EE: { code: '10Y1001A1001A39I', name: 'Estonia' },
  LU: { code: '10YLU-CEGEDEL-NQ', name: 'Luxembourg' },
};

function formatDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}0000`;
}

async function fetchPrice(iso2, zoneCode) {
  // Use yesterday's prices (guaranteed published)
  const now = new Date();
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 1);

  const params = new URLSearchParams({
    securityToken: API_KEY,
    documentType: 'A44',
    in_Domain: zoneCode,
    out_Domain: zoneCode,
    periodStart: formatDate(start),
    periodEnd: formatDate(end),
  });

  try {
    const resp = await fetch(`${BASE_URL}?${params}`, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return null;
    const text = await resp.text();
    
    // Extract prices from XML
    const priceMatches = text.match(/<price\.amount>([\d.]+)<\/price\.amount>/g);
    if (!priceMatches || priceMatches.length === 0) return null;
    
    const prices = priceMatches.map(m => parseFloat(m.replace(/<\/?price\.amount>/g, '')));
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    return Math.round(avg * 10) / 10;
  } catch (e) {
    console.warn(`  ${iso2}: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log('Fetching live ENTSO-E day-ahead prices...');
  const results = [];
  
  for (const [iso2, { code, name }] of Object.entries(ZONES)) {
    const price = await fetchPrice(iso2, code);
    if (price !== null) {
      results.push({ country: name, iso2, price });
      console.log(`  ${iso2}: ${price} EUR/MWh`);
    } else {
      console.log(`  ${iso2}: FAILED`);
    }
    // Rate limit: small delay between requests
    await new Promise(r => setTimeout(r, 200));
  }

  const outDir = path.join(__dirname, '..', 'public', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  
  const outPath = path.join(outDir, 'prices.json');
  fs.writeFileSync(outPath, JSON.stringify({ 
    fetchedAt: new Date().toISOString(),
    prices: results 
  }, null, 2));
  
  console.log(`\nSaved ${results.length} prices to ${outPath}`);
}

main().catch(console.error);
