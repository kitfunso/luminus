/**
 * CORINE Land Cover 2018 — EEA ArcGIS REST client.
 *
 * Data source: Copernicus Land Monitoring Service / EEA
 * Licence: Copernicus (free, attribution required)
 * Coverage: EU27 + EEA/EFTA. Great Britain is NOT covered (UK left the
 * programme after CLC 2012). Return null for GB queries.
 *
 * CLC uses a three-level hierarchical nomenclature with 44 classes.
 * We return the raw code (string, e.g. "211"), the human label, the
 * top-level class group, and a conservative `is_planning_exclusion` flag.
 */

const CORINE_QUERY_URL =
  "https://image.discomap.eea.europa.eu/arcgis/rest/services/Corine/CLC2018_WM/MapServer/0/query";

/** EU member states + EEA/EFTA covered by CORINE 2018. */
export const CORINE_COVERED_COUNTRIES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
  "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
  "NL", "PL", "PT", "RO", "SE", "SI", "SK",
  // EEA/EFTA (also in CORINE)
  "IS", "LI", "NO", "TR", "AL", "BA", "ME", "MK", "RS", "XK",
]);

export interface CorineResult {
  /** 3-digit CLC code string, e.g. "211" */
  code: string;
  /** Human-readable label, e.g. "Non-irrigated arable land" */
  label: string;
  /** Top-level CLC class group */
  class_group: string;
  /**
   * True if this land-cover type typically faces strong planning barriers
   * for PV/BESS development. Conservative: only wetlands, water bodies,
   * and semi-natural woodland are flagged. Agricultural land is NOT flagged
   * here — that risk is assessed separately by ALC/national tools.
   */
  is_planning_exclusion: boolean;
  source: "corine-land-cover-2018";
}

// ---------------------------------------------------------------------------
// CLC nomenclature lookup
// ---------------------------------------------------------------------------

interface ClcEntry {
  label: string;
  group: string;
  exclusion: boolean;
}

/** Subset of the 44-class CLC 2018 nomenclature.
 *  Codes not in this map fall back to group-level labelling.
 */
const CLC_CODES: Readonly<Record<string, ClcEntry>> = {
  // 1xx — Artificial surfaces
  "111": { label: "Continuous urban fabric", group: "Artificial surfaces", exclusion: false },
  "112": { label: "Discontinuous urban fabric", group: "Artificial surfaces", exclusion: false },
  "121": { label: "Industrial or commercial units", group: "Artificial surfaces", exclusion: false },
  "122": { label: "Road and rail networks and associated land", group: "Artificial surfaces", exclusion: false },
  "123": { label: "Port areas", group: "Artificial surfaces", exclusion: false },
  "124": { label: "Airports", group: "Artificial surfaces", exclusion: false },
  "131": { label: "Mineral extraction sites", group: "Artificial surfaces", exclusion: false },
  "132": { label: "Dump sites", group: "Artificial surfaces", exclusion: false },
  "133": { label: "Construction sites", group: "Artificial surfaces", exclusion: false },
  "141": { label: "Green urban areas", group: "Artificial surfaces", exclusion: false },
  "142": { label: "Sport and leisure facilities", group: "Artificial surfaces", exclusion: false },
  // 2xx — Agricultural areas
  "211": { label: "Non-irrigated arable land", group: "Agricultural areas", exclusion: false },
  "212": { label: "Permanently irrigated land", group: "Agricultural areas", exclusion: false },
  "213": { label: "Rice fields", group: "Agricultural areas", exclusion: false },
  "221": { label: "Vineyards", group: "Agricultural areas", exclusion: false },
  "222": { label: "Fruit trees and berry plantations", group: "Agricultural areas", exclusion: false },
  "223": { label: "Olive groves", group: "Agricultural areas", exclusion: false },
  "231": { label: "Pastures", group: "Agricultural areas", exclusion: false },
  "241": { label: "Annual crops associated with permanent crops", group: "Agricultural areas", exclusion: false },
  "242": { label: "Complex cultivation patterns", group: "Agricultural areas", exclusion: false },
  "243": { label: "Land principally occupied by agriculture with significant areas of natural vegetation", group: "Agricultural areas", exclusion: false },
  "244": { label: "Agro-forestry areas", group: "Agricultural areas", exclusion: false },
  // 3xx — Forest and semi-natural areas
  "311": { label: "Broad-leaved forest", group: "Forest and semi-natural areas", exclusion: true },
  "312": { label: "Coniferous forest", group: "Forest and semi-natural areas", exclusion: true },
  "313": { label: "Mixed forest", group: "Forest and semi-natural areas", exclusion: true },
  "321": { label: "Natural grasslands", group: "Forest and semi-natural areas", exclusion: false },
  "322": { label: "Moors and heathland", group: "Forest and semi-natural areas", exclusion: false },
  "323": { label: "Sclerophyllous vegetation", group: "Forest and semi-natural areas", exclusion: false },
  "324": { label: "Transitional woodland-shrub", group: "Forest and semi-natural areas", exclusion: false },
  "331": { label: "Beaches, dunes, sands", group: "Forest and semi-natural areas", exclusion: false },
  "332": { label: "Bare rocks", group: "Forest and semi-natural areas", exclusion: false },
  "333": { label: "Sparsely vegetated areas", group: "Forest and semi-natural areas", exclusion: false },
  "334": { label: "Burnt areas", group: "Forest and semi-natural areas", exclusion: false },
  "335": { label: "Glaciers and perpetual snow", group: "Forest and semi-natural areas", exclusion: false },
  // 4xx — Wetlands
  "411": { label: "Inland marshes", group: "Wetlands", exclusion: true },
  "412": { label: "Peat bogs", group: "Wetlands", exclusion: true },
  "421": { label: "Salt marshes", group: "Wetlands", exclusion: true },
  "422": { label: "Salines", group: "Wetlands", exclusion: true },
  "423": { label: "Intertidal flats", group: "Wetlands", exclusion: true },
  // 5xx — Water bodies
  "511": { label: "Water courses", group: "Water bodies", exclusion: true },
  "512": { label: "Water bodies", group: "Water bodies", exclusion: true },
  "521": { label: "Coastal lagoons", group: "Water bodies", exclusion: true },
  "522": { label: "Estuaries", group: "Water bodies", exclusion: true },
  "523": { label: "Sea and ocean", group: "Water bodies", exclusion: true },
};

function getGroupFromCode(code: string): string {
  const first = code.charAt(0);
  switch (first) {
    case "1": return "Artificial surfaces";
    case "2": return "Agricultural areas";
    case "3": return "Forest and semi-natural areas";
    case "4": return "Wetlands";
    case "5": return "Water bodies";
    default:  return "Unknown";
  }
}

function mapClcCode(code: string): { label: string; group: string; exclusion: boolean } {
  const entry = CLC_CODES[code];
  if (entry) return { label: entry.label, group: entry.group, exclusion: entry.exclusion };
  const group = getGroupFromCode(code);
  return { label: `CLC code ${code}`, group, exclusion: false };
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export async function queryCorineAtPoint(
  lat: number,
  lon: number,
): Promise<CorineResult | null> {
  const url = new URL(CORINE_QUERY_URL);
  const p = url.searchParams;
  p.set("geometry", `${lon},${lat}`);
  p.set("geometryType", "esriGeometryPoint");
  p.set("inSR", "4326");
  p.set("spatialRel", "esriSpatialRelIntersects");
  p.set("outFields", "Code_18");
  p.set("returnGeometry", "false");
  p.set("resultRecordCount", "1");
  p.set("f", "json");

  const response = await fetch(url.toString());

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `CORINE API returned ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();
  if (json.error) {
    throw new Error(
      `CORINE API error: ${json.error.message ?? JSON.stringify(json.error)}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const features: any[] = json.features ?? [];
  if (features.length === 0) {
    // No polygon hit — typically offshore, or at the very edge of coverage.
    return null;
  }

  const code = String(features[0].attributes?.Code_18 ?? "").trim();
  if (!code) return null;

  const { label, group, exclusion } = mapClcCode(code);
  return {
    code,
    label,
    class_group: group,
    is_planning_exclusion: exclusion,
    source: "corine-land-cover-2018",
  };
}
