/** EU country centroids for label placement */
export const COUNTRY_CENTROIDS: Record<string, { lat: number; lon: number; name: string }> = {
  DE: { lat: 51.1657, lon: 10.4515, name: 'Germany' },
  FR: { lat: 46.6034, lon: 2.3488, name: 'France' },
  GB: { lat: 53.0000, lon: -2.0000, name: 'United Kingdom' },
  ES: { lat: 40.4637, lon: -3.7492, name: 'Spain' },
  IT: { lat: 42.5047, lon: 12.5736, name: 'Italy' },
  NL: { lat: 52.1326, lon: 5.2913, name: 'Netherlands' },
  BE: { lat: 50.5039, lon: 4.4699, name: 'Belgium' },
  PL: { lat: 51.9194, lon: 19.1451, name: 'Poland' },
  AT: { lat: 47.5162, lon: 14.5501, name: 'Austria' },
  CH: { lat: 46.8182, lon: 8.2275, name: 'Switzerland' },
  CZ: { lat: 49.8175, lon: 15.4730, name: 'Czech Republic' },
  SE: { lat: 60.1282, lon: 18.6435, name: 'Sweden' },
  NO: { lat: 60.4720, lon: 8.4689, name: 'Norway' },
  DK: { lat: 56.2639, lon: 9.5018, name: 'Denmark' },
  FI: { lat: 61.9241, lon: 25.7482, name: 'Finland' },
  PT: { lat: 39.3999, lon: -8.2245, name: 'Portugal' },
  GR: { lat: 39.0742, lon: 21.8243, name: 'Greece' },
  RO: { lat: 45.9432, lon: 24.9668, name: 'Romania' },
  HU: { lat: 47.1625, lon: 19.5033, name: 'Hungary' },
  BG: { lat: 42.7339, lon: 25.4858, name: 'Bulgaria' },
  HR: { lat: 45.1000, lon: 15.2000, name: 'Croatia' },
  SK: { lat: 48.6690, lon: 19.6990, name: 'Slovakia' },
  SI: { lat: 46.1512, lon: 14.9955, name: 'Slovenia' },
  IE: { lat: 53.4129, lon: -8.2439, name: 'Ireland' },
  LT: { lat: 55.1694, lon: 23.8813, name: 'Lithuania' },
  LV: { lat: 56.8796, lon: 24.6032, name: 'Latvia' },
  EE: { lat: 58.5953, lon: 25.0136, name: 'Estonia' },
  LU: { lat: 49.8153, lon: 6.1296, name: 'Luxembourg' },
};

/** EU countries GeoJSON URL (Natural Earth simplified) */
export const EU_GEOJSON_URL =
  'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';

/** European country ISO2 codes for filtering the world GeoJSON */
export const EU_COUNTRY_CODES = new Set(Object.keys(COUNTRY_CENTROIDS));

/** ENTSO-E bidding zone codes mapped to ISO2 */
export const ZONE_TO_ISO: Record<string, string> = {
  '10Y1001A1001A83F': 'DE',
  '10Y1001A1001A82H': 'DE',
  '10YFR-RTE------C': 'FR',
  '10YGB----------A': 'GB',
  '10YES-REE------0': 'ES',
  '10YIT-GRTN-----B': 'IT',
  '10YNL----------L': 'NL',
  '10YBE----------2': 'BE',
  '10YPL-AREA-----S': 'PL',
  '10YAT-APG------L': 'AT',
  '10YCH-SWISSGRIDZ': 'CH',
  '10YCZ-CEPS-----N': 'CZ',
  '10YSE-1--------K': 'SE',
  '10YNO-0--------C': 'NO',
  '10Y1001A1001A796': 'DK',
  '10YFI-1--------U': 'FI',
  '10YPT-REN------W': 'PT',
  '10YGR-HTSO-----Y': 'GR',
  '10YRO-TEL------P': 'RO',
  '10YHU-MAVIR----U': 'HU',
  '10YCA-BULGARIA-R': 'BG',
  '10YHR-HEP------M': 'HR',
  '10YSK-SEPS-----K': 'SK',
  '10YSI-ELES-----O': 'SI',
  '10Y1001A1001A59C': 'IE',
  '10YIE-1001A00010': 'IE',
  '10YLT-1001A0008Q': 'LT',
  '10YLV-1001A00074': 'LV',
  '10Y1001A1001A39I': 'EE',
};
