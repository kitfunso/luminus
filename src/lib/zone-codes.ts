/** ENTSO-E EIC area codes for European bidding zones */
export const ZONE_CODES: Record<string, string> = {
  GB: "10YGB----------A",
  DE: "10Y1001A1001A83F",
  DE_LU: "10Y1001A1001A82H", // DE-LU combined bidding zone (used for prices)
  FR: "10YFR-RTE------C",
  NL: "10YNL----------L",
  BE: "10YBE----------2",
  ES: "10YES-REE------0",
  IT: "10YIT-GRTN-----B",
  PT: "10YPT-REN------W",
  NO1: "10YNO-1--------2",
  NO2: "10YNO-2--------T",
  SE1: "10Y1001A1001A44P",
  SE2: "10Y1001A1001A45N",
  SE3: "10Y1001A1001A46L",
  SE4: "10Y1001A1001A47J",
  DK1: "10YDK-1--------W",
  DK2: "10YDK-2--------M",
  PL: "10YPL-AREA-----S",
  AT: "10YAT-APG------L",
  CH: "10YCH-SWISSGRIDZ",
  IE: "10YIE-1001A00010",
  CZ: "10YCZ-CEPS-----N",
  FI: "10YFI-1--------U",
  GR: "10YGR-HTSO-----Y",
  HU: "10YHU-MAVIR----U",
  RO: "10YRO-TEL------P",
  BG: "10YCA-BULGARIA-R",
  HR: "10YHR-HEP------M",
  SK: "10YSK-SEPS-----K",
  SI: "10YSI-ELES-----O",
  LT: "10YLT-1001A0008Q",
  LV: "10YLV-1001A00074",
  EE: "10Y1001A1001A39I",
};

/** Resolve a zone string to an EIC code. Accepts both "DE" and raw EIC codes. */
export function resolveZone(zone: string): string {
  const upper = zone.toUpperCase();
  if (ZONE_CODES[upper]) return ZONE_CODES[upper];
  // If it already looks like an EIC code, pass through
  if (upper.startsWith("10Y")) return zone;
  throw new Error(
    `Unknown zone "${zone}". Use ISO country code (DE, FR, GB...) or raw EIC code.`
  );
}

/**
 * Some zones use different EIC codes for price queries (bidding zones differ
 * from control areas). E.g. DE uses the DE-LU combined bidding zone for prices.
 */
const PRICE_ZONE_OVERRIDES: Record<string, string> = {
  DE: "10Y1001A1001A82H", // DE-LU combined bidding zone
};

/** Resolve zone for price queries (uses bidding zone overrides) */
export function resolvePriceZone(zone: string): string {
  const upper = zone.toUpperCase();
  if (PRICE_ZONE_OVERRIDES[upper]) return PRICE_ZONE_OVERRIDES[upper];
  return resolveZone(zone);
}

/** All available zone keys for tool descriptions */
export const AVAILABLE_ZONES = Object.keys(ZONE_CODES).join(", ");

/** Neighbouring zones for net position calculation (cross-border flow pairs) */
export const ZONE_NEIGHBOURS: Record<string, string[]> = {
  DE: ["FR", "NL", "BE", "PL", "CZ", "AT", "CH", "DK1", "DK2", "SE4"],
  FR: ["DE", "BE", "ES", "IT", "CH", "GB"],
  NL: ["DE", "BE", "GB", "NO2"],
  BE: ["FR", "NL", "DE", "GB"],
  GB: ["FR", "NL", "BE", "IE", "NO2"],
  ES: ["FR", "PT"],
  PT: ["ES"],
  IT: ["FR", "AT", "SI", "CH", "GR"],
  AT: ["DE", "CZ", "HU", "SI", "IT", "CH"],
  CH: ["DE", "FR", "IT", "AT"],
  PL: ["DE", "CZ", "SK", "SE4", "LT"],
  CZ: ["DE", "PL", "SK", "AT"],
  DK1: ["DE", "NO2", "SE3", "DK2"],
  DK2: ["DE", "SE4", "DK1"],
  NO1: ["NO2", "SE3"],
  NO2: ["NO1", "NL", "GB", "DK1"],
  SE1: ["SE2", "FI"],
  SE2: ["SE1", "SE3"],
  SE3: ["SE2", "NO1", "DK1", "SE4", "FI"],
  SE4: ["SE3", "DE", "PL", "DK2", "LT"],
  FI: ["SE1", "SE3", "EE"],
  EE: ["FI", "LV"],
  LV: ["EE", "LT"],
  LT: ["LV", "PL", "SE4"],
  HU: ["AT", "SK", "RO", "HR", "SI"],
  RO: ["HU", "BG"],
  BG: ["RO", "GR"],
  HR: ["HU", "SI"],
  SK: ["CZ", "PL", "HU", "AT"],
  SI: ["AT", "IT", "HU", "HR"],
  GR: ["IT", "BG"],
  IE: ["GB"],
};

/** Approximate bounding boxes [lat_min, lon_min, lat_max, lon_max] for Overpass API queries */
export const COUNTRY_BBOXES: Record<string, [number, number, number, number]> = {
  DE: [47.27, 5.87, 55.06, 15.04],
  FR: [41.36, -5.14, 51.09, 9.56],
  GB: [49.96, -6.37, 58.64, 1.76],
  NL: [50.75, 3.36, 53.47, 7.21],
  BE: [49.50, 2.55, 51.50, 6.40],
  ES: [36.00, -9.30, 43.79, 3.33],
  PT: [36.96, -9.50, 42.15, -6.19],
  IT: [36.65, 6.63, 47.09, 18.52],
  AT: [46.37, 9.53, 49.02, 17.16],
  CH: [45.82, 5.96, 47.81, 10.49],
  PL: [49.00, 14.12, 54.84, 24.15],
  CZ: [48.55, 12.09, 51.06, 18.86],
  DK: [54.56, 8.07, 57.75, 15.20],
  NO: [57.96, 4.64, 71.19, 31.07],
  SE: [55.34, 11.11, 69.06, 24.17],
  FI: [59.81, 20.65, 70.09, 31.59],
  GR: [34.80, 19.37, 41.75, 29.65],
  HU: [45.74, 16.11, 48.58, 22.90],
  RO: [43.62, 20.26, 48.27, 29.69],
  BG: [41.24, 22.36, 44.21, 28.61],
  HR: [42.39, 13.49, 46.55, 19.43],
  SK: [47.73, 16.83, 49.60, 22.57],
  SI: [45.42, 13.38, 46.88, 16.60],
  IE: [51.42, -10.48, 55.38, -6.00],
  EE: [57.52, 21.77, 59.68, 28.21],
  LV: [55.67, 20.97, 58.09, 28.24],
  LT: [53.90, 20.94, 56.45, 26.84],
};
