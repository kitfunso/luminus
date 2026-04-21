/**
 * James Hutton Institute Land Capability for Agriculture (LCA) client.
 *
 * Scottish equivalent of England's Agricultural Land Classification (ALC).
 * Queries the James Hutton Institute's druid ArcGIS MapServer for two LCA
 * layers:
 *   - 50k (detailed): higher resolution but partial Scotland coverage
 *   - 250k (broad): full Scotland coverage at coarser resolution
 *
 * The 50k layer is preferred when a feature is returned; otherwise we fall
 * back to 250k. This mirrors the post_1988 / provisional fallback pattern
 * used for England's ALC in src/tools/agricultural-land.ts.
 *
 * Licence: OGL v3 (verify via data.gov.uk record before ship).
 * Contains James Hutton Institute data.
 */

import { TtlCache, TTL } from "./cache.js";
import { guardArcGisFields } from "./schema-guard.js";

const LCA_50K_URL =
  "https://druid.hutton.ac.uk/arcgis/rest/services/Hutton_LCA_50K_OSGB/MapServer/0";
const LCA_250K_URL =
  "https://druid.hutton.ac.uk/arcgis/rest/services/Hutton_LCA250K_UKSO/MapServer/0";

const LCA_TIMEOUT_MS = 20_000;

const cache = new TtlCache();

export type LcaSource = "50k" | "250k";

export interface LcaClassification {
  source: LcaSource;
  lccode_raw: string;
  class_label: string;
  is_agricultural: boolean;
  area_m2: number | null;
}

export interface LcaResult {
  detailed: LcaClassification | null;
  broad: LcaClassification | null;
  effective_class: string | null;
  effective_source: LcaSource | null;
  bmv_status: "yes" | "no" | "unknown";
  classification_basis: "detailed" | "broad" | "none";
}

/**
 * Canonical LCA class labels. Source data encodes sub-classes (3.1, 3.2 etc.)
 * as integers without a decimal (31, 32). Non-agricultural codes share the
 * LCCODE column: 888 = Built-up area (verified live at Edinburgh 55.9533,
 * -3.1883), 990 = Water (observed in the 250k layer).
 *
 * Handling rules:
 *   - numeric 1..7 -> "1".."7" (agricultural, whole-number classes)
 *   - numeric 31/32/41/42/51/52/53/61/62/63 -> "3.1".."6.3" (sub-classes)
 *   - numeric 888 -> "Built-up area" (non-agricultural)
 *   - numeric 990 -> "Water" (non-agricultural)
 *   - string inputs are parsed to numbers first; if already a decimal label
 *     like "3.1", pass it through unchanged.
 */
const SUB_CLASS_MAP: Record<number, string> = {
  31: "3.1",
  32: "3.2",
  41: "4.1",
  42: "4.2",
  51: "5.1",
  52: "5.2",
  53: "5.3",
  61: "6.1",
  62: "6.2",
  63: "6.3",
};

const NON_AGRICULTURAL_MAP: Record<number, string> = {
  888: "Built-up area",
  990: "Water",
};

const BMV_YES_LABELS = new Set(["1", "2", "3.1"]);

export function lccodeToLabel(
  lccode: string | number,
): { class_label: string; is_agricultural: boolean } {
  // If already a decimal label like "3.1", pass through unchanged.
  if (typeof lccode === "string" && /^[1-7](\.[1-3])?$/.test(lccode.trim())) {
    return { class_label: lccode.trim(), is_agricultural: true };
  }

  const numeric =
    typeof lccode === "number" ? lccode : Number(String(lccode).trim());

  if (!Number.isFinite(numeric)) {
    return { class_label: String(lccode), is_agricultural: false };
  }

  if (numeric in NON_AGRICULTURAL_MAP) {
    return {
      class_label: NON_AGRICULTURAL_MAP[numeric],
      is_agricultural: false,
    };
  }

  if (numeric in SUB_CLASS_MAP) {
    return { class_label: SUB_CLASS_MAP[numeric], is_agricultural: true };
  }

  if (numeric >= 1 && numeric <= 7 && Number.isInteger(numeric)) {
    return { class_label: String(numeric), is_agricultural: true };
  }

  // Unknown code: preserve raw value but flag as non-agricultural so callers
  // treat BMV as unknown rather than asserting a class.
  return { class_label: String(lccode), is_agricultural: false };
}

function classifyBmv(
  classification: LcaClassification | null,
): "yes" | "no" | "unknown" {
  if (!classification) return "unknown";
  if (!classification.is_agricultural) return "unknown";
  if (BMV_YES_LABELS.has(classification.class_label)) return "yes";
  return "no";
}

interface ArcGisFeature {
  attributes?: Record<string, unknown>;
}

function buildQueryUrl(baseUrl: string, lon: number, lat: number): string {
  const url = new URL(`${baseUrl}/query`);
  const p = url.searchParams;
  p.set("where", "1=1");
  p.set("geometry", `${lon},${lat}`);
  p.set("geometryType", "esriGeometryPoint");
  p.set("inSR", "4326");
  p.set("spatialRel", "esriSpatialRelIntersects");
  p.set("outFields", "LCCODE,AreaM2");
  p.set("returnGeometry", "false");
  p.set("f", "json");
  return url.toString();
}

async function queryLcaLayer(
  baseUrl: string,
  source: LcaSource,
  lon: number,
  lat: number,
): Promise<LcaClassification | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LCA_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(buildQueryUrl(baseUrl, lon, lat), {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `James Hutton LCA API returned ${response.status} for ${source}: ${body.slice(0, 300)}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();
  if (json.error) {
    throw new Error(
      `James Hutton LCA API error for ${source}: ${json.error.message ?? JSON.stringify(json.error)}`,
    );
  }

  const features: ArcGisFeature[] = Array.isArray(json.features)
    ? json.features
    : [];

  guardArcGisFields(
    features as Array<{ attributes: Record<string, unknown> }>,
    ["LCCODE", "AreaM2"],
    `James Hutton LCA (${source})`,
  );

  const feature = features[0];
  if (!feature) return null;

  const attrs = feature.attributes ?? {};
  const lccodeRaw = attrs.LCCODE;
  if (lccodeRaw === null || lccodeRaw === undefined) return null;

  const lccodeString = String(lccodeRaw);
  const { class_label, is_agricultural } = lccodeToLabel(
    lccodeRaw as string | number,
  );

  const areaRaw = attrs.AreaM2;
  const area_m2 =
    typeof areaRaw === "number" ? Math.round(areaRaw * 100) / 100 : null;

  return {
    source,
    lccode_raw: lccodeString,
    class_label,
    is_agricultural,
    area_m2,
  };
}

/**
 * Query both LCA layers at a WGS84 point. Returns detailed (50k) and broad
 * (250k) classifications where available, along with a computed effective
 * class and BMV status. The 50k layer takes precedence when populated.
 *
 * Throws only when both services fail. Partial failures populate the
 * successful slot and leave the failed slot null.
 */
export async function queryLcaAtPoint(
  lat: number,
  lon: number,
): Promise<LcaResult> {
  const cacheKey = `james-hutton-lca:${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = cache.get<LcaResult>(cacheKey);
  if (cached) return cached;

  const [detailedResult, broadResult] = await Promise.allSettled([
    queryLcaLayer(LCA_50K_URL, "50k", lon, lat),
    queryLcaLayer(LCA_250K_URL, "250k", lon, lat),
  ]);

  const detailed =
    detailedResult.status === "fulfilled" ? detailedResult.value : null;
  const broad = broadResult.status === "fulfilled" ? broadResult.value : null;

  if (
    detailedResult.status === "rejected" &&
    broadResult.status === "rejected"
  ) {
    const detailedMsg =
      detailedResult.reason instanceof Error
        ? detailedResult.reason.message
        : String(detailedResult.reason);
    const broadMsg =
      broadResult.reason instanceof Error
        ? broadResult.reason.message
        : String(broadResult.reason);
    throw new Error(
      `All James Hutton LCA queries failed: 50k: ${detailedMsg}; 250k: ${broadMsg}`,
    );
  }

  let classification_basis: LcaResult["classification_basis"] = "none";
  let effective_class: string | null = null;
  let effective_source: LcaSource | null = null;
  let chosen: LcaClassification | null = null;

  if (detailed) {
    classification_basis = "detailed";
    effective_class = detailed.class_label;
    effective_source = "50k";
    chosen = detailed;
  } else if (broad) {
    classification_basis = "broad";
    effective_class = broad.class_label;
    effective_source = "250k";
    chosen = broad;
  }

  const result: LcaResult = {
    detailed,
    broad,
    effective_class,
    effective_source,
    bmv_status: classifyBmv(chosen),
    classification_basis,
  };

  cache.set(cacheKey, result, TTL.STATIC_DATA);
  return result;
}
