/**
 * corridor-lines.ts
 *
 * Static mapping from corridor identifiers to named physical interconnectors
 * in transmission-lines.json.
 *
 * Coverage: 19 of 20 named lines. Where multiple lines serve one corridor
 * (e.g. IFA + IFA2 for FR-GB), all are listed so they can be highlighted
 * together when the corridor is selected.
 *
 * Key format: corridorId() output — two ISO2 codes sorted A-Z, joined with "-".
 */

export const CORRIDOR_LINE_MAP: Record<string, string[]> = {
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

/** Return the stable corridorId for two country codes (order-independent). */
export function corridorId(a: string, b: string): string {
  return [a, b].sort().join('-');
}

/** Return the corridorId a named line belongs to, or null if unmapped. */
export function corridorForLine(lineName: string): string | null {
  for (const [cid, names] of Object.entries(CORRIDOR_LINE_MAP)) {
    if (names.includes(lineName)) return cid;
  }
  return null;
}

/**
 * Given a corridorId and the full transmission-lines dataset,
 * return only the lines that physically represent that corridor.
 */
export function matchCorridorLines<T extends { name: string }>(
  cid: string,
  lines: T[]
): T[] {
  const names = CORRIDOR_LINE_MAP[cid];
  if (!names?.length) return [];
  return lines.filter((l) => names.includes(l.name));
}
