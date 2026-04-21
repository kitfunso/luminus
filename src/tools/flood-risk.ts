import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";
import { guardArcGisFields } from "../lib/schema-guard.js";
import {
  querySepaFloodAtPoint,
  type SepaFloodMatch,
} from "../lib/sepa-flood.js";
import { isScottishCoord } from "../lib/scotland-bbox.js";

const cache = new TtlCache();
const EA_FLOOD_MAP_BASE =
  "https://environment.data.gov.uk/KB6uNVj5ZcJr7jUP/ArcGIS/rest/services/Flood_Map_for_Planning/FeatureServer";

export const floodRiskSchema = z.object({
  lat: z.number().describe("Latitude (-90 to 90). WGS84."),
  lon: z.number().describe("Longitude (-180 to 180). WGS84."),
  country: z
    .string()
    .describe('ISO 3166-1 alpha-2 country code. Only "GB" is supported in this version.'),
});

type FloodZone = "1" | "2" | "3" | "unknown";
type PlanningRisk = "low" | "medium" | "high" | "unknown";

type FloodLayerKey = "flood_storage_area" | "flood_zone_3" | "flood_zone_2";

interface FloodLayerConfig {
  id: number;
  key: FloodLayerKey;
  label: string;
}

interface ArcGisFeature {
  attributes?: Record<string, unknown>;
}

interface FloodMatch {
  layer: FloodLayerKey;
  label: string;
  type: string | null;
  area_ha: number | null;
}

interface FloodRiskResult {
  lat: number;
  lon: number;
  country: string;
  flood_zone: FloodZone;
  flood_storage_area: boolean;
  planning_risk: PlanningRisk;
  flood_zone_3: FloodMatch[];
  flood_zone_2: FloodMatch[];
  flood_storage_areas: FloodMatch[];
  sepa_matches?: SepaFloodMatch[];
  explanation: string;
  source_metadata: GisSourceMetadata;
  additional_sources?: GisSourceMetadata[];
  warnings?: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "This is an automated flood-planning screen using the Environment Agency Flood Map for Planning. " +
  "It is not a site-specific flood risk assessment or planning determination.";

const FLOOD_LAYERS: readonly FloodLayerConfig[] = [
  { id: 0, key: "flood_storage_area", label: "Flood Storage Areas" },
  { id: 1, key: "flood_zone_3", label: "Flood Zone 3" },
  { id: 2, key: "flood_zone_2", label: "Flood Zone 2" },
] as const;

function buildPointQueryUrl(layerId: number, lon: number, lat: number): string {
  const url = new URL(`${EA_FLOOD_MAP_BASE}/${layerId}/query`);
  const p = url.searchParams;
  p.set("where", "1=1");
  p.set("geometry", `${lon},${lat}`);
  p.set("geometryType", "esriGeometryPoint");
  p.set("inSR", "4326");
  p.set("spatialRel", "esriSpatialRelIntersects");
  p.set("outFields", "layer,type,Shape__Area");
  p.set("returnGeometry", "false");
  p.set("resultRecordCount", "10");
  p.set("f", "json");
  return url.toString();
}

async function queryLayer(layer: FloodLayerConfig, lon: number, lat: number): Promise<ArcGisFeature[]> {
  const response = await fetch(buildPointQueryUrl(layer.id, lon, lat));

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Environment Agency Flood Map API returned ${response.status} for ${layer.label}: ${body.slice(0, 300)}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();
  if (json.error) {
    throw new Error(
      `Environment Agency Flood Map API error for ${layer.label}: ${json.error.message ?? JSON.stringify(json.error)}`,
    );
  }

  const features: ArcGisFeature[] = Array.isArray(json.features) ? json.features : [];
  guardArcGisFields(
    features as Array<{ attributes: Record<string, unknown> }>,
    ["layer", "Shape__Area"],
    `Environment Agency Flood Map (${layer.label})`,
  );
  return features;
}

function toRoundedHectares(value: unknown): number | null {
  if (typeof value !== "number") return null;
  return Math.round((value / 10_000) * 100) / 100;
}

function toOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapMatches(layer: FloodLayerConfig, features: ArcGisFeature[]): FloodMatch[] {
  return features.map((feature) => {
    const attrs = feature.attributes ?? {};
    return {
      layer: layer.key,
      label: toOptionalString(attrs.layer) ?? layer.label,
      type: toOptionalString(attrs.type),
      area_ha: toRoundedHectares(attrs.Shape__Area),
    };
  });
}

function buildExplanation(
  floodZone: FloodZone,
  hasFloodStorageArea: boolean,
  planningRisk: PlanningRisk,
): string {
  if (hasFloodStorageArea && floodZone === "3") {
    return "Point intersects a flood storage area and Flood Zone 3. Treat this as a high planning-risk site for development screening.";
  }
  if (hasFloodStorageArea && floodZone === "2") {
    return "Point intersects a flood storage area and Flood Zone 2. Treat this as a high planning-risk site for development screening.";
  }
  if (hasFloodStorageArea) {
    return "Point intersects a flood storage area. Treat this as a high planning-risk site for development screening.";
  }
  if (floodZone === "3") {
    return "Point is in Flood Zone 3, the high-probability flood zone in the Environment Agency Flood Map for Planning.";
  }
  if (floodZone === "2") {
    return "Point is in Flood Zone 2, but not Flood Zone 3, in the Environment Agency Flood Map for Planning.";
  }
  if (floodZone === "1" && planningRisk === "low") {
    return "Point does not intersect Flood Zone 2, Flood Zone 3, or a flood storage area in the Environment Agency Flood Map for Planning.";
  }
  return "Flood classification is unknown because one or more Environment Agency flood layers could not be checked.";
}

export async function getFloodRisk(
  params: z.infer<typeof floodRiskSchema>,
): Promise<FloodRiskResult> {
  const { lat, lon } = params;
  const country = params.country.toUpperCase();

  if (country !== "GB") {
    throw new Error(
      `Country "${params.country}" is not supported. Only "GB" (Great Britain) is available in this version. England flood-planning coverage is implemented first via the Environment Agency Flood Map for Planning.`,
    );
  }
  if (lat < -90 || lat > 90) {
    throw new Error("Latitude must be between -90 and 90.");
  }
  if (lon < -180 || lon > 180) {
    throw new Error("Longitude must be between -180 and 180.");
  }

  const cacheKey = `flood-risk:${lat}:${lon}:${country}`;
  const cached = cache.get<FloodRiskResult>(cacheKey);
  if (cached) return cached;

  const queryScotland = isScottishCoord(lat, lon);
  const [eaResults, sepaResult] = await Promise.all([
    Promise.allSettled(FLOOD_LAYERS.map((layer) => queryLayer(layer, lon, lat))),
    queryScotland
      ? querySepaFloodAtPoint(lat, lon).catch((err: unknown) => ({
          matches: [] as SepaFloodMatch[],
          errors: [err instanceof Error ? err.message : String(err)],
        }))
      : Promise.resolve({ matches: [] as SepaFloodMatch[], errors: [] as string[] }),
  ]);
  const results = eaResults;

  const warnings: string[] = [];

  const storageAreas =
    results[0].status === "fulfilled" ? mapMatches(FLOOD_LAYERS[0], results[0].value) : [];
  if (results[0].status === "rejected") {
    warnings.push(
      `flood_storage_area: ${results[0].reason instanceof Error ? results[0].reason.message : String(results[0].reason)}`,
    );
  }

  const zone3 =
    results[1].status === "fulfilled" ? mapMatches(FLOOD_LAYERS[1], results[1].value) : [];
  if (results[1].status === "rejected") {
    warnings.push(
      `flood_zone_3: ${results[1].reason instanceof Error ? results[1].reason.message : String(results[1].reason)}`,
    );
  }

  const zone2 =
    results[2].status === "fulfilled" ? mapMatches(FLOOD_LAYERS[2], results[2].value) : [];
  if (results[2].status === "rejected") {
    warnings.push(
      `flood_zone_2: ${results[2].reason instanceof Error ? results[2].reason.message : String(results[2].reason)}`,
    );
  }

  // SEPA warnings flow into the same bucket as EA warnings so callers see one list.
  for (const err of sepaResult.errors) {
    warnings.push(`sepa-flood: ${err}`);
  }

  const eaAllFailed = results.every((result) => result.status === "rejected");
  const eaHasAnyFailure = results.some((result) => result.status === "rejected");
  const sepaAttempted = queryScotland;
  // A fully-successful SEPA query (zero errors) is a confident result even when
  // SEPA reports zero matches. Only throw when both EA and SEPA have failed.
  const sepaSuccessful = sepaAttempted && sepaResult.errors.length === 0;

  if (eaAllFailed && !sepaSuccessful) {
    throw new Error(
      `All flood queries failed (Environment Agency${sepaAttempted ? " and SEPA" : ""}): ${warnings.join("; ")}`,
    );
  }

  const hasFloodStorageArea = storageAreas.length > 0;
  const hasZone3 = zone3.length > 0;
  const hasZone2 = zone2.length > 0;
  const hasWarnings = warnings.length > 0;

  // SEPA likelihood -> EA zone mapping:
  //   SEPA High (1-in-10yr)       -> equivalent-or-worse than EA Zone 3
  //   SEPA Medium (1-in-200yr)    -> equivalent to EA Zone 3
  //   SEPA Low (1-in-1000yr)      -> equivalent to EA Zone 2
  const sepaMatches = sepaResult.matches;
  const sepaHigh = sepaMatches.some(
    (m) => m.likelihood === "high" || m.likelihood === "medium",
  );
  const sepaLow = sepaMatches.some((m) => m.likelihood === "low");

  // A fully-successful SEPA query with no matches is a confident "clear" signal
  // for a Scottish coordinate, even when the EA service errored (expected, EA
  // is England-only). This prevents 0.6.0's false "unknown" for Scottish sites.
  const sepaConfidentlyClear =
    sepaAttempted && sepaResult.errors.length === 0 && sepaMatches.length === 0;
  const eaConfidentlyClear = !eaHasAnyFailure;

  let floodZone: FloodZone = "1";
  let planningRisk: PlanningRisk = "low";

  if (hasZone3 || sepaHigh) {
    floodZone = "3";
    planningRisk = "high";
  } else if (hasZone2 || sepaLow) {
    floodZone = "2";
    planningRisk = "medium";
  } else if (sepaConfidentlyClear || eaConfidentlyClear) {
    floodZone = "1";
    planningRisk = "low";
  } else if (hasWarnings && eaHasAnyFailure) {
    floodZone = "unknown";
    planningRisk = "unknown";
  }

  if (hasFloodStorageArea) {
    planningRisk = "high";
  }

  const result: FloodRiskResult = {
    lat,
    lon,
    country: "GB",
    flood_zone: floodZone,
    flood_storage_area: hasFloodStorageArea,
    planning_risk: planningRisk,
    flood_zone_3: zone3,
    flood_zone_2: zone2,
    flood_storage_areas: storageAreas,
    explanation: buildExplanation(floodZone, hasFloodStorageArea, planningRisk),
    source_metadata: GIS_SOURCES["ea-flood-map"],
    disclaimer: DISCLAIMER,
  };

  if (sepaAttempted) {
    result.sepa_matches = sepaMatches;
    result.additional_sources = [GIS_SOURCES["sepa-flood-map"]];
  }

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  cache.set(cacheKey, result, TTL.STATIC_DATA);
  return result;
}
