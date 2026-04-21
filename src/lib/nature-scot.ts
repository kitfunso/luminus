/**
 * NatureScot ArcGIS REST API client for querying Scottish protected area layers.
 *
 * Queries the NatureScot (Scottish Natural Heritage) ArcGIS Online hosted feature
 * services for Scottish environmental designations: SSSIs, SACs, SPAs, Ramsar
 * sites, National Nature Reserves, and Marine Protected Areas.
 *
 * All endpoints are free, require no API key, and are published under OGL v3.
 * Attribution: Contains NatureScot data, (c) Crown copyright and database right.
 * Licensed under the Open Government Licence v3.0.
 *
 * Future additions: Local_Nature_Reserves, Biosphere_Reserves (out of scope for
 * the first Scotland-coverage batch).
 */

import {
  buildEnvelopeGeometry,
  type ConstraintFeature,
  type ConstraintLayerConfig,
} from "./natural-england.js";
import { guardArcGisFields } from "./schema-guard.js";

const NATURE_SCOT_ARCGIS_BASE =
  "https://services1.arcgis.com/LM9GyVFsughzHdbO/arcgis/rest/services";

/**
 * Scottish protected-area layers hosted by NatureScot.
 *
 * Note: PA_CODE is used as the display-name fallback when NAME is absent
 * on a feature. EUROPEAN_CODE is SAC/SPA-specific and deliberately excluded
 * from the generic outFields set to avoid schema-guard false positives on
 * SSSI/NNR/MPA/Ramsar layers.
 */
export const SCOTTISH_PROTECTED_AREA_LAYERS: readonly ConstraintLayerConfig[] = [
  {
    slug: "Sites_of_Special_Scientific_Interest",
    constraintType: "sssi",
    nameField: "NAME",
    areaField: "SITE_HA",
  },
  {
    slug: "Special_Areas_of_Conservation",
    constraintType: "sac",
    nameField: "NAME",
    areaField: "SITE_HA",
  },
  {
    slug: "Special_Protection_Areas",
    constraintType: "spa",
    nameField: "NAME",
    areaField: "SITE_HA",
  },
  {
    slug: "RAMSAR_Wetlands_of_International_Importance",
    constraintType: "ramsar",
    nameField: "NAME",
    areaField: "SITE_HA",
  },
  {
    slug: "National_Nature_Reserves",
    constraintType: "nnr",
    nameField: "NAME",
    areaField: "SITE_HA",
  },
  {
    slug: "Marine_Protected_Areas",
    constraintType: "mpa",
    nameField: "NAME",
    areaField: "SITE_HA",
  },
];

/**
 * Query a single NatureScot ArcGIS feature layer for Scottish protected areas
 * intersecting a bounding box around the given point.
 *
 * Falls back to PA_CODE when NAME is absent on a feature.
 */
export async function queryScottishLayer(
  layer: ConstraintLayerConfig,
  lat: number,
  lon: number,
  radiusKm: number,
): Promise<ConstraintFeature[]> {
  const base = `${NATURE_SCOT_ARCGIS_BASE}/${layer.slug}/FeatureServer/0/query`;
  const url = new URL(base);
  const p = url.searchParams;
  p.set("where", "1=1");
  p.set("geometry", buildEnvelopeGeometry(lat, lon, radiusKm));
  p.set("geometryType", "esriGeometryEnvelope");
  p.set("inSR", "4326");
  p.set("spatialRel", "esriSpatialRelIntersects");

  const fields = [layer.nameField, "PA_CODE"];
  if (layer.areaField) fields.push(layer.areaField);
  p.set("outFields", fields.join(","));
  p.set("returnGeometry", "false");
  p.set("resultRecordCount", "20");
  p.set("f", "json");

  const response = await fetch(url.toString());

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `NatureScot API returned ${response.status} for ${layer.constraintType}: ${body.slice(0, 300)}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();

  if (json.error) {
    throw new Error(
      `NatureScot API error for ${layer.constraintType}: ${json.error.message ?? JSON.stringify(json.error)}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const features: any[] = json.features ?? [];

  const expectedFields = [layer.nameField];
  if (layer.areaField) expectedFields.push(layer.areaField);
  guardArcGisFields(features, expectedFields, `NatureScot ${layer.constraintType.toUpperCase()}`);

  return features.map((f) => {
    const attrs = f.attributes ?? {};
    const areaRaw = layer.areaField ? attrs[layer.areaField] : null;
    const nameRaw = attrs[layer.nameField];
    const name =
      nameRaw != null && String(nameRaw).length > 0
        ? String(nameRaw)
        : attrs.PA_CODE != null
          ? String(attrs.PA_CODE)
          : "Unknown";
    return {
      name,
      type: layer.constraintType,
      area_ha: typeof areaRaw === "number" ? Math.round(areaRaw * 100) / 100 : null,
      source: "nature-scot",
    };
  });
}
