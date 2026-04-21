/**
 * Canonical GB connections schema.
 *
 * A single TypeScript shape for a "connection entry" regardless of the
 * upstream source (NESO TEC register, NGED per-GSP queue, or a DNO
 * headroom feed). Every field that does not appear on every source is
 * optional; we never invent values.
 */

export type ConnectionSource =
  | "neso-tec"
  | "nged-public"
  | "ssen"
  | "npg"
  | "ukpn"
  | "spen"
  | "enwl";

export type ConnectionLifecycleStage =
  | "queued"
  | "contracted"
  | "energised"
  | "withdrawn"
  | "unknown";

export type CapacityKind =
  | "generation"
  | "demand"
  | "storage"
  | "mixed"
  | "unknown";

export interface CanonicalConnectionEntry {
  source: ConnectionSource;
  /** Stable identifier composed from upstream fields; unique within (source, dataset snapshot). */
  source_row_id: string;
  /** Connection site / substation / bus label as emitted by the source. */
  connection_site: string;
  /** Upstream GSP name string; undefined when the source does not expose one. */
  gsp_name_raw?: string;
  /** Placeholder for a future normalised GSP id; left undefined today. */
  gsp_id_normalised?: string;
  capacity_kind: CapacityKind;
  /** Capacity expressed in MW where the source reports MW (e.g. generation headroom, export capacity). */
  mw_capacity?: number;
  /** Capacity expressed in MVA where the source reports MVA (e.g. demand headroom). */
  mva_capacity?: number;
  lifecycle_stage: ConnectionLifecycleStage;
  agreement_type?: string;
  application_date?: string;
  mw_connection_date?: string;
  /** Raw status string from the upstream row, before any mapping. */
  status_text_raw?: string;
  /** Original untyped row for downstream consumers that need fields we have not normalised. */
  raw: Record<string, unknown>;
}
