/**
 * Coarse Scotland bounding-box helper.
 *
 * Used by GB tools to decide whether to additionally query Scottish upstreams
 * (NatureScot, SEPA, James Hutton LCA). The box is intentionally generous: it
 * errs toward "call both England and Scotland" for border-region coordinates,
 * relying on each upstream's empty-result handling to dedupe.
 */

const SCOTLAND_BBOX = {
  min_lat: 54.65,
  max_lat: 61.0,
  min_lon: -8.5,
  max_lon: 0.5,
} as const;

export function isScottishCoord(lat: number, lon: number): boolean {
  return (
    lat >= SCOTLAND_BBOX.min_lat &&
    lat <= SCOTLAND_BBOX.max_lat &&
    lon >= SCOTLAND_BBOX.min_lon &&
    lon <= SCOTLAND_BBOX.max_lon
  );
}
