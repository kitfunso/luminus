/**
 * Upstream row normalisers for the canonical GB connections schema.
 *
 * These map raw rows emitted by the existing Luminus tools (NESO TEC,
 * NGED per-GSP queue, SSEN/NPG/UKPN/SPEN/ENWL headroom feeds) onto
 * `CanonicalConnectionEntry`. We never default missing fields to zero.
 */

import type {
  CanonicalConnectionEntry,
  CapacityKind,
  ConnectionLifecycleStage,
  ConnectionSource,
} from "./schema.js";

export interface TecRowInput {
  project_name?: string;
  customer_name?: string | null;
  connection_site?: string;
  stage?: number | null;
  mw_connected?: number;
  mw_increase_decrease?: number;
  cumulative_total_capacity_mw?: number;
  mw_effective_from?: string | null;
  project_status?: string | null;
  agreement_type?: string | null;
  host_to?: string | null;
  plant_type?: string | null;
  project_id?: string | null;
  project_number?: string | null;
  gate?: number | null;
  [key: string]: unknown;
}

export interface NgedQueueRowInput {
  licence_area?: string | null;
  gsp?: string | null;
  tanm?: boolean | null;
  danm?: boolean | null;
  status?: string | null;
  bus_number?: number | null;
  bus_name?: string | null;
  site_id?: number | null;
  application_id?: number | null;
  site_export_capacity_mw?: number | null;
  site_import_capacity_mw?: number | null;
  machine_export_capacity_mw?: number | null;
  machine_import_capacity_mw?: number | null;
  fuel_type?: string | null;
  machine_id?: string | null;
  position?: number | null;
  [key: string]: unknown;
}

export interface DnoHeadroomRowInput {
  asset_id?: string;
  licence_area?: string;
  substation?: string;
  substation_type?: string | null;
  voltage_kv?: string | null;
  upstream_gsp?: string | null;
  upstream_bsp?: string | null;
  estimated_demand_headroom_mva?: number | null;
  demand_rag_status?: string | null;
  demand_constraint?: string | null;
  connected_generation_mw?: number | null;
  contracted_generation_mw?: number | null;
  estimated_generation_headroom_mw?: number | null;
  generation_rag_status?: string | null;
  generation_constraint?: string | null;
  [key: string]: unknown;
}

export type DnoOperatorInput =
  | "SSEN"
  | "NPG"
  | "UKPN"
  | "SPEN"
  | "ENWL"
  | "ssen"
  | "npg"
  | "ukpn"
  | "spen"
  | "enwl";

const DNO_OPERATOR_MAP: Record<string, ConnectionSource> = {
  ssen: "ssen",
  npg: "npg",
  ukpn: "ukpn",
  spen: "spen",
  enwl: "enwl",
};

function mapPlantTypeToCapacityKind(plantType: string | null): CapacityKind {
  const s = (plantType ?? "").toLowerCase();
  if (!s) return "unknown";
  if (s.includes("storage") || s.includes("battery")) return "storage";
  if (s.includes("demand") || s.includes("load")) return "demand";
  if (
    s.includes("solar") ||
    s.includes("wind") ||
    s.includes("hydro") ||
    s.includes("biomass") ||
    s.includes("gas") ||
    s.includes("coal") ||
    s.includes("nuclear") ||
    s.includes("chp") ||
    s.includes("interconnector") ||
    s.includes("generation") ||
    s.includes("waste") ||
    s.includes("pv")
  ) {
    return "generation";
  }
  return "unknown";
}

function mapTecLifecycleStage(
  projectStatus: string | null,
): ConnectionLifecycleStage {
  const s = (projectStatus ?? "").toLowerCase();
  if (s.includes("terminat") || s.includes("withdraw") || s.includes("cancel")) {
    return "withdrawn";
  }
  // "MW Connected" on a TEC row is the site's existing connected capacity, not
  // the status of this row's increment — only trust project_status for that.
  if (s.includes("connected")) return "energised";
  // A row in the TEC register without a terminal status still represents a
  // contracted TEC position, not an aspirational queue entry.
  if (s.length > 0) return "contracted";
  return "unknown";
}

function mapNgedLifecycleStage(
  status: string | null,
): ConnectionLifecycleStage {
  const s = (status ?? "").toLowerCase();
  if (!s) return "unknown";
  if (s.includes("withdraw") || s.includes("cancel") || s.includes("termin")) {
    return "withdrawn";
  }
  if (s.includes("connected")) return "energised";
  if (s.includes("accept") || s.includes("agreed") || s.includes("offer")) {
    return "contracted";
  }
  if (
    s.includes("queue") ||
    s.includes("await") ||
    s.includes("pending") ||
    s.includes("scop") ||
    s.includes("submitt")
  ) {
    return "queued";
  }
  return "unknown";
}

function nonEmpty(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  return Number.isFinite(value) ? value : undefined;
}

export function normaliseTecRow(row: TecRowInput): CanonicalConnectionEntry {
  const connectionSite = nonEmpty(row.connection_site) ?? "Unknown connection site";
  const mwConnected = finiteNumber(row.mw_connected) ?? 0;
  const mwIncrease = finiteNumber(row.mw_increase_decrease) ?? 0;

  const sourceRowId =
    nonEmpty(row.project_id) ??
    nonEmpty(row.project_number) ??
    `${connectionSite}:${nonEmpty(row.project_name) ?? "unknown"}`;

  const entry: CanonicalConnectionEntry = {
    source: "neso-tec",
    source_row_id: sourceRowId,
    connection_site: connectionSite,
    capacity_kind: mapPlantTypeToCapacityKind(row.plant_type ?? null),
    lifecycle_stage: mapTecLifecycleStage(row.project_status ?? null),
    raw: { ...row } as Record<string, unknown>,
  };

  const gspName = nonEmpty(row.connection_site);
  if (gspName) entry.gsp_name_raw = gspName;

  // Prefer the net change as the "capacity in play"; fall back to connected MW.
  const mwCapacity = mwIncrease !== 0 ? mwIncrease : mwConnected !== 0 ? mwConnected : undefined;
  if (mwCapacity !== undefined) entry.mw_capacity = mwCapacity;

  const agreement = nonEmpty(row.agreement_type);
  if (agreement) entry.agreement_type = agreement;

  const effectiveFrom = nonEmpty(row.mw_effective_from);
  if (effectiveFrom) entry.mw_connection_date = effectiveFrom;

  const status = nonEmpty(row.project_status);
  if (status) entry.status_text_raw = status;

  return entry;
}

export function normaliseNgedQueueRow(
  row: NgedQueueRowInput,
): CanonicalConnectionEntry {
  const connectionSite =
    nonEmpty(row.bus_name) ??
    nonEmpty(row.gsp) ??
    (row.site_id !== null && row.site_id !== undefined ? `Site ${row.site_id}` : "Unknown NGED site");

  const sourceRowId =
    row.site_id !== null && row.site_id !== undefined
      ? `NGED:${row.site_id}${row.machine_id ? `:${row.machine_id}` : ""}`
      : row.application_id !== null && row.application_id !== undefined
        ? `NGED:app:${row.application_id}`
        : `NGED:${connectionSite}`;

  const exportCap = finiteNumber(row.site_export_capacity_mw);
  const importCap = finiteNumber(row.site_import_capacity_mw);
  const mwCapacity =
    exportCap !== undefined && importCap !== undefined
      ? Math.max(exportCap, importCap)
      : exportCap ?? importCap;

  const entry: CanonicalConnectionEntry = {
    source: "nged-public",
    source_row_id: sourceRowId,
    connection_site: connectionSite,
    capacity_kind: mapPlantTypeToCapacityKind(row.fuel_type ?? null),
    lifecycle_stage: mapNgedLifecycleStage(row.status ?? null),
    raw: { ...row } as Record<string, unknown>,
  };

  const gspName = nonEmpty(row.gsp);
  if (gspName) entry.gsp_name_raw = gspName;

  if (mwCapacity !== undefined) entry.mw_capacity = mwCapacity;

  const status = nonEmpty(row.status);
  if (status) entry.status_text_raw = status;

  return entry;
}

export function normaliseDnoHeadroomRow(
  row: DnoHeadroomRowInput,
  operator: DnoOperatorInput,
): CanonicalConnectionEntry {
  const source = DNO_OPERATOR_MAP[operator.toLowerCase()];
  if (!source) {
    throw new Error(`Unsupported DNO operator: ${operator}`);
  }

  const substation = nonEmpty(row.substation) ?? "Unknown substation";
  const sourceRowId = nonEmpty(row.asset_id) ?? `${source}:${substation}`;

  const genMw = finiteNumber(row.estimated_generation_headroom_mw);
  const demMva = finiteNumber(row.estimated_demand_headroom_mva);

  let capacityKind: CapacityKind;
  if (genMw !== undefined && demMva !== undefined) {
    capacityKind = "mixed";
  } else if (genMw !== undefined) {
    capacityKind = "generation";
  } else if (demMva !== undefined) {
    capacityKind = "demand";
  } else {
    capacityKind = "unknown";
  }

  const entry: CanonicalConnectionEntry = {
    source,
    source_row_id: sourceRowId,
    connection_site: substation,
    // A DNO headroom row is a substation capacity snapshot, not a queue
    // entry — so we never claim a lifecycle position for it.
    lifecycle_stage: "unknown",
    capacity_kind: capacityKind,
    raw: { ...row } as Record<string, unknown>,
  };

  const gspName = nonEmpty(row.upstream_gsp);
  if (gspName) entry.gsp_name_raw = gspName;

  if (genMw !== undefined) entry.mw_capacity = genMw;
  if (demMva !== undefined) entry.mva_capacity = demMva;

  const status =
    nonEmpty(row.generation_rag_status) ?? nonEmpty(row.demand_rag_status);
  if (status) entry.status_text_raw = status;

  return entry;
}
