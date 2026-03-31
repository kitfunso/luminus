import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { queryCorineAtPoint, CORINE_COVERED_COUNTRIES, type CorineResult } from "../lib/corine.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";

const cache = new TtlCache();

export const landCoverSchema = z.object({
  lat: z.number().describe("Latitude (-90 to 90). WGS84."),
  lon: z.number().describe("Longitude (-180 to 180). WGS84."),
  country: z
    .string()
    .describe(
      "ISO 3166-1 alpha-2 country code. Required to select the correct data source. " +
      "CORINE 2018 covers EU27 + EEA/EFTA countries. Great Britain (GB) is not covered " +
      "(UK withdrew from CORINE after 2012); use get_agricultural_land for GB land-use context instead.",
    ),
});

interface LandCoverResult {
  lat: number;
  lon: number;
  country: string;
  land_cover: CorineResult | null;
  coverage_note: string | null;
  source_metadata: GisSourceMetadata;
}

export async function getLandCover(
  params: z.infer<typeof landCoverSchema>,
): Promise<LandCoverResult> {
  const { lat, lon } = params;
  const country = params.country.toUpperCase();

  if (lat < -90 || lat > 90) {
    throw new Error("Latitude must be between -90 and 90.");
  }
  if (lon < -180 || lon > 180) {
    throw new Error("Longitude must be between -180 and 180.");
  }

  if (country === "GB") {
    return {
      lat,
      lon,
      country: "GB",
      land_cover: null,
      coverage_note:
        "Great Britain is not covered by CORINE Land Cover 2018. The UK withdrew from the " +
        "programme after CLC 2012. Use get_agricultural_land for agricultural land classification " +
        "in England, or get_land_constraints for protected-area context.",
      source_metadata: GIS_SOURCES["corine-land-cover"],
    };
  }

  if (!CORINE_COVERED_COUNTRIES.has(country)) {
    throw new Error(
      `Country "${params.country}" is not supported by CORINE Land Cover 2018. ` +
      "Supported: EU27 member states plus EEA/EFTA countries (IS, LI, NO, TR, AL, BA, ME, MK, RS, XK).",
    );
  }

  const cacheKey = `land-cover:${lat}:${lon}:${country}`;
  const cached = cache.get<LandCoverResult>(cacheKey);
  if (cached) return cached;

  try {
    const landCover = await queryCorineAtPoint(lat, lon);
    const result: LandCoverResult = {
      lat,
      lon,
      country,
      land_cover: landCover,
      coverage_note:
        landCover === null
          ? "No CORINE polygon found at this point. The location may be offshore, at a coverage boundary, " +
            "or below the 25 ha minimum mapping unit."
          : null,
      source_metadata: GIS_SOURCES["corine-land-cover"],
    };
    cache.set(cacheKey, result, TTL.STATIC_DATA);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`CORINE Land Cover query failed: ${message}`);
  }
}
