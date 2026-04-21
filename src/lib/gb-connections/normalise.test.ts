import { describe, it, expect } from "vitest";
import {
  normaliseTecRow,
  normaliseNgedQueueRow,
  normaliseDnoHeadroomRow,
  type TecRowInput,
  type NgedQueueRowInput,
  type DnoHeadroomRowInput,
} from "./normalise.js";
import type { CanonicalConnectionEntry } from "./schema.js";

// Fixtures copied from the existing tool tests so the shapes stay honest.
// Changes upstream should break these in lock-step.

const TEC_FIXTURE: TecRowInput = {
  project_name: "Solar Farm Alpha",
  customer_name: "Alpha Ltd",
  connection_site: "Berkswell",
  stage: 1,
  mw_connected: 50,
  mw_increase_decrease: 100,
  cumulative_total_capacity_mw: 150,
  mw_effective_from: "2024-01-01",
  project_status: "Awaiting Consents",
  agreement_type: "Directly Connected",
  host_to: "NGET",
  plant_type: "Solar",
  project_id: "P001",
  project_number: "PN001",
  gate: null,
};

const NGED_QUEUE_FIXTURE: NgedQueueRowInput = {
  licence_area: "East Midlands",
  gsp: "BERKSWELL 132kV S STN",
  tanm: false,
  danm: false,
  status: "Recently Connected",
  bus_number: 101,
  bus_name: "Berkswell Bus A",
  site_id: 5001,
  application_id: 7001,
  site_export_capacity_mw: 25,
  site_import_capacity_mw: 2,
  machine_export_capacity_mw: 25,
  machine_import_capacity_mw: 2,
  fuel_type: "Battery",
  machine_id: "M1",
  position: 1,
};

const SSEN_HEADROOM_FIXTURE: DnoHeadroomRowInput = {
  asset_id: "E-ALPHA-01",
  licence_area: "England / SEPD",
  substation: "Alpha GSP",
  substation_type: "GSP",
  voltage_kv: "132",
  upstream_gsp: "Alpha 400kV",
  upstream_bsp: null,
  estimated_demand_headroom_mva: 8,
  demand_rag_status: "Amber",
  demand_constraint: "Demand constraint",
  connected_generation_mw: 10,
  contracted_generation_mw: 12,
  estimated_generation_headroom_mw: 35,
  generation_rag_status: "Green",
  generation_constraint: null,
};

const NPG_HEADROOM_FIXTURE: DnoHeadroomRowInput = {
  asset_id: "NPG:Primary:Westgate",
  licence_area: "Northern Powergrid",
  substation: "Westgate",
  substation_type: "Primary",
  voltage_kv: "33",
  upstream_gsp: "Leeds",
  upstream_bsp: "Leeds BSP",
  estimated_demand_headroom_mva: 12.5,
  demand_rag_status: "red",
  demand_constraint: "Thermal",
  connected_generation_mw: null,
  contracted_generation_mw: 6,
  estimated_generation_headroom_mw: 0,
  generation_rag_status: "amber",
  generation_constraint: null,
};

const UKPN_HEADROOM_FIXTURE: DnoHeadroomRowInput = {
  asset_id: "UKPN:EPN:Chelmsford Grid",
  licence_area: "EPN",
  substation: "Chelmsford Grid",
  substation_type: null,
  voltage_kv: "132",
  upstream_gsp: "Rayleigh",
  upstream_bsp: "Chelmsford BSP",
  estimated_demand_headroom_mva: 40,
  demand_rag_status: null,
  demand_constraint: null,
  estimated_generation_headroom_mw: 60,
  generation_rag_status: null,
  generation_constraint: null,
};

function assertCanonicalShape(entry: CanonicalConnectionEntry): void {
  expect(typeof entry.source).toBe("string");
  expect(entry.source_row_id).toBeTypeOf("string");
  expect(entry.source_row_id.length).toBeGreaterThan(0);
  expect(entry.connection_site).toBeTypeOf("string");
  expect(entry.connection_site.length).toBeGreaterThan(0);
  expect(["generation", "demand", "storage", "mixed", "unknown"]).toContain(entry.capacity_kind);
  expect(["queued", "contracted", "energised", "withdrawn", "unknown"]).toContain(entry.lifecycle_stage);
  expect(entry.raw).toBeTypeOf("object");
  expect(entry.raw).not.toBeNull();
}

describe("normaliseTecRow", () => {
  it("maps a TEC register row onto the canonical shape", () => {
    const entry = normaliseTecRow(TEC_FIXTURE);
    assertCanonicalShape(entry);
    expect(entry.source).toBe("neso-tec");
    expect(entry.source_row_id).toBe("P001");
    expect(entry.connection_site).toBe("Berkswell");
    expect(entry.capacity_kind).toBe("generation");
    expect(entry.lifecycle_stage).toBe("contracted");
    expect(entry.mw_capacity).toBe(100);
    expect(entry.mw_connection_date).toBe("2024-01-01");
    expect(entry.agreement_type).toBe("Directly Connected");
    expect(entry.status_text_raw).toBe("Awaiting Consents");
    expect(entry.gsp_name_raw).toBe("Berkswell");
  });

  it("classifies a connected TEC entry as energised", () => {
    const row: TecRowInput = {
      ...TEC_FIXTURE,
      project_status: "Connected",
      mw_connected: 50,
      mw_increase_decrease: 0,
    };
    const entry = normaliseTecRow(row);
    expect(entry.lifecycle_stage).toBe("energised");
    expect(entry.mw_capacity).toBe(50);
  });

  it("classifies a battery plant_type as storage", () => {
    const entry = normaliseTecRow({ ...TEC_FIXTURE, plant_type: "Energy Storage System" });
    expect(entry.capacity_kind).toBe("storage");
  });

  it("falls back to a composite id when project_id and number are missing", () => {
    const entry = normaliseTecRow({
      ...TEC_FIXTURE,
      project_id: null,
      project_number: null,
    });
    expect(entry.source_row_id).toContain("Berkswell");
    expect(entry.source_row_id).toContain("Solar Farm Alpha");
  });

  it("leaves unmappable fields undefined rather than zero", () => {
    const entry = normaliseTecRow({
      project_name: "Ghost",
      connection_site: "Nowhere",
    });
    expect(entry.mw_capacity).toBeUndefined();
    expect(entry.agreement_type).toBeUndefined();
    expect(entry.mw_connection_date).toBeUndefined();
    expect(entry.status_text_raw).toBeUndefined();
    expect(entry.capacity_kind).toBe("unknown");
    expect(entry.lifecycle_stage).toBe("unknown");
  });
});

describe("normaliseNgedQueueRow", () => {
  it("maps an NGED queue row onto the canonical shape", () => {
    const entry = normaliseNgedQueueRow(NGED_QUEUE_FIXTURE);
    assertCanonicalShape(entry);
    expect(entry.source).toBe("nged-public");
    expect(entry.source_row_id).toBe("NGED:5001:M1");
    expect(entry.connection_site).toBe("Berkswell Bus A");
    expect(entry.capacity_kind).toBe("storage");
    expect(entry.lifecycle_stage).toBe("energised");
    expect(entry.mw_capacity).toBe(25);
    expect(entry.gsp_name_raw).toBe("BERKSWELL 132kV S STN");
    expect(entry.status_text_raw).toBe("Recently Connected");
  });

  it("marks withdrawn NGED rows accordingly", () => {
    const entry = normaliseNgedQueueRow({ ...NGED_QUEUE_FIXTURE, status: "Withdrawn" });
    expect(entry.lifecycle_stage).toBe("withdrawn");
  });

  it("marks awaiting/accepted rows as contracted", () => {
    const entry = normaliseNgedQueueRow({ ...NGED_QUEUE_FIXTURE, status: "Accepted" });
    expect(entry.lifecycle_stage).toBe("contracted");
  });

  it("leaves mw_capacity undefined when no capacity fields are set", () => {
    const entry = normaliseNgedQueueRow({
      gsp: "Something",
      bus_name: "Bus",
      site_id: 1,
      status: null,
      fuel_type: null,
      site_export_capacity_mw: null,
      site_import_capacity_mw: null,
    });
    expect(entry.mw_capacity).toBeUndefined();
    expect(entry.capacity_kind).toBe("unknown");
    expect(entry.lifecycle_stage).toBe("unknown");
  });
});

describe("normaliseDnoHeadroomRow", () => {
  it("maps an SSEN headroom row with both gen and demand as mixed", () => {
    const entry = normaliseDnoHeadroomRow(SSEN_HEADROOM_FIXTURE, "SSEN");
    assertCanonicalShape(entry);
    expect(entry.source).toBe("ssen");
    expect(entry.source_row_id).toBe("E-ALPHA-01");
    expect(entry.connection_site).toBe("Alpha GSP");
    expect(entry.capacity_kind).toBe("mixed");
    expect(entry.mw_capacity).toBe(35);
    expect(entry.mva_capacity).toBe(8);
    expect(entry.lifecycle_stage).toBe("unknown");
    expect(entry.gsp_name_raw).toBe("Alpha 400kV");
  });

  it("maps an NPG row with zero generation headroom correctly", () => {
    const entry = normaliseDnoHeadroomRow(NPG_HEADROOM_FIXTURE, "NPG");
    expect(entry.source).toBe("npg");
    expect(entry.capacity_kind).toBe("mixed");
    expect(entry.mw_capacity).toBe(0);
    expect(entry.mva_capacity).toBe(12.5);
  });

  it("maps a UKPN row without RAG status without inventing one", () => {
    const entry = normaliseDnoHeadroomRow(UKPN_HEADROOM_FIXTURE, "UKPN");
    expect(entry.source).toBe("ukpn");
    expect(entry.status_text_raw).toBeUndefined();
  });

  it("accepts lower-case operator strings", () => {
    const entry = normaliseDnoHeadroomRow(SSEN_HEADROOM_FIXTURE, "ssen");
    expect(entry.source).toBe("ssen");
  });

  it("throws on an unsupported operator", () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      normaliseDnoHeadroomRow(SSEN_HEADROOM_FIXTURE, "EDF" as any),
    ).toThrow(/Unsupported DNO operator/);
  });

  it("classifies capacity_kind as demand when only demand headroom is present", () => {
    const entry = normaliseDnoHeadroomRow(
      { ...UKPN_HEADROOM_FIXTURE, estimated_generation_headroom_mw: null },
      "UKPN",
    );
    expect(entry.capacity_kind).toBe("demand");
    expect(entry.mw_capacity).toBeUndefined();
    expect(entry.mva_capacity).toBe(40);
  });

  it("classifies capacity_kind as unknown when both are null", () => {
    const entry = normaliseDnoHeadroomRow(
      {
        ...UKPN_HEADROOM_FIXTURE,
        estimated_demand_headroom_mva: null,
        estimated_generation_headroom_mw: null,
      },
      "UKPN",
    );
    expect(entry.capacity_kind).toBe("unknown");
    expect(entry.mw_capacity).toBeUndefined();
    expect(entry.mva_capacity).toBeUndefined();
  });
});
