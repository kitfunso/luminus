import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSpenGridIntelligence,
  resetSpenGridCacheForTests,
} from "./spen-grid-intelligence.js";

vi.mock("../lib/auth.js", () => ({
  resolveApiKey: vi.fn(async () => "mock-spen-key"),
  ConfigurationError: class extends Error {
    constructor(name: string) {
      super(`Key "${name}" not configured`);
      this.name = "ConfigurationError";
    }
  },
}));

// ── Mock data ──

const MOCK_QUEUE_RESULTS = [
  {
    unique_id: "Q001",
    generator_type: "Wind",
    export_capacity_mw: 50,
    licence_area: "SPD",
    gsp_name: "Chapelcross",
  },
  {
    unique_id: "Q002",
    generator_type: "Solar",
    export_capacity_mw: 25.5,
    licence_area: "SPD",
    gsp_name: "Chapelcross",
  },
  {
    unique_id: "Q003",
    generator_type: "Wind",
    export_capacity_mw: 100,
    licence_area: "SPM",
    gsp_name: "Kincardine",
  },
];

const MOCK_DG_RESULTS = [
  {
    district: "Dumfries",
    gsp: "Chapelcross",
    total_gsp_capacity_mw: 200,
    remaining_export_capacity_mw_firm_non_firm: 45.3,
    remaining_import_capacity_mw_firm_non_firm: 80,
    fault_level_headroom: "Adequate",
    estimated_connection_date: "2027-Q1",
    estimated_cost_for_reinforcement_works: "500k",
  },
  {
    district: "Edinburgh",
    gsp: "Kaimes",
    total_gsp_capacity_mw: 350,
    remaining_export_capacity_mw_firm_non_firm: 120,
    remaining_import_capacity_mw_firm_non_firm: 150,
    fault_level_headroom: null,
    estimated_connection_date: null,
    estimated_cost_for_reinforcement_works: null,
  },
];

const MOCK_CURTAILMENT_RESULTS = [
  {
    site_name: "Chapelcross Wind Farm",
    date: "2026-03-15",
    generation_lost: 12.5,
    network_management_scheme: "ANM",
  },
  {
    site_name: "Chapelcross Wind Farm",
    date: "2026-03-20",
    generation_lost: 8.2,
    network_management_scheme: null,
  },
  {
    site_name: "Kincardine Solar Park",
    date: "2026-02-10",
    generation_lost: 3.0,
    network_management_scheme: "ANM",
  },
];

// ── Fetch helpers ──

function mockFetchAllOk(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(input);

      if (url.includes("gsp-queue-position")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: MOCK_QUEUE_RESULTS }),
        };
      }

      if (url.includes("spd-dg-connections-network-info")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: MOCK_DG_RESULTS }),
        };
      }

      if (url.includes("capacity-management-system")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: MOCK_CURTAILMENT_RESULTS }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    }),
  );
}

function mockFetchWithFilter(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(input);

      if (url.includes("gsp-queue-position")) {
        // Return only Chapelcross entries when filter is applied
        const filtered = MOCK_QUEUE_RESULTS.filter(
          (r) => r.gsp_name === "Chapelcross",
        );
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: filtered }),
        };
      }

      if (url.includes("spd-dg-connections-network-info")) {
        const filtered = MOCK_DG_RESULTS.filter(
          (r) => r.gsp === "Chapelcross",
        );
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: filtered }),
        };
      }

      if (url.includes("capacity-management-system")) {
        const filtered = MOCK_CURTAILMENT_RESULTS.filter((r) =>
          r.site_name.includes("Chapelcross"),
        );
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: filtered }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    }),
  );
}

function mockFetchQueueFails(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(input);

      if (url.includes("gsp-queue-position")) {
        return { ok: false, status: 503, text: async () => "error" };
      }

      if (url.includes("spd-dg-connections-network-info")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: MOCK_DG_RESULTS }),
        };
      }

      if (url.includes("capacity-management-system")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: MOCK_CURTAILMENT_RESULTS }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    }),
  );
}

function mockFetchEmptyResults(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    })),
  );
}

// ── Tests ──

describe("getSpenGridIntelligence", () => {
  beforeEach(() => {
    resetSpenGridCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns composite result from all three datasets", async () => {
    mockFetchAllOk();

    const result = await getSpenGridIntelligence({});

    // Null filter when none provided
    expect(result.gsp_filter).toBeNull();

    // Queue section
    expect(result.queue.total_projects).toBe(3);
    expect(result.queue.total_export_mw).toBe(175.5);
    expect(result.queue.type_breakdown["Wind"]).toEqual({
      count: 2,
      mw: 150,
    });
    expect(result.queue.type_breakdown["Solar"]).toEqual({
      count: 1,
      mw: 25.5,
    });
    expect(result.queue.entries).toHaveLength(3);
    expect(result.queue.entries[0].gsp_name).toBe("Chapelcross");

    // DG capacity section
    expect(result.dg_capacity.gsps_covered).toBe(2);
    expect(result.dg_capacity.entries).toHaveLength(2);
    expect(result.dg_capacity.entries[0].gsp).toBe("Chapelcross");
    expect(result.dg_capacity.entries[0].total_capacity_mw).toBe(200);
    expect(result.dg_capacity.entries[0].remaining_export_mw).toBe(45.3);
    expect(result.dg_capacity.entries[0].fault_level_headroom).toBe("Adequate");
    expect(result.dg_capacity.entries[1].fault_level_headroom).toBeNull();

    // Curtailment section
    expect(result.curtailment.period_days).toBe(90);
    expect(result.curtailment.total_events).toBe(3);
    expect(result.curtailment.total_generation_lost_mw).toBe(23.7);
    expect(result.curtailment.entries[0].site_name).toBe(
      "Chapelcross Wind Farm",
    );
    expect(result.curtailment.entries[0].scheme).toBe("ANM");
    expect(result.curtailment.entries[1].scheme).toBeNull();

    // Source metadata
    expect(result.source_metadata.queue.id).toBe("spen-gsp-queue");
    expect(result.source_metadata.dg_capacity.id).toBe("spen-dg-capacity");
    expect(result.source_metadata.curtailment.id).toBe("spen-curtailment");

    // Disclaimer
    expect(result.disclaimer).toContain("SP Energy Networks");
  });

  it("filters by GSP name across all three datasets", async () => {
    mockFetchWithFilter();

    const result = await getSpenGridIntelligence({
      gsp_name: "Chapelcross",
    });

    expect(result.gsp_filter).toBe("Chapelcross");

    // Queue: only Chapelcross entries
    expect(result.queue.total_projects).toBe(2);
    expect(
      result.queue.entries.every((e) => e.gsp_name === "Chapelcross"),
    ).toBe(true);

    // DG: only Chapelcross
    expect(result.dg_capacity.gsps_covered).toBe(1);
    expect(result.dg_capacity.entries[0].gsp).toBe("Chapelcross");

    // Curtailment: only Chapelcross site
    expect(
      result.curtailment.entries.every((e) =>
        e.site_name.includes("Chapelcross"),
      ),
    ).toBe(true);

    // Verify ODS where clause was passed for each URL
    const fetchMock = vi.mocked(fetch);
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));

    const queueCall = calls.find((u) => u.includes("gsp-queue-position"));
    expect(queueCall).toContain("gsp_name");
    expect(queueCall).toContain("Chapelcross");

    const dgCall = calls.find((u) =>
      u.includes("spd-dg-connections-network-info"),
    );
    expect(dgCall).toContain("Chapelcross");

    const curtailmentCall = calls.find((u) =>
      u.includes("capacity-management-system"),
    );
    expect(curtailmentCall).toContain("Chapelcross");
  });

  it("returns empty sections when all datasets return empty results", async () => {
    mockFetchEmptyResults();

    const result = await getSpenGridIntelligence({});

    expect(result.queue.total_projects).toBe(0);
    expect(result.queue.total_export_mw).toBe(0);
    expect(result.queue.type_breakdown).toEqual({});
    expect(result.queue.entries).toEqual([]);

    expect(result.dg_capacity.gsps_covered).toBe(0);
    expect(result.dg_capacity.entries).toEqual([]);

    expect(result.curtailment.total_events).toBe(0);
    expect(result.curtailment.total_generation_lost_mw).toBe(0);
    expect(result.curtailment.entries).toEqual([]);
  });

  it("handles partial failure gracefully (queue fails, others succeed)", async () => {
    mockFetchQueueFails();

    const result = await getSpenGridIntelligence({});

    // Queue section should be empty (failed gracefully)
    expect(result.queue.total_projects).toBe(0);
    expect(result.queue.entries).toEqual([]);

    // DG and curtailment should still have data
    expect(result.dg_capacity.entries).toHaveLength(2);
    expect(result.curtailment.entries).toHaveLength(3);
  });

  it("respects custom days parameter for curtailment", async () => {
    mockFetchAllOk();

    const result = await getSpenGridIntelligence({ days: 30 });

    expect(result.curtailment.period_days).toBe(30);

    // Verify the date filter was passed in the curtailment URL
    const fetchMock = vi.mocked(fetch);
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    const curtailmentCall = calls.find((u) =>
      u.includes("capacity-management-system"),
    );
    expect(curtailmentCall).toContain("date");
  });

  it("clamps days to max 365", async () => {
    mockFetchAllOk();

    const result = await getSpenGridIntelligence({ days: 999 });

    expect(result.curtailment.period_days).toBe(365);
  });

  it("caches results after first fetch", async () => {
    mockFetchAllOk();

    await getSpenGridIntelligence({});
    await getSpenGridIntelligence({});

    // Three datasets fetched once each (first call), then cache hits (second call)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
  });
});
