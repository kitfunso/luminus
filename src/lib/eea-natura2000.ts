import { guardArcGisFields } from "./schema-guard.js";

const EEA_NATURA2000_BASE =
  "https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites/Natura2000_Dyna_WM/MapServer/0/query";

export interface EeaConstraintFeature {
  name: string;
  type: string;
  area_ha: number | null;
  source: string;
}

const BIRDS_DIRECTIVE_CODES = new Set(["A", "C", "D", "F", "H", "J"]);
const HABITATS_DIRECTIVE_CODES = new Set(["B", "E", "G", "I", "K", "c"]);

function buildEnvelopeGeometry(
  lat: number,
  lon: number,
  radiusKm: number,
): string {
  const latDelta = radiusKm / 111.32;
  const lonDelta = radiusKm / (111.32 * Math.cos(lat * (Math.PI / 180)));
  return `${lon - lonDelta},${lat - latDelta},${lon + lonDelta},${lat + latDelta}`;
}

function mapSiteType(siteType: unknown): string {
  const value = String(siteType ?? "").trim();
  if (BIRDS_DIRECTIVE_CODES.has(value)) return "natura2000_birds";
  if (HABITATS_DIRECTIVE_CODES.has(value)) return "natura2000_habitats";
  return "natura2000";
}

export async function queryNatura2000Layer(
  lat: number,
  lon: number,
  radiusKm: number,
): Promise<EeaConstraintFeature[]> {
  const url = new URL(EEA_NATURA2000_BASE);
  const p = url.searchParams;
  p.set("where", "1=1");
  p.set("geometry", buildEnvelopeGeometry(lat, lon, radiusKm));
  p.set("geometryType", "esriGeometryEnvelope");
  p.set("inSR", "4326");
  p.set("spatialRel", "esriSpatialRelIntersects");
  p.set("outFields", "SITECODE,SITENAME,SITETYPE,MS,Area_km2");
  p.set("returnGeometry", "false");
  p.set("resultRecordCount", "50");
  p.set("f", "json");

  const response = await fetch(url.toString());

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `EEA Natura 2000 API returned ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();
  if (json.error) {
    throw new Error(
      `EEA Natura 2000 API error: ${json.error.message ?? JSON.stringify(json.error)}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const features: any[] = json.features ?? [];

  guardArcGisFields(
    features,
    ["SITECODE", "SITENAME", "SITETYPE", "MS", "Area_km2"],
    "EEA Natura 2000",
  );

  return features.map((feature) => {
    const attrs = feature.attributes ?? {};
    const areaKm2 = attrs.Area_km2;
    return {
      name: String(attrs.SITENAME ?? attrs.SITECODE ?? "Unknown Natura 2000 site"),
      type: mapSiteType(attrs.SITETYPE),
      area_ha:
        typeof areaKm2 === "number" ? Math.round(areaKm2 * 100 * 100) / 100 : null,
      source: "eea-natura2000",
    };
  });
}
