import { z } from "zod";
import { getGridConnectionIntelligence } from "./grid-connection-intelligence.js";
import { getLandConstraints } from "./land-constraints.js";
import { getFloodRisk } from "./flood-risk.js";
import { getAgriculturalLand } from "./agricultural-land.js";
import { GIS_SOURCES, type GisSourceMetadata } from "../lib/gis-sources.js";
import {
  normaliseTecRow,
  normaliseNgedQueueRow,
  normaliseDnoHeadroomRow,
  type TecRowInput,
  type NgedQueueRowInput,
  type DnoHeadroomRowInput,
  type DnoOperatorInput,
} from "../lib/gb-connections/normalise.js";
import type { CanonicalConnectionEntry } from "../lib/gb-connections/schema.js";

export const siteConnectionReportSchema = z.object({
  lat: z.number().describe("Latitude (-90 to 90). WGS84."),
  lon: z.number().describe("Longitude (-180 to 180). WGS84."),
  project_name: z
    .string()
    .optional()
    .describe("Optional human-readable project name used in the narrative summary."),
  capacity_kind: z
    .enum(["generation", "demand", "storage"])
    .describe('Indicative project capacity kind. Narrative only — not used for scoring.'),
  radius_km: z
    .number()
    .optional()
    .describe("GSP / DNO search radius in km (default 25, max 50)."),
});

type TrafficLight = "green" | "amber" | "red" | "unknown";

const DEFAULT_RADIUS_KM = 25;
const MAX_RADIUS_KM = 50;
const TOP_TEC_ENTRIES = 5;

// Generous GB bounding box (Isles of Scilly to Shetland, west of Ireland to
// eastern England). Coordinates outside this box cannot return a meaningful
// GB connection-intelligence report — every upstream is GB-only today.
const GB_BBOX = {
  min_lat: 49.5,
  max_lat: 61.0,
  min_lon: -8.5,
  max_lon: 2.0,
} as const;

const DISCLAIMER =
  "This report is based on public data snapshots and is not a connection offer, capacity guarantee, " +
  "or Gate 2 decision. Rules and datasets change frequently; always verify with the relevant " +
  "network operator and NESO.";

/**
 * Traffic-light thresholds. Every band is driven by a published upstream
 * signal; anything we cannot derive from a published source returns
 * "unknown". We deliberately avoid inventing capacity-headroom thresholds.
 */
const TRAFFIC_LIGHT_THRESHOLDS = {
  queue: [
    "green: 0 MW queued at the matched GSP (TEC register + NGED per-GSP signal both return zero entries)",
    "unknown: any positive queued MW or any upstream fetch failure — we do not publish a cutoff for how much queued MW is 'too much'",
  ],
  headroom: [
    "green / amber / red: mirrors the DNO-published generation RAG status where available (SSEN, NPG, UKPN, SPEN, ENWL)",
    "unknown: upstream returned no nearest site, or the operator does not publish a RAG status (ENWL, UKPN scenario data)",
  ],
  land_constraints: [
    "red: a hard planning-exclusion designation intersects the search radius (SSSI, SAC, SPA, Ramsar, National Park per Natural England / EEA Natura 2000)",
    "amber: softer constraints present but no hard exclusion",
    "green: no constraint features returned within radius",
    "unknown: upstream fetch failed",
  ],
} as const;

interface ConstraintFlag {
  flag: boolean;
  reason: string | null;
}

interface QueueSummary {
  total_mw_queued: number | null;
  project_count: number | null;
  top_entries: CanonicalConnectionEntry[];
}

interface DnoHeadroomSummary {
  operator: string | null;
  substation: string | null;
  distance_km: number | null;
  generation_headroom_mw: number | null;
  demand_headroom_mva: number | null;
  generation_rag_status: string | null;
  demand_rag_status: string | null;
  canonical: CanonicalConnectionEntry | null;
}

interface NgedContextSummary {
  queue_matched_projects: number | null;
  queue_total_mw_export: number | null;
  td_limits_resource: string | null;
  td_max_export_mw: number | null;
}

interface StructuredReport {
  nearest_gsp: {
    gsp_id: string;
    gsp_name: string;
    region_name: string;
    distance_km: number;
  } | null;
  tec_queue: QueueSummary;
  dno_headroom: DnoHeadroomSummary;
  nged_context: NgedContextSummary | null;
  constraints: {
    protected_area: ConstraintFlag;
    flood: ConstraintFlag;
    alc_grade: ConstraintFlag;
  };
}

interface SiteConnectionReportResult {
  project_name: string | null;
  lat: number;
  lon: number;
  capacity_kind: "generation" | "demand" | "storage";
  radius_km: number;
  summary: string;
  structured: StructuredReport;
  traffic_lights: {
    queue: TrafficLight;
    headroom: TrafficLight;
    land_constraints: TrafficLight;
  };
  traffic_light_thresholds: typeof TRAFFIC_LIGHT_THRESHOLDS;
  source_metadata: {
    grid_connection_intelligence: {
      gsp_lookup: GisSourceMetadata;
      tec_register: GisSourceMetadata;
      distribution_headroom: GisSourceMetadata;
      nged_queue_signal: GisSourceMetadata;
    };
    land_constraints: GisSourceMetadata;
    flood_risk: GisSourceMetadata;
    agricultural_land: GisSourceMetadata;
  };
  confidence_notes: string[];
  disclaimer: string;
}

function mapRagStatus(rag: string | null | undefined): TrafficLight {
  if (!rag) return "unknown";
  const s = rag.trim().toLowerCase();
  if (s === "green" || s === "g") return "green";
  if (s === "amber" || s === "a" || s === "yellow") return "amber";
  if (s === "red" || s === "r") return "red";
  return "unknown";
}

function formatNumber(value: number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}${suffix}`;
}

function buildSummary(
  params: {
    project_name: string | null;
    lat: number;
    lon: number;
    capacity_kind: "generation" | "demand" | "storage";
  },
  structured: StructuredReport,
  traffic: SiteConnectionReportResult["traffic_lights"],
): string {
  const header = params.project_name
    ? `# Site connection report: ${params.project_name}`
    : `# Site connection report`;

  const coords = `Coordinates: ${params.lat.toFixed(5)}, ${params.lon.toFixed(5)} (WGS84). Capacity kind: ${params.capacity_kind}.`;

  const gsp = structured.nearest_gsp
    ? `Nearest GSP: ${structured.nearest_gsp.gsp_name} (${structured.nearest_gsp.region_name}), ${formatNumber(structured.nearest_gsp.distance_km, " km")}.`
    : `Nearest GSP: not resolved within the search radius.`;

  const queue = `TEC queue: ${formatNumber(structured.tec_queue.total_mw_queued, " MW")} net change across ${structured.tec_queue.project_count ?? 0} matched project(s).`;

  const headroom = structured.dno_headroom.substation
    ? `DNO headroom: ${structured.dno_headroom.operator} at ${structured.dno_headroom.substation} (${formatNumber(structured.dno_headroom.distance_km, " km")}): generation ${formatNumber(structured.dno_headroom.generation_headroom_mw, " MW")} (${structured.dno_headroom.generation_rag_status ?? "no RAG"}), demand ${formatNumber(structured.dno_headroom.demand_headroom_mva, " MVA")} (${structured.dno_headroom.demand_rag_status ?? "no RAG"}).`
    : `DNO headroom: no nearest site resolved.`;

  const constraints = [
    `Protected area: ${structured.constraints.protected_area.flag ? "INTERSECTS" : "clear"}${structured.constraints.protected_area.reason ? ` — ${structured.constraints.protected_area.reason}` : ""}`,
    `Flood: ${structured.constraints.flood.flag ? "INTERSECTS" : "clear"}${structured.constraints.flood.reason ? ` — ${structured.constraints.flood.reason}` : ""}`,
    `ALC grade: ${structured.constraints.alc_grade.flag ? "BMV risk" : "no BMV risk"}${structured.constraints.alc_grade.reason ? ` — ${structured.constraints.alc_grade.reason}` : ""}`,
  ].join("\n- ");

  const lights = `Queue: ${traffic.queue} | Headroom: ${traffic.headroom} | Land constraints: ${traffic.land_constraints}`;

  return [
    header,
    coords,
    "",
    "## Traffic lights",
    lights,
    "",
    "## Grid",
    `- ${gsp}`,
    `- ${queue}`,
    `- ${headroom}`,
    "",
    "## Site constraints",
    `- ${constraints}`,
    "",
    "## Disclaimer",
    DISCLAIMER,
  ].join("\n");
}

function protectedAreaFlag(
  landConstraints: Awaited<ReturnType<typeof getLandConstraints>> | null,
): ConstraintFlag {
  if (!landConstraints) return { flag: false, reason: "land constraints upstream failed" };
  if (landConstraints.summary.has_hard_constraint) {
    const firstHard = landConstraints.constraints.find((c) =>
      ["sssi", "sac", "spa", "ramsar", "national_park", "natura2000", "natura2000_birds", "natura2000_habitats"].includes(c.type),
    );
    return {
      flag: true,
      reason: firstHard ? `${firstHard.type}: ${firstHard.name}` : "hard planning exclusion designation present",
    };
  }
  if (landConstraints.summary.constraint_count > 0) {
    return {
      flag: false,
      reason: `${landConstraints.summary.constraint_count} non-hard constraint feature(s) within radius`,
    };
  }
  return { flag: false, reason: null };
}

function floodFlag(
  flood: Awaited<ReturnType<typeof getFloodRisk>> | null,
): ConstraintFlag {
  if (!flood) return { flag: false, reason: "flood-risk upstream failed" };
  if (flood.flood_zone === "3" || flood.flood_storage_area) {
    return { flag: true, reason: flood.explanation };
  }
  if (flood.flood_zone === "2") {
    return { flag: false, reason: flood.explanation };
  }
  return { flag: false, reason: null };
}

function alcFlag(
  alc: Awaited<ReturnType<typeof getAgriculturalLand>> | null,
): ConstraintFlag {
  if (!alc) return { flag: false, reason: "agricultural-land upstream failed or out of coverage" };
  if (alc.bmv_status === "yes") {
    return { flag: true, reason: `Best and Most Versatile (${alc.effective_grade ?? "grade unknown"})` };
  }
  if (alc.bmv_status === "uncertain") {
    return { flag: false, reason: `BMV status uncertain (${alc.effective_grade ?? "grade unknown"})` };
  }
  return { flag: false, reason: null };
}

function landTrafficLight(
  landConstraints: Awaited<ReturnType<typeof getLandConstraints>> | null,
): TrafficLight {
  if (!landConstraints) return "unknown";
  if (landConstraints.summary.has_hard_constraint) return "red";
  if (landConstraints.summary.constraint_count > 0) return "amber";
  return "green";
}

function queueTrafficLight(
  tecTotalMw: number | null,
  tecProjectCount: number | null,
  ngedMatchedProjects: number | null,
): TrafficLight {
  if (tecTotalMw === null && ngedMatchedProjects === null) return "unknown";
  // Green requires positive evidence of zero entries from BOTH the TEC
  // register and NGED — absence of data is not the same as absence of queue.
  const tecPositivelyZero = tecTotalMw === 0 && tecProjectCount === 0;
  const ngedPositivelyZero = ngedMatchedProjects === 0;
  if (tecPositivelyZero && ngedPositivelyZero) return "green";
  return "unknown";
}

export async function getSiteConnectionReport(
  params: z.infer<typeof siteConnectionReportSchema>,
): Promise<SiteConnectionReportResult> {
  const { lat, lon } = params;
  const radiusKm = params.radius_km ?? DEFAULT_RADIUS_KM;

  if (lat < -90 || lat > 90) throw new Error("Latitude must be between -90 and 90.");
  if (lon < -180 || lon > 180) throw new Error("Longitude must be between -180 and 180.");
  if (radiusKm <= 0 || radiusKm > MAX_RADIUS_KM) {
    throw new Error(`radius_km must be between 0 and ${MAX_RADIUS_KM}.`);
  }
  if (
    lat < GB_BBOX.min_lat ||
    lat > GB_BBOX.max_lat ||
    lon < GB_BBOX.min_lon ||
    lon > GB_BBOX.max_lon
  ) {
    throw new Error(
      `Coordinates (${lat}, ${lon}) are outside Great Britain. ` +
        "get_site_connection_report is GB-only because every connection-intelligence upstream " +
        "(NESO GSP polygons, TEC register, DNO headroom, NGED queue, Natural England constraints, " +
        "Environment Agency flood map) is GB-only. For EU sites use screen_site with country set " +
        "to the relevant ISO code.",
    );
  }

  const [gridResult, landResult, floodResult, alcResult] = await Promise.allSettled([
    getGridConnectionIntelligence({ lat, lon, country: "GB", radius_km: radiusKm }),
    getLandConstraints({ lat, lon, country: "GB" }),
    getFloodRisk({ lat, lon, country: "GB" }),
    getAgriculturalLand({ lat, lon, country: "GB" }),
  ]);

  const grid = gridResult.status === "fulfilled" ? gridResult.value : null;
  const land = landResult.status === "fulfilled" ? landResult.value : null;
  const flood = floodResult.status === "fulfilled" ? floodResult.value : null;
  const alc = alcResult.status === "fulfilled" ? alcResult.value : null;

  const confidenceNotes: string[] = [];
  if (gridResult.status === "rejected") {
    confidenceNotes.push(
      `Grid connection intelligence upstream failed: ${asErrorMessage(gridResult.reason)}`,
    );
  }
  if (landResult.status === "rejected") {
    confidenceNotes.push(
      `Land constraints upstream failed: ${asErrorMessage(landResult.reason)}`,
    );
  }
  if (floodResult.status === "rejected") {
    confidenceNotes.push(
      `Flood risk upstream failed: ${asErrorMessage(floodResult.reason)}`,
    );
  }
  if (alcResult.status === "rejected") {
    confidenceNotes.push(
      `Agricultural land upstream failed or out of coverage: ${asErrorMessage(alcResult.reason)}`,
    );
  }

  // --- TEC queue summary ---
  // A null connection_queue means "no GSP matched" or "TEC upstream failed"
  // inside grid-connection-intelligence; both are unknown signals, not zero.
  const tecProjects = (grid?.connection_queue?.projects ?? []) as TecRowInput[];
  const tecTotalMw = grid?.connection_queue?.total_mw_queued ?? null;
  const tecProjectCount = grid?.connection_queue ? tecProjects.length : null;
  const topTecEntries = tecProjects.slice(0, TOP_TEC_ENTRIES).map((row) => normaliseTecRow(row));

  // --- DNO headroom summary ---
  const dnoSite = grid?.distribution_headroom ?? null;
  let dnoCanonical: CanonicalConnectionEntry | null = null;
  if (dnoSite) {
    const operator = (dnoSite.operator ?? "").toUpperCase();
    if (["SSEN", "NPG", "UKPN", "SPEN", "ENWL"].includes(operator)) {
      dnoCanonical = normaliseDnoHeadroomRow(
        dnoSite as unknown as DnoHeadroomRowInput,
        operator as DnoOperatorInput,
      );
    }
  }

  const dnoHeadroom: DnoHeadroomSummary = {
    operator: dnoSite?.operator ?? null,
    substation: dnoSite?.substation ?? null,
    distance_km: dnoSite?.distance_km ?? null,
    generation_headroom_mw: dnoSite?.estimated_generation_headroom_mw ?? null,
    demand_headroom_mva: dnoSite?.estimated_demand_headroom_mva ?? null,
    generation_rag_status: dnoSite?.generation_rag_status ?? null,
    demand_rag_status: dnoSite?.demand_rag_status ?? null,
    canonical: dnoCanonical,
  };

  // --- NGED context summary ---
  const ngedSignal = grid?.nged_connection_signal ?? null;
  const ngedContext: NgedContextSummary | null = ngedSignal
    ? {
        queue_matched_projects:
          (ngedSignal.queue_signal?.summary as { matched_projects?: number } | undefined)
            ?.matched_projects ?? null,
        queue_total_mw_export:
          (ngedSignal.queue_signal?.summary as { total_site_export_capacity_mw?: number } | undefined)
            ?.total_site_export_capacity_mw ?? null,
        td_limits_resource: ngedSignal.td_limits?.resource_name ?? null,
        td_max_export_mw:
          (ngedSignal.td_limits?.summary as { max_export_tl_mw?: number | null } | undefined)
            ?.max_export_tl_mw ?? null,
      }
    : null;

  // Surface normalised NGED queue rows as part of the top entries too
  if (ngedSignal?.queue_signal?.projects) {
    const ngedRows = ngedSignal.queue_signal.projects as unknown as NgedQueueRowInput[];
    for (const row of ngedRows.slice(0, TOP_TEC_ENTRIES)) {
      topTecEntries.push(normaliseNgedQueueRow(row));
    }
  }

  const structured: StructuredReport = {
    nearest_gsp: grid?.nearest_gsp
      ? {
          gsp_id: grid.nearest_gsp.gsp_id,
          gsp_name: grid.nearest_gsp.gsp_name,
          region_name: grid.nearest_gsp.region_name,
          distance_km: grid.nearest_gsp.distance_km,
        }
      : null,
    tec_queue: {
      total_mw_queued: tecTotalMw,
      project_count: tecProjectCount,
      top_entries: topTecEntries,
    },
    dno_headroom: dnoHeadroom,
    nged_context: ngedContext,
    constraints: {
      protected_area: protectedAreaFlag(land),
      flood: floodFlag(flood),
      alc_grade: alcFlag(alc),
    },
  };

  const trafficLights = {
    queue: queueTrafficLight(tecTotalMw, tecProjectCount, ngedContext?.queue_matched_projects ?? null),
    headroom: mapRagStatus(dnoHeadroom.generation_rag_status),
    land_constraints: landTrafficLight(land),
  };

  const projectName = params.project_name ?? null;

  const summaryText = buildSummary(
    { project_name: projectName, lat, lon, capacity_kind: params.capacity_kind },
    structured,
    trafficLights,
  );

  confidenceNotes.push(
    "Traffic lights use published upstream signals only (DNO generation RAG, protected-area hard designations, literal-zero queue counts). We do not infer thresholds.",
    "This report is a composition over existing Luminus tools; it does not open a connection offer or submit anything to NESO or a DNO.",
  );

  return {
    project_name: projectName,
    lat,
    lon,
    capacity_kind: params.capacity_kind,
    radius_km: radiusKm,
    summary: summaryText,
    structured,
    traffic_lights: trafficLights,
    traffic_light_thresholds: TRAFFIC_LIGHT_THRESHOLDS,
    source_metadata: {
      grid_connection_intelligence: {
        gsp_lookup: GIS_SOURCES["neso-gsp-lookup"],
        tec_register: GIS_SOURCES["neso-tec-register"],
        distribution_headroom: GIS_SOURCES["ssen-distribution-headroom"],
        nged_queue_signal: GIS_SOURCES["nged-connection-queue"],
      },
      land_constraints: GIS_SOURCES["natural-england"],
      flood_risk: GIS_SOURCES["ea-flood-map"],
      agricultural_land: GIS_SOURCES["natural-england-alc"],
    },
    confidence_notes: confidenceNotes,
    disclaimer: DISCLAIMER,
  };
}

function asErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
