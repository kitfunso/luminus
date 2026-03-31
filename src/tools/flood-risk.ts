import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";

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
  explanation: string;
  source_metadata: GisSourceMetadata;
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

  return Array.isArray(json.features) ? json.features : [];
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

  const results = await Promise.allSettled(
    FLOOD_LAYERS.map((layer) => queryLayer(layer, lon, lat)),
  );

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

  if (results.every((result) => result.status === "rejected")) {
    throw new Error(`All Environment Agency flood queries failed: ${warnings.join("; ")}`);
  }

  const hasFloodStorageArea = storageAreas.length > 0;
  const hasZone3 = zone3.length > 0;
  const hasZone2 = zone2.length > 0;
  const hasWarnings = warnings.length > 0;

  let floodZone: FloodZone = "1";
  let planningRisk: PlanningRisk = "low";

  if (hasZone3) {
    floodZone = "3";
    planningRisk = "high";
  } else if (hasZone2) {
    floodZone = "2";
    planningRisk = "medium";
  } else if (hasWarnings) {
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

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  cache.set(cacheKey, result, TTL.STATIC_DATA);
  return result;
}
