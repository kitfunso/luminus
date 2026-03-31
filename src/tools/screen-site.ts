import { z } from "zod";
import { getTerrainAnalysis } from "./terrain-analysis.js";
import { getGridProximity } from "./grid-proximity.js";
import { getSolarIrradiance } from "./solar.js";
import { getLandConstraints } from "./land-constraints.js";
import { getAgriculturalLand } from "./agricultural-land.js";
import { getFloodRisk } from "./flood-risk.js";
import { getLandCover } from "./land-cover.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";

/** EU member-state country codes supported for reduced screening. */
export const EU_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
  "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
  "NL", "PL", "PT", "RO", "SE", "SI", "SK",
]);

export const screenSiteSchema = z.object({
  lat: z.number().describe("Latitude (-90 to 90). WGS84."),
  lon: z.number().describe("Longitude (-180 to 180). WGS84."),
  radius_km: z
    .number()
    .optional()
    .describe("Search radius in km for grid and constraints (default 2, max 10)."),
  country: z
    .string()
    .describe('ISO 3166-1 alpha-2 country code. "GB" and EU member states are supported.'),
});

// --- Heuristic thresholds ---

/** Slope above this is flagged as a terrain warning (degrees). */
const SLOPE_WARN_DEG = 10;

/** Annual irradiance below this is flagged as a solar warning (kWh/m2). */
const IRRADIANCE_WARN_KWH = 900;

// --- Types ---

type Verdict = "pass" | "warn" | "fail";

interface VerdictFlag {
  category: "terrain" | "grid" | "solar" | "constraints" | "agricultural_land" | "flood_risk" | "land_cover";
  level: "warn" | "fail";
  reason: string;
}

interface ScreenSiteVerdict {
  overall: Verdict;
  flags: VerdictFlag[];
}

interface ScreenSiteSourceMetadata {
  terrain: GisSourceMetadata;
  grid: GisSourceMetadata;
  solar: GisSourceMetadata;
  constraints: GisSourceMetadata;
  agricultural_land?: GisSourceMetadata;
  flood_risk?: GisSourceMetadata;
  land_cover?: GisSourceMetadata;
}

interface ScreenSiteResult {
  lat: number;
  lon: number;
  radius_km: number;
  country: string;
  terrain: any | null;
  grid: any | null;
  solar: any | null;
  constraints: any | null;
  agricultural_land: any | null;
  flood_risk: any | null;
  land_cover?: any | null;
  verdict: ScreenSiteVerdict;
  layers_available: string[];
  layers_unavailable: Record<string, string>;
  source_metadata: ScreenSiteSourceMetadata;
  warnings?: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "This is an automated screening summary using public data. " +
  "It is not investment advice, planning consent, or a final site feasibility assessment. " +
  "Professional due diligence is required before any development decision.";

// --- Heuristic evaluation ---

function evaluateVerdict(
  terrain: any | null,
  grid: any | null,
  solar: any | null,
  constraints: any | null,
  agriculturalLand: any | null,
  floodRisk: any | null,
  landCover?: any | null,
): { flags: VerdictFlag[]; overall: Verdict } {
  const flags: VerdictFlag[] = [];

  // Constraints: hard constraint = fail
  if (constraints?.summary?.has_hard_constraint) {
    flags.push({
      category: "constraints",
      level: "fail",
      reason: `${constraints.summary.constraint_count} protected area(s) found within search radius`,
    });
  }

  // Terrain: steep slope = warn
  if (terrain && terrain.slope_deg > SLOPE_WARN_DEG) {
    flags.push({
      category: "terrain",
      level: "warn",
      reason: `Slope is ${terrain.slope_deg} deg (threshold: ${SLOPE_WARN_DEG} deg)`,
    });
  }

  // Grid: no substations and no lines = warn
  if (grid && grid.summary.nearest_substation_km === null && grid.summary.nearest_line_km === null) {
    flags.push({
      category: "grid",
      level: "warn",
      reason: "No substations or HV lines found within search radius",
    });
  }

  // Solar: low irradiance = warn
  if (solar && solar.annual_irradiance_kwh_m2 < IRRADIANCE_WARN_KWH) {
    flags.push({
      category: "solar",
      level: "warn",
      reason: `Annual irradiance is ${solar.annual_irradiance_kwh_m2} kWh/m2 (threshold: ${IRRADIANCE_WARN_KWH} kWh/m2)`,
    });
  }

  // Agricultural land: BMV is a planning-risk warning, not a hard exclusion.
  if (agriculturalLand?.bmv_status === "yes") {
    flags.push({
      category: "agricultural_land",
      level: "warn",
      reason: `Best and Most Versatile agricultural land flagged (${agriculturalLand.effective_grade ?? "unknown grade"})`,
    });
  } else if (agriculturalLand?.bmv_status === "uncertain") {
    flags.push({
      category: "agricultural_land",
      level: "warn",
      reason: `Agricultural land classification is uncertain (${agriculturalLand.effective_grade ?? "unknown grade"}); Grade 3 may split into 3a or 3b`,
    });
  }

  // Flood risk: Flood Zone 3 and flood storage areas are treated as fail,
  // Flood Zone 2 as warn. This is a screening heuristic, not a legal rule.
  if (floodRisk?.flood_storage_area) {
    flags.push({
      category: "flood_risk",
      level: "fail",
      reason: "Point intersects an Environment Agency flood storage area",
    });
  } else if (floodRisk?.flood_zone === "3") {
    flags.push({
      category: "flood_risk",
      level: "fail",
      reason: "Point is in Flood Zone 3 (high probability floodplain)",
    });
  } else if (floodRisk?.flood_zone === "2") {
    flags.push({
      category: "flood_risk",
      level: "warn",
      reason: "Point is in Flood Zone 2 (medium probability floodplain)",
    });
  }

  // Land cover: CORINE planning exclusion = warn (EU only)
  if (landCover?.land_cover?.is_planning_exclusion) {
    flags.push({
      category: "land_cover",
      level: "warn",
      reason: `Land cover type "${landCover.land_cover.label}" is typically excluded from PV/BESS development`,
    });
  }

  // Overall: fail > warn > pass
  let overall: Verdict = "pass";
  if (flags.some((f) => f.level === "warn")) overall = "warn";
  if (flags.some((f) => f.level === "fail")) overall = "fail";

  return { flags, overall };
}

// --- Main tool function ---

export async function screenSite(
  params: z.infer<typeof screenSiteSchema>,
): Promise<ScreenSiteResult> {
  const { lat, lon } = params;
  const country = params.country.toUpperCase();
  const radiusKm = params.radius_km ?? 2;

  // Validation
  const isEu = EU_COUNTRY_CODES.has(country);
  if (country !== "GB" && !isEu) {
    throw new Error(
      `Country "${params.country}" is not supported. "GB" and EU member states are available.`,
    );
  }
  if (lat < -90 || lat > 90) {
    throw new Error("Latitude must be between -90 and 90.");
  }
  if (lon < -180 || lon > 180) {
    throw new Error("Longitude must be between -180 and 180.");
  }
  if (radiusKm <= 0 || radiusKm > 10) {
    throw new Error("radius_km must be between 0 and 10.");
  }

  if (isEu) {
    return screenSiteEu(lat, lon, radiusKm, country);
  }

  return screenSiteGb(lat, lon, radiusKm);
}

// --- GB flow (unchanged logic) ---

async function screenSiteGb(
  lat: number,
  lon: number,
  radiusKm: number,
): Promise<ScreenSiteResult> {
  // Run all sub-tools in parallel with allSettled for resilience
  const [terrainResult, gridResult, solarResult, constraintsResult, agriculturalLandResult, floodRiskResult] =
    await Promise.allSettled([
      getTerrainAnalysis({ lat, lon }),
      getGridProximity({ lat, lon, radius_km: radiusKm }),
      getSolarIrradiance({ lat, lon }),
      getLandConstraints({ lat, lon, radius_km: radiusKm, country: "GB" }),
      getAgriculturalLand({ lat, lon, country: "GB" }),
      getFloodRisk({ lat, lon, country: "GB" }),
    ]);

  const warnings: string[] = [];

  const terrain =
    terrainResult.status === "fulfilled" ? terrainResult.value : null;
  if (terrainResult.status === "rejected") {
    warnings.push(`terrain: ${terrainResult.reason instanceof Error ? terrainResult.reason.message : String(terrainResult.reason)}`);
  }

  const grid =
    gridResult.status === "fulfilled" ? gridResult.value : null;
  if (gridResult.status === "rejected") {
    warnings.push(`grid: ${gridResult.reason instanceof Error ? gridResult.reason.message : String(gridResult.reason)}`);
  }

  const solar =
    solarResult.status === "fulfilled" ? solarResult.value : null;
  if (solarResult.status === "rejected") {
    warnings.push(`solar: ${solarResult.reason instanceof Error ? solarResult.reason.message : String(solarResult.reason)}`);
  }

  const constraints =
    constraintsResult.status === "fulfilled" ? constraintsResult.value : null;
  if (constraintsResult.status === "rejected") {
    warnings.push(`constraints: ${constraintsResult.reason instanceof Error ? constraintsResult.reason.message : String(constraintsResult.reason)}`);
  }

  const agriculturalLand =
    agriculturalLandResult.status === "fulfilled" ? agriculturalLandResult.value : null;
  if (agriculturalLandResult.status === "rejected") {
    warnings.push(`agricultural_land: ${agriculturalLandResult.reason instanceof Error ? agriculturalLandResult.reason.message : String(agriculturalLandResult.reason)}`);
  }

  const floodRisk =
    floodRiskResult.status === "fulfilled" ? floodRiskResult.value : null;
  if (floodRiskResult.status === "rejected") {
    warnings.push(`flood_risk: ${floodRiskResult.reason instanceof Error ? floodRiskResult.reason.message : String(floodRiskResult.reason)}`);
  }

  // If all sub-queries failed, throw
  if (terrain === null && grid === null && solar === null && constraints === null && agriculturalLand === null && floodRisk === null) {
    throw new Error(`All sub-queries failed for screen_site: ${warnings.join("; ")}`);
  }

  const { flags, overall } = evaluateVerdict(terrain, grid, solar, constraints, agriculturalLand, floodRisk);

  const result: ScreenSiteResult = {
    lat,
    lon,
    radius_km: radiusKm,
    country: "GB",
    terrain,
    grid,
    solar,
    constraints,
    agricultural_land: agriculturalLand,
    flood_risk: floodRisk,
    verdict: { overall, flags },
    layers_available: ["terrain", "grid", "solar", "constraints", "agricultural_land", "flood_risk"],
    layers_unavailable: {
      land_cover: "Not applicable for GB",
    },
    source_metadata: {
      terrain: GIS_SOURCES["open-meteo-elevation"],
      grid: GIS_SOURCES["overpass-osm"],
      solar: GIS_SOURCES["pvgis"],
      constraints: GIS_SOURCES["natural-england"],
      agricultural_land: GIS_SOURCES["natural-england-alc"],
      flood_risk: GIS_SOURCES["ea-flood-map"],
    },
    disclaimer: DISCLAIMER,
  };

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  return result;
}

// --- EU flow (reduced layer set) ---

async function screenSiteEu(
  lat: number,
  lon: number,
  radiusKm: number,
  country: string,
): Promise<ScreenSiteResult> {
  const [terrainResult, gridResult, solarResult, constraintsResult, landCoverResult] =
    await Promise.allSettled([
      getTerrainAnalysis({ lat, lon }),
      getGridProximity({ lat, lon, radius_km: radiusKm }),
      getSolarIrradiance({ lat, lon }),
      getLandConstraints({ lat, lon, radius_km: radiusKm, country }),
      getLandCover({ lat, lon, country }),
    ]);

  const warnings: string[] = [];

  const terrain =
    terrainResult.status === "fulfilled" ? terrainResult.value : null;
  if (terrainResult.status === "rejected") {
    warnings.push(`terrain: ${terrainResult.reason instanceof Error ? terrainResult.reason.message : String(terrainResult.reason)}`);
  }

  const grid =
    gridResult.status === "fulfilled" ? gridResult.value : null;
  if (gridResult.status === "rejected") {
    warnings.push(`grid: ${gridResult.reason instanceof Error ? gridResult.reason.message : String(gridResult.reason)}`);
  }

  const solar =
    solarResult.status === "fulfilled" ? solarResult.value : null;
  if (solarResult.status === "rejected") {
    warnings.push(`solar: ${solarResult.reason instanceof Error ? solarResult.reason.message : String(solarResult.reason)}`);
  }

  const constraints =
    constraintsResult.status === "fulfilled" ? constraintsResult.value : null;
  if (constraintsResult.status === "rejected") {
    warnings.push(`constraints: ${constraintsResult.reason instanceof Error ? constraintsResult.reason.message : String(constraintsResult.reason)}`);
  }

  const landCover =
    landCoverResult.status === "fulfilled" ? landCoverResult.value : null;
  if (landCoverResult.status === "rejected") {
    warnings.push(`land_cover: ${landCoverResult.reason instanceof Error ? landCoverResult.reason.message : String(landCoverResult.reason)}`);
  }

  // If all sub-queries failed, throw
  if (terrain === null && grid === null && solar === null && constraints === null && landCover === null) {
    throw new Error(`All sub-queries failed for screen_site: ${warnings.join("; ")}`);
  }

  const { flags, overall } = evaluateVerdict(terrain, grid, solar, constraints, null, null, landCover);

  const result: ScreenSiteResult = {
    lat,
    lon,
    radius_km: radiusKm,
    country,
    terrain,
    grid,
    solar,
    constraints,
    agricultural_land: null,
    flood_risk: null,
    land_cover: landCover,
    verdict: { overall, flags },
    layers_available: ["terrain", "grid", "solar", "constraints", "land_cover"],
    layers_unavailable: {
      agricultural_land: "England only — no equivalent EU source",
      flood_risk: "England only — no equivalent EU source",
    },
    source_metadata: {
      terrain: GIS_SOURCES["open-meteo-elevation"],
      grid: GIS_SOURCES["overpass-osm"],
      solar: GIS_SOURCES["pvgis"],
      constraints: GIS_SOURCES["eea-natura2000"],
      land_cover: GIS_SOURCES["corine-land-cover"],
    },
    disclaimer: DISCLAIMER,
  };

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  return result;
}
