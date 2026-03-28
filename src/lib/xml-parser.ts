import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // ENTSO-E quirk: single-element arrays come back as objects
  // Force arrays for known list elements
  isArray: (_name, jpath) => {
    const arrayPaths = [
      "GL_MarketDocument.TimeSeries",
      "Publication_MarketDocument.TimeSeries",
      "Imbalance_MarketDocument.TimeSeries",
      "Balancing_MarketDocument.TimeSeries",
      "Unavailability_MarketDocument.TimeSeries",
      "UnavailabilityMarketDocument.TimeSeries",
      "TimeSeries.Period",
      "Period.Point",
      "TimeSeries.Available_Period",
      "Available_Period.Point",
      "TimeSeries.MktPSRType.MktGeneratingUnit",
    ];
    const jp = String(jpath);
    return arrayPaths.some((p) => jp.endsWith(p));
  },
});

/** Parse ENTSO-E XML response into JS object */
export function parseXml(xml: string): Record<string, unknown> {
  return parser.parse(xml) as Record<string, unknown>;
}

/** Ensure a value is always an array (handles ENTSO-E single-vs-array quirk) */
export function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
