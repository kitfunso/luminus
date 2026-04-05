import { z } from "zod";
import { getDistributionHeadroom } from "./distribution-headroom.js";
import { lookupGspRegion, type GspLookupResult } from "../lib/neso-gsp.js";
import { getGridConnectionQueue } from "./grid-connection-queue.js";
import { getGridProximity } from "./grid-proximity.js";
import { getNgedConnectionSignal } from "./nged-connection-signal.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";

export const gridConnectionIntelligenceSchema = z.object({
  lat: z.number().describe("Latitude (-90 to 90). WGS84."),
  lon: z.number().describe("Longitude (-180 to 180). WGS84."),
  radius_km: z
    .number()
    .optional()
    .describe("GSP search radius in km (default 25, max 50)."),
  country: z.string().describe('Only "GB" is supported.'),
});

interface NearestGspResult {
  gsp_id: string;
  gsp_name: string;
  distance_km: number;
  region_id: string;
  region_name: string;
}

interface ConnectionQueueResult {
  projects: Array<Record<string, unknown>>;
  total_mw_queued: number;
  search_term: string;
}

interface NearbySubstation {
  name: string | null;
  voltage_kv: number | null;
  distance_km: number;
}

interface DistributionHeadroomSummary {
  operator: string;
  substation: string;
  substation_type: string | null;
  distance_km: number;
  estimated_generation_headroom_mw: number | null;
  estimated_demand_headroom_mva: number | null;
  generation_rag_status: string | null;
  demand_rag_status: string | null;
  generation_constraint: string | null;
  demand_constraint: string | null;
  upstream_reinforcement_works: string | null;
  upstream_reinforcement_completion_date: string | null;
}

interface NgedQueueSignalSummary {
  resource_name: string;
  summary: Record<string, unknown>;
  projects: Array<Record<string, unknown>>;
}

interface NgedTdLimitSummary {
  resource_name: string;
  summary: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
}

interface NgedConnectionSignalSummary {
  queue_signal: NgedQueueSignalSummary | null;
  td_limits: NgedTdLimitSummary | null;
}

interface GridConnectionIntelligenceResult {
  lat: number;
  lon: number;
  country: string;
  nearest_gsp: NearestGspResult | null;
  connection_queue: ConnectionQueueResult | null;
  nearby_substations: NearbySubstation[];
  distribution_headroom: DistributionHeadroomSummary | null;
  nged_connection_signal: NgedConnectionSignalSummary | null;
  confidence_notes: string[];
  source_metadata: {
    gsp_lookup: GisSourceMetadata;
    tec_register: GisSourceMetadata;
    grid_proximity: GisSourceMetadata;
    distribution_headroom: GisSourceMetadata;
    nged_queue_signal: GisSourceMetadata;
    nged_td_limits: GisSourceMetadata;
  };
  disclaimer: string;
}

const DISCLAIMER =
  "This combines NESO GSP region polygons, nearest-point fallback, the NESO TEC register, distribution headroom from SSEN/NPG/UKPN/ENWL where public data resolves, NGED public queue and TD-limit data where the matched GSP is covered, and OSM substation data. " +
  "It is not a connection offer, capacity guarantee, or GB-wide DNO headroom assessment. " +
  "Always verify with the relevant network operator before making connection decisions.";

function buildConfidenceNotes(gspResult: GspLookupResult | null): string[] {
  const notes: string[] = [
    "GSP lookup uses NESO region polygons when available, with nearest-point fallback if boundaries do not resolve a match",
    "TEC register connection sites are matched by GSP name substring, not spatial coordinates",
    "Connection queue data shows contracted positions, not guaranteed available capacity",
    "Distribution headroom queries SSEN, NPG, UKPN, SPEN, and ENWL public data; coverage depends on the site's DNO area",
    "NGED public queue and TD-limit context only appears where the matched GSP is covered by NGED's published resources",
  ];

  if (!gspResult) {
    notes.push("No GSP found within search radius");
  }

  return notes;
}

function deriveSearchTerm(regionName: string): string {
  // Region names are already human-readable (e.g. "Berkswell", "Bramley")
  return regionName.trim();
}

export async function getGridConnectionIntelligence(
  params: z.infer<typeof gridConnectionIntelligenceSchema>,
): Promise<GridConnectionIntelligenceResult> {
  const { lat, lon, country } = params;
  const radiusKm = params.radius_km ?? 25;

  if (country.toUpperCase() !== "GB") {
    throw new Error('Only country "GB" is supported for grid connection intelligence.');
  }

  if (lat < -90 || lat > 90) throw new Error("Latitude must be between -90 and 90.");
  if (lon < -180 || lon > 180) throw new Error("Longitude must be between -180 and 180.");
  if (radiusKm <= 0 || radiusKm > 50) throw new Error("radius_km must be between 0 and 50.");

  // Step 1: Find nearest GSP
  const gspResult = await lookupGspRegion(lat, lon, radiusKm);

  // Step 2: In parallel, query TEC register (if GSP found) and nearby substations
  // Use region_name (e.g. "Berkswell") not gsp_name (e.g. "BESW_1") — TEC register
  // Connection Site values are human-readable names like "Berkswell GSP"
  const tecPromise = gspResult
    ? queryTecRegister(gspResult.region_name)
    : Promise.resolve(null);

  const proximityPromise = queryGridProximity(lat, lon, radiusKm);
  const distributionHeadroomPromise = queryDistributionHeadroom(lat, lon, radiusKm);
  const ngedSignalPromise = gspResult
    ? queryNgedConnectionSignal(lat, lon, radiusKm)
    : Promise.resolve(null);

  const [connectionQueue, nearbySubstations, distributionHeadroom, ngedConnectionSignal] = await Promise.all([
    tecPromise,
    proximityPromise,
    distributionHeadroomPromise,
    ngedSignalPromise,
  ]);

  return {
    lat,
    lon,
    country: "GB",
    nearest_gsp: gspResult
      ? {
          gsp_id: gspResult.gsp_id,
          gsp_name: gspResult.gsp_name,
          distance_km: gspResult.distance_km,
          region_id: gspResult.region_id,
          region_name: gspResult.region_name,
        }
      : null,
    connection_queue: connectionQueue,
    nearby_substations: nearbySubstations,
    distribution_headroom: distributionHeadroom,
    nged_connection_signal: ngedConnectionSignal,
    confidence_notes: buildConfidenceNotes(gspResult),
    source_metadata: {
      gsp_lookup: GIS_SOURCES["neso-gsp-lookup"],
      tec_register: GIS_SOURCES["neso-tec-register"],
      grid_proximity: GIS_SOURCES["overpass-osm"],
      distribution_headroom: GIS_SOURCES["ssen-distribution-headroom"],
      nged_queue_signal: GIS_SOURCES["nged-connection-queue"],
      nged_td_limits: GIS_SOURCES["nged-asset-limits"],
    },
    disclaimer: DISCLAIMER,
  };
}

async function queryTecRegister(
  regionName: string,
): Promise<ConnectionQueueResult | null> {
  const searchTerm = deriveSearchTerm(regionName);
  if (searchTerm.length === 0) return null;

  try {
    const result = await getGridConnectionQueue({
      connection_site_query: searchTerm,
      limit: 50,
    });

    const totalMwQueued = result.summary.total_net_change_mw;

    return {
      projects: result.projects as unknown as Array<Record<string, unknown>>,
      total_mw_queued: totalMwQueued,
      search_term: searchTerm,
    };
  } catch {
    // TEC register failure should not block the overall result
    return null;
  }
}

async function queryGridProximity(
  lat: number,
  lon: number,
  radiusKm: number,
): Promise<NearbySubstation[]> {
  try {
    // grid-proximity has a max radius of 25km
    const clampedRadius = Math.min(radiusKm, 25);
    const result = await getGridProximity({
      lat,
      lon,
      radius_km: clampedRadius,
    });

    return result.substations.map((sub) => ({
      name: sub.name,
      voltage_kv: sub.voltage_kv,
      distance_km: sub.distance_km,
    }));
  } catch {
    // Proximity failure should not block the overall result
    return [];
  }
}

async function queryDistributionHeadroom(
  lat: number,
  lon: number,
  radiusKm: number,
): Promise<DistributionHeadroomSummary | null> {
  // Query all spatial operators in parallel and return the closest match.
  // SPEN is excluded because it has no coordinates.
  const operators = ["SSEN", "NPG", "UKPN", "ENWL"] as const;

  const results = await Promise.all(
    operators.map(async (operator) => {
      try {
        const result = await getDistributionHeadroom({
          lat,
          lon,
          operator,
          radius_km: radiusKm,
        });
        return result.nearest_site ? { operator: result.operator, site: result.nearest_site } : null;
      } catch {
        return null;
      }
    }),
  );

  // Pick the closest match across all operators
  let best: { operator: string; site: NonNullable<typeof results[number]>["site"] } | null = null;
  for (const result of results) {
    if (!result) continue;
    if (!best || result.site.distance_km < best.site.distance_km) {
      best = result;
    }
  }

  if (!best) return null;

  const site = best.site;
  return {
    operator: best.operator,
    substation: site.substation,
    substation_type: site.substation_type,
    distance_km: site.distance_km,
    estimated_generation_headroom_mw: site.estimated_generation_headroom_mw,
    estimated_demand_headroom_mva: site.estimated_demand_headroom_mva,
    generation_rag_status: site.generation_rag_status,
    demand_rag_status: site.demand_rag_status,
    generation_constraint: site.generation_constraint,
    demand_constraint: site.demand_constraint,
    upstream_reinforcement_works: site.upstream_reinforcement_works,
    upstream_reinforcement_completion_date: site.upstream_reinforcement_completion_date,
  };
}

async function queryNgedConnectionSignal(
  lat: number,
  lon: number,
  radiusKm: number,
): Promise<NgedConnectionSignalSummary | null> {
  try {
    const result = await getNgedConnectionSignal({
      lat,
      lon,
      radius_km: radiusKm,
      country: "GB",
    });

    return {
      queue_signal: result.queue_signal as NgedQueueSignalSummary | null,
      td_limits: result.td_limits as NgedTdLimitSummary | null,
    };
  } catch {
    return null;
  }
}
