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
