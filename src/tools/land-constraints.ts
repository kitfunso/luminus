import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import {
  GB_PROTECTED_AREA_LAYERS,
  queryLayer,
  type ConstraintFeature,
} from "../lib/natural-england.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";

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
    .describe('ISO 3166-1 alpha-2 country code. Only "GB" is supported in this version.'),
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
  warnings?: string[];
}

/** Designation types that represent hard planning exclusions for PV/BESS siting. */
const HARD_CONSTRAINT_TYPES = new Set([
  "sssi",
  "sac",
  "spa",
  "ramsar",
  "national_park",
]);

export async function getLandConstraints(
  params: z.infer<typeof landConstraintsSchema>,
): Promise<LandConstraintsResult> {
  const { lat, lon } = params;
  const country = params.country.toUpperCase();
  const radiusKm = params.radius_km ?? 2;

  if (country !== "GB") {
    throw new Error(
      `Country "${params.country}" is not supported. Only "GB" (Great Britain) is available in this version. EU coverage is planned for a future sprint.`,
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

  const cacheKey = `land-constraints:${lat}:${lon}:${radiusKm}`;
  const cached = cache.get<LandConstraintsResult>(cacheKey);
  if (cached) return cached;

  // Query all protected area layers in parallel. Use allSettled so
  // partial failures (one layer down) still return whatever succeeded.
  const layerResults = await Promise.allSettled(
    GB_PROTECTED_AREA_LAYERS.map((layer) =>
      queryLayer(layer, lat, lon, radiusKm),
    ),
  );

  const constraints: ConstraintFeature[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < layerResults.length; i++) {
    const result = layerResults[i];
    if (result.status === "fulfilled") {
      constraints.push(...result.value);
    } else {
      const layerType = GB_PROTECTED_AREA_LAYERS[i].constraintType;
      const msg =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      warnings.push(`${layerType}: ${msg}`);
    }
  }

  if (warnings.length === GB_PROTECTED_AREA_LAYERS.length) {
    throw new Error(
      `All Natural England API queries failed: ${warnings.join("; ")}`,
    );
  }

  // Deduplicate: ArcGIS often returns multiple sub-polygon features for the
  // same designation. Keep one entry per unique name+type pair.
  const seen = new Set<string>();
  const deduped = constraints.filter((c) => {
    const key = `${c.type}:${c.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const hasHard = deduped.some((c) =>
    HARD_CONSTRAINT_TYPES.has(c.type),
  );

  const result: LandConstraintsResult = {
    lat,
    lon,
    radius_km: radiusKm,
    country: "GB",
    constraints: deduped,
    summary: {
      has_hard_constraint: hasHard,
      constraint_count: deduped.length,
    },
    source_metadata: GIS_SOURCES["natural-england"],
  };

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  cache.set(cacheKey, result, TTL.STATIC_DATA);
  return result;
}
