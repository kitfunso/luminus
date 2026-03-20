export interface PowerPlant {
  name: string;
  fuel: string;
  capacity: number;
  lat: number;
  lon: number;
  country: string;
  year: string;
}

export interface CountryPrice {
  country: string;
  iso2: string;
  price: number;
}

export interface CrossBorderFlow {
  from: string;
  to: string;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  flowMW: number;
  capacityMW: number;
}

/** Try to load a bundled JSON file (generated at build time), return null on failure */
async function loadBundled<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const data = await res.json();
    // Handle both direct arrays and { prices: [...] } wrapper
    if (Array.isArray(data) && data.length > 0) return data as T;
    if (data && typeof data === 'object' && 'prices' in data && Array.isArray(data.prices) && data.prices.length > 0) {
      return data.prices as T;
    }
    return null;
  } catch {
    return null;
  }
}

/** Fetch power plants: bundled JSON -> demo fallback */
export async function fetchPowerPlants(): Promise<PowerPlant[]> {
  const bundled = await loadBundled<PowerPlant[]>('/data/power-plants.json');
  if (bundled && bundled.length > 50) return bundled;
  console.warn('Bundled power-plant data unavailable, using demo');
  return getDemoPowerPlants();
}

/** Fetch day-ahead prices: bundled JSON -> demo fallback */
export async function fetchDayAheadPrices(): Promise<CountryPrice[]> {
  const bundled = await loadBundled<CountryPrice[]>('/data/prices.json');
  if (bundled) return bundled;
  return getDemoPrices();
}

/** Fetch cross-border flows: bundled JSON -> demo fallback */
export async function fetchCrossBorderFlows(): Promise<CrossBorderFlow[]> {
  const bundled = await loadBundled<CrossBorderFlow[]>('/data/flows.json');
  if (bundled) return bundled;
  return getDemoFlows();
}

// --- Demo / fallback data ---

function getDemoPowerPlants(): PowerPlant[] {
  return [
    { name: 'Gravelines', fuel: 'Nuclear', capacity: 5460, lat: 51.015, lon: 2.105, country: 'FR', year: '1980' },
    { name: 'Cattenom', fuel: 'Nuclear', capacity: 5200, lat: 49.406, lon: 6.220, country: 'FR', year: '1986' },
    { name: 'Paluel', fuel: 'Nuclear', capacity: 5320, lat: 49.859, lon: 0.633, country: 'FR', year: '1984' },
    { name: 'Hinkley Point', fuel: 'Nuclear', capacity: 1185, lat: 51.209, lon: -3.131, country: 'GB', year: '1995' },
    { name: 'Doel', fuel: 'Nuclear', capacity: 2911, lat: 51.326, lon: 4.259, country: 'BE', year: '1975' },
    { name: 'Gundremmingen', fuel: 'Nuclear', capacity: 1344, lat: 48.514, lon: 10.402, country: 'DE', year: '1984' },
    { name: 'Cofrentes', fuel: 'Nuclear', capacity: 1064, lat: 39.214, lon: -1.049, country: 'ES', year: '1984' },
    { name: 'Irsching', fuel: 'Natural gas', capacity: 1400, lat: 48.802, lon: 11.564, country: 'DE', year: '2010' },
    { name: 'Pembroke', fuel: 'Natural gas', capacity: 2180, lat: 51.684, lon: -4.997, country: 'GB', year: '2012' },
    { name: 'Eemshaven', fuel: 'Natural gas', capacity: 2400, lat: 53.440, lon: 6.840, country: 'NL', year: '2015' },
    { name: 'Marghera Levante', fuel: 'Natural gas', capacity: 840, lat: 45.460, lon: 12.235, country: 'IT', year: '2022' },
    { name: 'Belchatow', fuel: 'Lignite', capacity: 5102, lat: 51.264, lon: 19.327, country: 'PL', year: '1981' },
    { name: 'Neurath', fuel: 'Lignite', capacity: 4400, lat: 51.061, lon: 6.581, country: 'DE', year: '2012' },
    { name: 'Kozienice', fuel: 'Hard coal', capacity: 2820, lat: 51.579, lon: 21.571, country: 'PL', year: '2017' },
    { name: 'Drax', fuel: 'Hard coal', capacity: 3906, lat: 53.737, lon: -0.999, country: 'GB', year: '1974' },
    { name: 'Grand Maison', fuel: 'Hydro', capacity: 1800, lat: 45.204, lon: 6.058, country: 'FR', year: '1985' },
    { name: 'Dinorwig', fuel: 'Hydro', capacity: 1728, lat: 53.120, lon: -4.115, country: 'GB', year: '1984' },
    { name: 'Vianden', fuel: 'Hydro', capacity: 1296, lat: 49.930, lon: 6.202, country: 'LU', year: '1964' },
    { name: 'Kaprun', fuel: 'Hydro', capacity: 353, lat: 47.179, lon: 12.725, country: 'AT', year: '1955' },
    { name: 'Hornsea One', fuel: 'Wind', capacity: 1218, lat: 53.880, lon: 1.790, country: 'GB', year: '2020' },
    { name: 'Borssele Wind', fuel: 'Wind', capacity: 752, lat: 51.730, lon: 3.380, country: 'NL', year: '2021' },
    { name: 'Kriegers Flak', fuel: 'Wind', capacity: 604, lat: 55.090, lon: 12.940, country: 'DK', year: '2021' },
    { name: 'Hollandse Kust', fuel: 'Wind', capacity: 760, lat: 52.380, lon: 4.240, country: 'NL', year: '2023' },
    { name: 'Cestas Solar', fuel: 'Solar', capacity: 300, lat: 44.734, lon: -0.763, country: 'FR', year: '2015' },
    { name: 'Nunez de Balboa', fuel: 'Solar', capacity: 500, lat: 38.580, lon: -6.080, country: 'ES', year: '2020' },
    { name: 'Weesow-Willmersdorf', fuel: 'Solar', capacity: 187, lat: 52.660, lon: 13.870, country: 'DE', year: '2020' },
  ];
}

function getDemoPrices(): CountryPrice[] {
  return [
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
}

function getDemoFlows(): CrossBorderFlow[] {
  return [
    { from: 'DE', to: 'FR', fromLat: 51.17, fromLon: 10.45, toLat: 46.60, toLon: 2.35, flowMW: 1850, capacityMW: 4800 },
    { from: 'FR', to: 'GB', fromLat: 46.60, fromLon: 2.35, toLat: 53.00, toLon: -2.00, flowMW: 2100, capacityMW: 3000 },
    { from: 'NL', to: 'GB', fromLat: 52.13, fromLon: 5.29, toLat: 53.00, toLon: -2.00, flowMW: 950, capacityMW: 1000 },
    { from: 'NO', to: 'GB', fromLat: 60.47, fromLon: 8.47, toLat: 53.00, toLon: -2.00, flowMW: 1400, capacityMW: 1400 },
    { from: 'DE', to: 'NL', fromLat: 51.17, fromLon: 10.45, toLat: 52.13, toLon: 5.29, flowMW: 2300, capacityMW: 5000 },
    { from: 'FR', to: 'ES', fromLat: 46.60, fromLon: 2.35, toLat: 40.46, toLon: -3.75, flowMW: 1600, capacityMW: 2800 },
    { from: 'DE', to: 'PL', fromLat: 51.17, fromLon: 10.45, toLat: 51.92, toLon: 19.15, flowMW: 1200, capacityMW: 3000 },
    { from: 'AT', to: 'IT', fromLat: 47.52, fromLon: 14.55, toLat: 42.50, toLon: 12.57, flowMW: 800, capacityMW: 1000 },
  ];
}
