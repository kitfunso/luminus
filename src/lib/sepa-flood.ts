/**
 * SEPA Flood Risk Management Maps client. Licence: OGL v3. Contains SEPA data (c) 2025.
 *
 * Queries the Scottish Environment Protection Agency (SEPA) ArcGIS REST services
 * for flood extent layers covering river, coastal, and surface water sources at
 * three likelihoods (high, medium, low). Used as the Scotland-coverage counterpart
 * to the Environment Agency Flood Map for Planning used in England.
 *
 * Likelihood to return-period mapping:
 *   high   = 1-in-10-year return period
 *   medium = 1-in-200-year return period (approximates EA Flood Zone 3)
 *   low    = 1-in-1000-year return period (approximates EA Flood Zone 2)
 *
 * SEPA publishes each source/likelihood as its own FeatureServer with multiple
 * layers (extent, depth, velocity). We only query the extent layer in v0.6.0.
 * The extent layer id is not uniformly 0 across services, so the id is discovered
 * at runtime via `/layers?f=json` and cached. SEPA's native SR is 27700, but the
 * services accept `inSR=4326` and reproject server-side.
 */

import { TtlCache, TTL } from "./cache.js";

export const SEPA_ARCGIS_BASE =
  "https://map.sepa.org.uk/server/rest/services/Open";

export type SepaFloodSource = "river" | "coastal" | "surface_water";
export type SepaFloodLikelihood = "high" | "medium" | "low";

export interface SepaFloodMatch {
  source: SepaFloodSource;
  likelihood: SepaFloodLikelihood;
  slug: string;
}

interface SepaFloodServiceConfig {
  slug: string;
  source: SepaFloodSource;
  likelihood: SepaFloodLikelihood;
}

export const SEPA_FLOOD_SERVICE_SLUGS = {
  River_Flooding_High_Likelihood: "River_Flooding_High_Likelihood",
  River_Flooding_Medium_Likelihood: "River_Flooding_Medium_Likelihood",
  River_Flooding_Low_Likelihood: "River_Flooding_Low_Likelihood",
  Coastal_Flooding_High_Likelihood: "Coastal_Flooding_High_Likelihood",
  Coastal_Flooding_Medium_Likelihood: "Coastal_Flooding_Medium_Likelihood",
  Coastal_Flooding_Low_Likelihood: "Coastal_Flooding_Low_Likelihood",
  Surface_Water_and_Small_Watercourses_Flooding_High_Likelihood:
    "Surface_Water_and_Small_Watercourses_Flooding_High_Likelihood",
  Surface_Water_and_Small_Watercourses_Flooding_Medium_Likelihood:
    "Surface_Water_and_Small_Watercourses_Flooding_Medium_Likelihood",
  Surface_Water_and_Small_Watercourses_Flooding_Low_Likelihood:
    "Surface_Water_and_Small_Watercourses_Flooding_Low_Likelihood",
} as const;

export const SEPA_FLOOD_SERVICES: ReadonlyArray<SepaFloodServiceConfig> = [
  {
    slug: SEPA_FLOOD_SERVICE_SLUGS.River_Flooding_High_Likelihood,
    source: "river",
    likelihood: "high",
  },
  {
    slug: SEPA_FLOOD_SERVICE_SLUGS.River_Flooding_Medium_Likelihood,
    source: "river",
    likelihood: "medium",
  },
  {
    slug: SEPA_FLOOD_SERVICE_SLUGS.River_Flooding_Low_Likelihood,
    source: "river",
    likelihood: "low",
  },
  {
    slug: SEPA_FLOOD_SERVICE_SLUGS.Coastal_Flooding_High_Likelihood,
    source: "coastal",
    likelihood: "high",
  },
  {
    slug: SEPA_FLOOD_SERVICE_SLUGS.Coastal_Flooding_Medium_Likelihood,
    source: "coastal",
    likelihood: "medium",
  },
  {
    slug: SEPA_FLOOD_SERVICE_SLUGS.Coastal_Flooding_Low_Likelihood,
    source: "coastal",
    likelihood: "low",
  },
  {
    slug: SEPA_FLOOD_SERVICE_SLUGS.Surface_Water_and_Small_Watercourses_Flooding_High_Likelihood,
    source: "surface_water",
    likelihood: "high",
  },
  {
    slug: SEPA_FLOOD_SERVICE_SLUGS.Surface_Water_and_Small_Watercourses_Flooding_Medium_Likelihood,
    source: "surface_water",
    likelihood: "medium",
  },
  {
    slug: SEPA_FLOOD_SERVICE_SLUGS.Surface_Water_and_Small_Watercourses_Flooding_Low_Likelihood,
    source: "surface_water",
    likelihood: "low",
  },
] as const;

const LAYER_DISCOVERY_TIMEOUT_MS = 10_000;
const POINT_QUERY_TIMEOUT_MS = 15_000;

const layerIdCache = new TtlCache();

interface ArcGisLayerDescriptor {
  id: number;
  name?: string;
  type?: string;
  geometryType?: string;
}

interface ArcGisLayersResponse {
  layers?: ArcGisLayerDescriptor[];
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function isPolygonLayer(layer: ArcGisLayerDescriptor): boolean {
  const geom = layer.geometryType;
  if (typeof geom !== "string") return false;
  return geom === "esriGeometryPolygon";
}

function pickExtentLayerId(layers: ArcGisLayerDescriptor[]): number | null {
  const extentMatch = layers.find(
    (layer) =>
      typeof layer.name === "string" && /extent/i.test(layer.name),
  );
  if (extentMatch) return extentMatch.id;

  const polygonFallback = layers.find(isPolygonLayer);
  if (polygonFallback) return polygonFallback.id;

  return null;
}

/**
 * Resolve the id of the "extent" polygon layer for a SEPA flood service.
 *
 * SEPA's flood services publish multiple layers per FeatureServer (extent,
 * depth, velocity). The id of the extent layer is not consistent across
 * services, so we discover it from `/layers?f=json`. Preference order:
 *   1. First layer whose name contains "extent" (case-insensitive)
 *   2. First layer with polygon geometry (defensive fallback)
 *
 * Results are cached per-slug with STATIC_DATA TTL because SEPA service
 * definitions are stable.
 */
export async function resolveExtentLayerId(slug: string): Promise<number> {
  const cacheKey = `sepa-flood-layer:${slug}`;
  const cached = layerIdCache.get<number>(cacheKey);
  if (cached !== undefined) return cached;

  const url = `${SEPA_ARCGIS_BASE}/${slug}/FeatureServer/layers?f=json`;
  let response: Response;
  try {
    response = await fetchWithTimeout(url, LAYER_DISCOVERY_TIMEOUT_MS);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`SEPA flood query failed: layer discovery for ${slug}: ${message}`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `SEPA flood query failed: layer discovery for ${slug} returned ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  const json = (await response.json()) as ArcGisLayersResponse;
  const layers = Array.isArray(json.layers) ? json.layers : null;
  if (!layers || layers.length === 0) {
    throw new Error(
      `SEPA flood query failed: layer discovery for ${slug} returned no layers. Upstream schema may have changed.`,
    );
  }

  const layerId = pickExtentLayerId(layers);
  if (layerId === null) {
    throw new Error(
      `SEPA flood query failed: no extent or polygon layer found for ${slug}.`,
    );
  }

  layerIdCache.set(cacheKey, layerId, TTL.STATIC_DATA);
  return layerId;
}

function buildPointQueryUrl(slug: string, layerId: number, lon: number, lat: number): string {
  const url = new URL(`${SEPA_ARCGIS_BASE}/${slug}/FeatureServer/${layerId}/query`);
  const p = url.searchParams;
  p.set("where", "1=1");
  p.set("geometry", `${lon},${lat}`);
  p.set("geometryType", "esriGeometryPoint");
  p.set("inSR", "4326");
  p.set("spatialRel", "esriSpatialRelIntersects");
  p.set("returnCountOnly", "true");
  p.set("f", "json");
  return url.toString();
}

interface ArcGisCountResponse {
  count?: number;
  error?: { message?: string };
}

/**
 * Query a single SEPA flood service for whether a point intersects the
 * extent polygon. Returns true when the server-side count is greater than
 * zero. Throws `SEPA flood query failed: ...` on network or HTTP errors.
 */
export async function queryFloodAtPoint(
  slug: string,
  lat: number,
  lon: number,
): Promise<boolean> {
  const layerId = await resolveExtentLayerId(slug);
  const url = buildPointQueryUrl(slug, layerId, lon, lat);

  let response: Response;
  try {
    response = await fetchWithTimeout(url, POINT_QUERY_TIMEOUT_MS);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`SEPA flood query failed: point query for ${slug}: ${message}`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `SEPA flood query failed: point query for ${slug} returned ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  const json = (await response.json()) as ArcGisCountResponse;
  if (json.error) {
    throw new Error(
      `SEPA flood query failed: ${slug}: ${json.error.message ?? "unknown ArcGIS error"}`,
    );
  }

  const count = typeof json.count === "number" ? json.count : 0;
  return count > 0;
}

/**
 * Query all nine SEPA flood services in parallel for a single point.
 * Degrades gracefully: returns matching services in `matches` and any
 * per-service errors in `errors` instead of throwing.
 */
export async function querySepaFloodAtPoint(
  lat: number,
  lon: number,
): Promise<{ matches: SepaFloodMatch[]; errors: string[] }> {
  const results = await Promise.allSettled(
    SEPA_FLOOD_SERVICES.map(async (service) => {
      const hit = await queryFloodAtPoint(service.slug, lat, lon);
      return { service, hit };
    }),
  );

  const matches: SepaFloodMatch[] = [];
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      if (result.value.hit) {
        const { service } = result.value;
        matches.push({
          source: service.source,
          likelihood: service.likelihood,
          slug: service.slug,
        });
      }
    } else {
      const reason =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`${SEPA_FLOOD_SERVICES[i].slug}: ${reason}`);
    }
  }

  return { matches, errors };
}

/**
 * Test-only helper to reset the layer-id cache between tests.
 */
export function _resetSepaFloodCache(): void {
  layerIdCache.clear();
}
