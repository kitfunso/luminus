import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";
import { guardArcGisFields } from "../lib/schema-guard.js";

const cache = new TtlCache();
const NE_ARCGIS_BASE =
  "https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services";

const POST_1988_SERVICE = "Agricultural_Land_Classification_Post_1988";
const PROVISIONAL_SERVICE = "Provisional Agricultural Land Classification (ALC) (England)";

export const agriculturalLandSchema = z.object({
  lat: z.number().describe("Latitude (-90 to 90). WGS84."),
  lon: z.number().describe("Longitude (-180 to 180). WGS84."),
  country: z
    .string()
    .describe('ISO 3166-1 alpha-2 country code. Only "GB" is supported in this version.'),
});

type BmvStatus = "yes" | "no" | "uncertain" | "unknown";
type ClassificationBasis = "post_1988" | "provisional" | "none";

interface AlcClassification {
  source: "post_1988" | "provisional";
  grade: string | null;
  area_ha: number | null;
  survey_ref: string | null;
}

interface AgriculturalLandResult {
  lat: number;
  lon: number;
  country: string;
  post_1988: AlcClassification | null;
  provisional: AlcClassification | null;
  effective_grade: string | null;
  bmv_status: BmvStatus;
  classification_basis: ClassificationBasis;
  explanation: string;
  source_metadata: GisSourceMetadata;
  warnings?: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "This is an automated agricultural-land screening result using public data. " +
  "It is not a planning determination or a substitute for a formal Agricultural Land Classification survey.";

interface ArcGisFeature {
  attributes?: Record<string, unknown>;
}

function buildPointQueryUrl(serviceName: string, lon: number, lat: number, outFields: string[]): string {
  const url = new URL(`${NE_ARCGIS_BASE}/${serviceName}/FeatureServer/0/query`);
  const p = url.searchParams;
  p.set("where", "1=1");
  p.set("geometry", `${lon},${lat}`);
  p.set("geometryType", "esriGeometryPoint");
  p.set("inSR", "4326");
  p.set("spatialRel", "esriSpatialRelIntersects");
  p.set("outFields", outFields.join(","));
  p.set("returnGeometry", "false");
  p.set("resultRecordCount", "5");
  p.set("f", "json");
  return url.toString();
}

async function queryPointLayer(serviceName: string, lon: number, lat: number, outFields: string[]): Promise<ArcGisFeature[]> {
  const response = await fetch(buildPointQueryUrl(serviceName, lon, lat, outFields));

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Natural England ALC API returned ${response.status} for ${serviceName}: ${body.slice(0, 300)}`,
    );
  }

  const json: any = await response.json();
  if (json.error) {
    throw new Error(
      `Natural England ALC API error for ${serviceName}: ${json.error.message ?? JSON.stringify(json.error)}`,
    );
  }

  const features: ArcGisFeature[] = Array.isArray(json.features) ? json.features : [];
  guardArcGisFields(
    features as Array<{ attributes: Record<string, unknown> }>,
    outFields,
    `Natural England ALC (${serviceName})`,
  );
  return features;
}

function normaliseGrade(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

function toRoundedNumber(value: unknown): number | null {
  return typeof value === "number" ? Math.round(value * 100) / 100 : null;
}

function pickFeature(features: ArcGisFeature[]): ArcGisFeature | null {
  return (
    features.find((feature) => normaliseGrade(feature.attributes?.ALC_GRADE) !== null) ??
    features[0] ??
    null
  );
}

function mapPost1988(feature: ArcGisFeature | null): AlcClassification | null {
  if (!feature) return null;
  const attrs = feature.attributes ?? {};
  return {
    source: "post_1988",
    grade: normaliseGrade(attrs.ALC_GRADE),
    area_ha: toRoundedNumber(attrs.HECTARES),
    survey_ref: typeof attrs.RPT === "string" ? attrs.RPT.trim() || null : null,
  };
}

function mapProvisional(feature: ArcGisFeature | null): AlcClassification | null {
  if (!feature) return null;
  const attrs = feature.attributes ?? {};
  return {
    source: "provisional",
    grade: normaliseGrade(attrs.ALC_GRADE),
    area_ha: toRoundedNumber(attrs.AREA),
    survey_ref: typeof attrs.GEOGEXT === "string" ? attrs.GEOGEXT.trim() || null : null,
  };
}

function detailedBmvStatus(grade: string | null): BmvStatus {
  if (!grade) return "unknown";
  const value = grade.toLowerCase();
  if (["grade 1", "grade 2", "grade 3a"].includes(value)) return "yes";
  if (["grade 3", "grade 3b"].includes(value)) return value === "grade 3" ? "uncertain" : "no";
  if (
    [
      "grade 4",
      "grade 5",
      "non agricultural",
      "urban",
      "other land",
      "water",
    ].includes(value)
  ) {
    return "no";
  }
  return "unknown";
}

function provisionalBmvStatus(grade: string | null): BmvStatus {
  if (!grade) return "unknown";
  const value = grade.toLowerCase();
  if (["grade 1", "grade 2"].includes(value)) return "yes";
  if (value === "grade 3") return "uncertain";
  if (
    [
      "grade 4",
      "grade 5",
      "non agricultural",
      "urban",
      "other land",
      "water",
    ].includes(value)
  ) {
    return "no";
  }
  return "unknown";
}

function buildExplanation(
  basis: ClassificationBasis,
  effectiveGrade: string | null,
  bmvStatus: BmvStatus,
): string {
  if (basis === "post_1988") {
    if (bmvStatus === "yes") {
      return `Detailed post-1988 ALC survey classifies this site as ${effectiveGrade}, which is Best and Most Versatile agricultural land.`;
    }
    if (bmvStatus === "no") {
      return `Detailed post-1988 ALC survey classifies this site as ${effectiveGrade}, which is not Best and Most Versatile agricultural land.`;
    }
    return `Detailed post-1988 ALC survey returned ${effectiveGrade ?? "an unknown grade"}. Treat BMV status as uncertain until checked manually.`;
  }

  if (basis === "provisional") {
    if (bmvStatus === "yes") {
      return `Provisional ALC classifies this site as ${effectiveGrade}, which strongly suggests Best and Most Versatile agricultural land.`;
    }
    if (bmvStatus === "no") {
      return `Provisional ALC classifies this site as ${effectiveGrade}, which is not Best and Most Versatile agricultural land.`;
    }
    return `Provisional ALC classifies this site as ${effectiveGrade ?? "an unknown grade"}. Grade 3 cannot distinguish 3a from 3b, so BMV status is uncertain.`;
  }

  return "No Natural England ALC polygon matched this point. Coverage is England-only and incomplete, so BMV status is unknown rather than clear.";
}

export async function getAgriculturalLand(
  params: z.infer<typeof agriculturalLandSchema>,
): Promise<AgriculturalLandResult> {
  const { lat, lon } = params;
  const country = params.country.toUpperCase();

  if (country !== "GB") {
    throw new Error(
      `Country "${params.country}" is not supported. Only "GB" (Great Britain) is available in this version. England coverage is implemented first via Natural England ALC data.`,
    );
  }
  if (lat < -90 || lat > 90) {
    throw new Error("Latitude must be between -90 and 90.");
  }
  if (lon < -180 || lon > 180) {
    throw new Error("Longitude must be between -180 and 180.");
  }

  const cacheKey = `agricultural-land:${lat}:${lon}:${country}`;
  const cached = cache.get<AgriculturalLandResult>(cacheKey);
  if (cached) return cached;

  const [post1988Result, provisionalResult] = await Promise.allSettled([
    queryPointLayer(POST_1988_SERVICE, lon, lat, ["ALC_GRADE", "HECTARES", "RPT"]),
    queryPointLayer(PROVISIONAL_SERVICE, lon, lat, ["ALC_GRADE", "AREA", "GEOGEXT"]),
  ]);

  const warnings: string[] = [];

  const post1988 =
    post1988Result.status === "fulfilled"
      ? mapPost1988(pickFeature(post1988Result.value))
      : null;
  if (post1988Result.status === "rejected") {
    warnings.push(
      `post_1988: ${post1988Result.reason instanceof Error ? post1988Result.reason.message : String(post1988Result.reason)}`,
    );
  }

  const provisional =
    provisionalResult.status === "fulfilled"
      ? mapProvisional(pickFeature(provisionalResult.value))
      : null;
  if (provisionalResult.status === "rejected") {
    warnings.push(
      `provisional: ${provisionalResult.reason instanceof Error ? provisionalResult.reason.message : String(provisionalResult.reason)}`,
    );
  }

  if (post1988Result.status === "rejected" && provisionalResult.status === "rejected") {
    throw new Error(`All Natural England ALC queries failed: ${warnings.join("; ")}`);
  }

  let classificationBasis: ClassificationBasis = "none";
  let effectiveGrade: string | null = null;
  let bmvStatus: BmvStatus = "unknown";

  if (post1988 !== null) {
    classificationBasis = "post_1988";
    effectiveGrade = post1988.grade;
    bmvStatus = detailedBmvStatus(post1988.grade);
  } else if (provisional !== null) {
    classificationBasis = "provisional";
    effectiveGrade = provisional.grade;
    bmvStatus = provisionalBmvStatus(provisional.grade);
  }

  const result: AgriculturalLandResult = {
    lat,
    lon,
    country: "GB",
    post_1988: post1988,
    provisional,
    effective_grade: effectiveGrade,
    bmv_status: bmvStatus,
    classification_basis: classificationBasis,
    explanation: buildExplanation(classificationBasis, effectiveGrade, bmvStatus),
    source_metadata: GIS_SOURCES["natural-england-alc"],
    disclaimer: DISCLAIMER,
  };

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  cache.set(cacheKey, result, TTL.STATIC_DATA);
  return result;
}
