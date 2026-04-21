import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import {
  GB_PROTECTED_AREA_LAYERS,
  queryLayer,
  type ConstraintFeature,
} from "../lib/natural-england.js";
import {
  SCOTTISH_PROTECTED_AREA_LAYERS,
  queryScottishLayer,
} from "../lib/nature-scot.js";
import { queryNatura2000Layer } from "../lib/eea-natura2000.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";
import { isScottishCoord } from "../lib/scotland-bbox.js";

const cache = new TtlCache();

export const landConstraintsSchema = z.object({
  lat: z.number().describe("Latitude (-90 to 90). WGS84."),
  lon: z.number().describe("Longitude (-180 to 180). WGS84."),
  radius_km: z
    .number()
    .optional()
    .describe("Search radius in km (default 2, max 10)."),
  country: z
    .string()
    .describe('ISO 3166-1 alpha-2 country code. Supports "GB" plus EU member states in this version.'),
});

interface LandConstraintsSummary {
  has_hard_constraint: boolean;
  constraint_count: number;
}

interface LandConstraintsResult {
  lat: number;
  lon: number;
  radius_km: number;
  country: string;
  constraints: ConstraintFeature[];
  summary: LandConstraintsSummary;
  source_metadata: GisSourceMetadata;
  additional_sources?: GisSourceMetadata[];
  warnings?: string[];
}

/** Designation types that represent hard planning exclusions for PV/BESS siting. */
const HARD_CONSTRAINT_TYPES = new Set([
  "sssi",
  "sac",
  "spa",
  "ramsar",
  "national_park",
  "natura2000",
  "natura2000_birds",
  "natura2000_habitats",
]);

const EU_COUNTRY_CODES = new Set([
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
]);

function dedupeConstraints(constraints: ConstraintFeature[]): ConstraintFeature[] {
  const seen = new Set<string>();
  return constraints.filter((constraint) => {
    const key = `${constraint.type}:${constraint.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summariseConstraints(constraints: ConstraintFeature[]): LandConstraintsSummary {
  return {
    has_hard_constraint: constraints.some((constraint) => HARD_CONSTRAINT_TYPES.has(constraint.type)),
    constraint_count: constraints.length,
  };
}

export async function getLandConstraints(
  params: z.infer<typeof landConstraintsSchema>,
): Promise<LandConstraintsResult> {
  const { lat, lon } = params;
  const country = params.country.toUpperCase();
  const radiusKm = params.radius_km ?? 2;

  if (lat < -90 || lat > 90) {
    throw new Error("Latitude must be between -90 and 90.");
  }
  if (lon < -180 || lon > 180) {
    throw new Error("Longitude must be between -180 and 180.");
  }
  if (radiusKm <= 0 || radiusKm > 10) {
    throw new Error("radius_km must be between 0 and 10.");
  }

  if (country !== "GB" && !EU_COUNTRY_CODES.has(country)) {
    throw new Error(
      `Country "${params.country}" is not supported. Use "GB" for Great Britain or an EU member-state country code in this version.`,
    );
  }

  const cacheKey = `land-constraints:${lat}:${lon}:${radiusKm}:${country}`;
  const cached = cache.get<LandConstraintsResult>(cacheKey);
  if (cached) return cached;

  if (country === "GB") {
    const queryScotland = isScottishCoord(lat, lon);

    // Always query Natural England (England-wide). If coord is in the Scottish
    // bbox, query NatureScot in parallel. Border-region coords get both; each
    // upstream returns empty for points outside its coverage.
    const englandPromises = GB_PROTECTED_AREA_LAYERS.map((layer) =>
      queryLayer(layer, lat, lon, radiusKm),
    );
    const scotlandPromises = queryScotland
      ? SCOTTISH_PROTECTED_AREA_LAYERS.map((layer) =>
          queryScottishLayer(layer, lat, lon, radiusKm),
        )
      : [];

    const layerResults = await Promise.allSettled([
      ...englandPromises,
      ...scotlandPromises,
    ]);

    const constraints: ConstraintFeature[] = [];
    const englandWarnings: string[] = [];
    const scotlandWarnings: string[] = [];
    let englandOk = 0;
    let scotlandOk = 0;

    for (let i = 0; i < layerResults.length; i++) {
      const result = layerResults[i];
      const isEnglandLayer = i < GB_PROTECTED_AREA_LAYERS.length;
      const layerType = isEnglandLayer
        ? GB_PROTECTED_AREA_LAYERS[i].constraintType
        : SCOTTISH_PROTECTED_AREA_LAYERS[i - GB_PROTECTED_AREA_LAYERS.length]
            .constraintType;

      if (result.status === "fulfilled") {
        constraints.push(...result.value);
        if (isEnglandLayer) englandOk++;
        else scotlandOk++;
      } else {
        const msg =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        const prefix = isEnglandLayer ? "natural-england" : "nature-scot";
        const bucket = isEnglandLayer ? englandWarnings : scotlandWarnings;
        bucket.push(`${prefix} ${layerType}: ${msg}`);
      }
    }

    if (englandOk === 0 && (scotlandPromises.length === 0 || scotlandOk === 0)) {
      const allWarnings = [...englandWarnings, ...scotlandWarnings];
      throw new Error(
        `All protected-area queries failed: ${allWarnings.join("; ")}`,
      );
    }

    const deduped = dedupeConstraints(constraints);
    const warnings = [...englandWarnings, ...scotlandWarnings];
    const additionalSources = queryScotland
      ? [GIS_SOURCES["nature-scot"]]
      : undefined;

    const result: LandConstraintsResult = {
      lat,
      lon,
      radius_km: radiusKm,
      country: "GB",
      constraints: deduped,
      summary: summariseConstraints(deduped),
      source_metadata: GIS_SOURCES["natural-england"],
    };

    if (additionalSources) result.additional_sources = additionalSources;
    if (warnings.length > 0) result.warnings = warnings;

    cache.set(cacheKey, result, TTL.STATIC_DATA);
    return result;
  }

  try {
    const constraints = dedupeConstraints(await queryNatura2000Layer(lat, lon, radiusKm));
    const result: LandConstraintsResult = {
      lat,
      lon,
      radius_km: radiusKm,
      country,
      constraints,
      summary: summariseConstraints(constraints),
      source_metadata: GIS_SOURCES["eea-natura2000"],
    };

    cache.set(cacheKey, result, TTL.STATIC_DATA);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`EEA Natura 2000 query failed: ${message}`);
  }
}
