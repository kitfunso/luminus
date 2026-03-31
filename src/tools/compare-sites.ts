import { z } from "zod";
import { screenSite } from "./screen-site.js";

// --- Schema ---

const siteInputSchema = z.object({
  lat: z.number().describe("Latitude (-90 to 90). WGS84."),
  lon: z.number().describe("Longitude (-180 to 180). WGS84."),
  label: z.string().optional().describe("Optional human-readable label for this site."),
});

export const compareSitesSchema = z.object({
  sites: z
    .array(siteInputSchema)
    .describe("Array of candidate sites to compare (2-10)."),
  country: z
    .string()
    .describe('ISO 3166-1 alpha-2 country code. Only "GB" is supported in this version.'),
  radius_km: z
    .number()
    .optional()
    .describe("Search radius in km for grid and constraints (default 2, max 10)."),
});

// --- Types ---

type Verdict = "pass" | "warn" | "fail";

interface RankedSite {
  rank: number;
  label: string;
  lat: number;
  lon: number;
  verdict: Verdict;
  flag_count: number;
  solar_kwh_m2: number | null;
  slope_deg: number | null;
  nearest_grid_km: number | null;
  constraint_count: number;
  score: number;
  reasoning: string;
  data_gaps: string[];
}

interface FailedSite {
  lat: number;
  lon: number;
  label: string;
  error: string;
}

interface CompareSitesResult {
  site_count: number;
  rankings: RankedSite[];
  failed_sites: FailedSite[];
  heuristics_used: string[];
  disclaimer: string;
}

// --- Scoring heuristics ---

/**
 * Explicit, conservative ranking heuristics.
 *
 * 1. Verdict tier: pass (3) > warn (2) > fail (1). Hard constraints disqualify.
 * 2. Solar resource: higher annual irradiance is better (normalised 0-1 within the set).
 * 3. Grid proximity: closer to nearest substation or HV line is better (normalised 0-1, inverted).
 * 4. Terrain flatness: lower slope is better (normalised 0-1, inverted).
 *
 * Weights are explicit constants. The composite score is a weighted sum.
 */

const VERDICT_SCORES: Record<Verdict, number> = { pass: 3, warn: 2, fail: 1 };

const WEIGHT_VERDICT = 40;
const WEIGHT_SOLAR = 30;
const WEIGHT_GRID = 20;
const WEIGHT_TERRAIN = 10;

const HEURISTICS_USED = [
  `Verdict tier (weight ${WEIGHT_VERDICT}%): pass=3, warn=2, fail=1. Hard constraints and high flood-planning risk (for example Flood Zone 3) produce fail.`,
  `Solar resource (weight ${WEIGHT_SOLAR}%): annual irradiance (kWh/m2), higher is better. Normalised across candidates.`,
  `Grid proximity (weight ${WEIGHT_GRID}%): min(nearest_substation_km, nearest_line_km), closer is better. Normalised across candidates.`,
  `Terrain flatness (weight ${WEIGHT_TERRAIN}%): slope in degrees, flatter is better. Normalised across candidates.`,
  "Missing data for a dimension scores 0 for that dimension (conservative penalty).",
  "Ties broken by input order (stable sort).",
];

const DISCLAIMER =
  "This is an automated comparison using public data. " +
  "Rankings reflect heuristic scoring, not commercial viability. " +
  "Professional due diligence is required before any development decision.";

// --- Helpers ---

/** Normalise a value into 0-1 given min/max of the set. Higher raw = higher normalised. */
function normaliseHigherBetter(value: number | null, min: number, max: number): number {
  if (value === null) return 0;
  if (max === min) return 1;
  return (value - min) / (max - min);
}

/** Normalise a value into 0-1 given min/max of the set. Lower raw = higher normalised. */
function normaliseLowerBetter(value: number | null, min: number, max: number): number {
  if (value === null) return 0;
  if (max === min) return 1;
  return 1 - (value - min) / (max - min);
}

function extractSolar(screen: any): number | null {
  return screen.solar?.annual_irradiance_kwh_m2 ?? null;
}

function extractSlope(screen: any): number | null {
  return screen.terrain?.slope_deg ?? null;
}

function extractNearestGrid(screen: any): number | null {
  const sub = screen.grid?.summary?.nearest_substation_km ?? null;
  const line = screen.grid?.summary?.nearest_line_km ?? null;
  if (sub === null && line === null) return null;
  if (sub === null) return line;
  if (line === null) return sub;
  return Math.min(sub, line);
}

function extractDataGaps(screen: any): string[] {
  const gaps: string[] = [];
  if (screen.terrain === null) gaps.push("terrain");
  if (screen.grid === null) gaps.push("grid");
  if (screen.solar === null) gaps.push("solar");
  if (screen.constraints === null) gaps.push("constraints");
  if (screen.agricultural_land === null) gaps.push("agricultural_land");
  if (screen.flood_risk === null) gaps.push("flood_risk");
  return gaps;
}

function buildReasoning(
  ranked: { verdict: Verdict; flags: Array<{ category: string; reason: string }>; solar_kwh_m2: number | null; nearest_grid_km: number | null; slope_deg: number | null; constraint_count: number; data_gaps: string[] },
): string {
  const parts: string[] = [];

  if (ranked.verdict === "fail") {
    const categories = ranked.flags.map((f) => f.category).join(", ");
    parts.push(`Failed screening due to: ${categories || "unknown reason"}.`);
  } else if (ranked.verdict === "warn") {
    const categories = ranked.flags.map((f) => f.category).join(", ");
    parts.push(`Warnings present: ${categories || "see screen_site flags for details"}.`);
  } else {
    parts.push("No blocking constraints or warnings.");
  }

  if (ranked.solar_kwh_m2 !== null) {
    parts.push(`Solar: ${ranked.solar_kwh_m2} kWh/m2/yr.`);
  }

  if (ranked.nearest_grid_km !== null) {
    parts.push(`Nearest grid: ${ranked.nearest_grid_km.toFixed(1)} km.`);
  }

  if (ranked.slope_deg !== null) {
    parts.push(`Slope: ${ranked.slope_deg.toFixed(1)} deg.`);
  }

  if (ranked.data_gaps.length > 0) {
    parts.push(`Missing data: ${ranked.data_gaps.join(", ")}.`);
  }

  return parts.join(" ");
}

// --- Main tool function ---

export async function compareSites(
  params: z.infer<typeof compareSitesSchema>,
): Promise<CompareSitesResult> {
  const country = params.country.toUpperCase();
  const radiusKm = params.radius_km;

  if (country !== "GB") {
    throw new Error(
      `Country "${params.country}" is not supported. Only "GB" (Great Britain) is available in this version.`,
    );
  }
  if (params.sites.length < 2) {
    throw new Error("At least 2 sites are required for comparison.");
  }
  if (params.sites.length > 10) {
    throw new Error("Compare at most 10 sites per call.");
  }

  // Screen all sites in parallel
  const screenResults = await Promise.allSettled(
    params.sites.map((site) =>
      screenSite({
        lat: site.lat,
        lon: site.lon,
        country: "GB",
        ...(radiusKm !== undefined ? { radius_km: radiusKm } : {}),
      }),
    ),
  );

  // Separate successes from failures
  const screened: { index: number; label: string; result: any }[] = [];
  const failedSites: FailedSite[] = [];

  for (let i = 0; i < screenResults.length; i++) {
    const site = params.sites[i];
    const label = site.label ?? `Site ${i + 1}`;
    const outcome = screenResults[i];

    if (outcome.status === "fulfilled") {
      screened.push({ index: i, label, result: outcome.value });
    } else {
      failedSites.push({
        lat: site.lat,
        lon: site.lon,
        label,
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      });
    }
  }

  if (screened.length === 0) {
    throw new Error("All sites failed screening. Cannot produce a comparison.");
  }

  // Extract raw values for normalisation
  const solarValues = screened.map((s) => extractSolar(s.result));
  const gridValues = screened.map((s) => extractNearestGrid(s.result));
  const slopeValues = screened.map((s) => extractSlope(s.result));

  const validSolars = solarValues.filter((v): v is number => v !== null);
  const validGrids = gridValues.filter((v): v is number => v !== null);
  const validSlopes = slopeValues.filter((v): v is number => v !== null);

  const solarMin = validSolars.length > 0 ? Math.min(...validSolars) : 0;
  const solarMax = validSolars.length > 0 ? Math.max(...validSolars) : 0;
  const gridMin = validGrids.length > 0 ? Math.min(...validGrids) : 0;
  const gridMax = validGrids.length > 0 ? Math.max(...validGrids) : 0;
  const slopeMin = validSlopes.length > 0 ? Math.min(...validSlopes) : 0;
  const slopeMax = validSlopes.length > 0 ? Math.max(...validSlopes) : 0;

  // Score each site
  const scored = screened.map((s, idx) => {
    const verdict: Verdict = s.result.verdict.overall;
    const solar = solarValues[idx];
    const grid = gridValues[idx];
    const slope = slopeValues[idx];
    const constraintCount = s.result.constraints?.summary?.constraint_count ?? 0;
    const dataGaps = extractDataGaps(s.result);

    const verdictNorm = VERDICT_SCORES[verdict] / 3; // 0.33 - 1.0
    const solarNorm = normaliseHigherBetter(solar, solarMin, solarMax);
    const gridNorm = normaliseLowerBetter(grid, gridMin, gridMax);
    const slopeNorm = normaliseLowerBetter(slope, slopeMin, slopeMax);

    const score =
      WEIGHT_VERDICT * verdictNorm +
      WEIGHT_SOLAR * solarNorm +
      WEIGHT_GRID * gridNorm +
      WEIGHT_TERRAIN * slopeNorm;

    return {
      index: s.index,
      label: s.label,
      lat: s.result.lat,
      lon: s.result.lon,
      verdict,
      flag_count: s.result.verdict.flags?.length ?? 0,
      flags: s.result.verdict.flags ?? [],
      solar_kwh_m2: solar,
      slope_deg: slope,
      nearest_grid_km: grid,
      constraint_count: constraintCount,
      score: Math.round(score * 100) / 100,
      data_gaps: dataGaps,
    };
  });

  // Sort descending by score, stable (input order breaks ties)
  scored.sort((a, b) => b.score - a.score);

  // Build ranked output with reasoning
  const rankings: RankedSite[] = scored.map((s, idx) => ({
    rank: idx + 1,
    label: s.label,
    lat: s.lat,
    lon: s.lon,
    verdict: s.verdict,
    flag_count: s.flag_count,
    solar_kwh_m2: s.solar_kwh_m2,
    slope_deg: s.slope_deg,
    nearest_grid_km: s.nearest_grid_km,
    constraint_count: s.constraint_count,
    score: s.score,
    reasoning: buildReasoning(s),
    data_gaps: s.data_gaps,
  }));

  return {
    site_count: params.sites.length,
    rankings,
    failed_sites: failedSites,
    heuristics_used: HEURISTICS_USED,
    disclaimer: DISCLAIMER,
  };
}
