/**
 * Natural England ArcGIS REST API client for querying GB protected area layers.
 *
 * Queries the Natural England Open Data Geoportal (ArcGIS Online hosted feature services)
 * for environmental designations: SSSIs, SACs, SPAs, Ramsar sites, National Parks, and AONBs.
 *
 * All endpoints are free, require no API key, and are published under OGL v3.
 * Attribution: © Natural England copyright. Contains Ordnance Survey data © Crown copyright.
 */

const NE_ARCGIS_BASE =
  "https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services";

export interface ConstraintLayerConfig {
  readonly slug: string;
  readonly constraintType: string;
  readonly nameField: string;
  readonly areaField: string | null;
}

export const GB_PROTECTED_AREA_LAYERS: readonly ConstraintLayerConfig[] = [
  {
    slug: "SSSI_England",
    constraintType: "sssi",
    nameField: "NAME",
    areaField: "MEASURE",
  },
  {
    slug: "Special_Areas_of_Conservation_England",
    constraintType: "sac",
    nameField: "SAC_NAME",
    areaField: "SAC_AREA",
  },
  {
    slug: "Special_Protection_Areas_England",
    constraintType: "spa",
    nameField: "SPA_NAME",
    areaField: "SPA_AREA",
  },
  {
    slug: "Ramsar_England",
    constraintType: "ramsar",
    nameField: "NAME",
    areaField: "AREA",
  },
  {
    slug: "National_Parks_England",
    constraintType: "national_park",
    nameField: "NAME",
    areaField: "MEASURE",
  },
  {
    slug: "Areas_of_Outstanding_Natural_Beauty_England",
    constraintType: "aonb",
    nameField: "NAME",
    areaField: "STAT_AREA",
  },
];

export interface ConstraintFeature {
  name: string;
  type: string;
  area_ha: number | null;
  source: string;
}

/**
 * Build a WGS84 bounding box string from a point and radius.
 * Returns "xmin,ymin,xmax,ymax" suitable for ArcGIS REST envelope queries.
 */
function buildEnvelopeGeometry(
  lat: number,
  lon: number,
  radiusKm: number,
): string {
  const latDelta = radiusKm / 111.32;
  const lonDelta = radiusKm / (111.32 * Math.cos(lat * (Math.PI / 180)));
  return `${lon - lonDelta},${lat - latDelta},${lon + lonDelta},${lat + latDelta}`;
}

/**
 * Query a single Natural England ArcGIS feature layer for protected areas
 * intersecting a bounding box around the given point.
 */
export async function queryLayer(
  layer: ConstraintLayerConfig,
  lat: number,
  lon: number,
  radiusKm: number,
): Promise<ConstraintFeature[]> {
  const base = `${NE_ARCGIS_BASE}/${layer.slug}/FeatureServer/0/query`;
  const url = new URL(base);
  const p = url.searchParams;
  p.set("where", "1=1");
  p.set("geometry", buildEnvelopeGeometry(lat, lon, radiusKm));
  p.set("geometryType", "esriGeometryEnvelope");
  p.set("inSR", "4326");
  p.set("spatialRel", "esriSpatialRelIntersects");

  const fields = [layer.nameField];
  if (layer.areaField) fields.push(layer.areaField);
  p.set("outFields", fields.join(","));
  p.set("returnGeometry", "false");
  p.set("resultRecordCount", "20");
  p.set("f", "json");

  const response = await fetch(url.toString());

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Natural England API returned ${response.status} for ${layer.constraintType}: ${body.slice(0, 300)}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();

  if (json.error) {
    throw new Error(
      `Natural England API error for ${layer.constraintType}: ${json.error.message ?? JSON.stringify(json.error)}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const features: any[] = json.features ?? [];
  return features.map((f) => {
    const attrs = f.attributes ?? {};
    const areaRaw = layer.areaField ? attrs[layer.areaField] : null;
    return {
      name: String(attrs[layer.nameField] ?? "Unknown"),
      type: layer.constraintType,
      area_ha: typeof areaRaw === "number" ? Math.round(areaRaw * 100) / 100 : null,
      source: "natural-england",
    };
  });
}
