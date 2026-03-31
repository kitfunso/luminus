import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock screen-site before importing compare-sites
vi.mock("./screen-site.js", () => ({
  screenSite: vi.fn(),
  screenSiteSchema: {} as any,
  EU_COUNTRY_CODES: new Set([
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
    "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
    "NL", "PL", "PT", "RO", "SE", "SI", "SK",
  ]),
}));

import { compareSites } from "./compare-sites.js";
import { screenSite } from "./screen-site.js";

const screenSiteMock = vi.mocked(screenSite);

// --- Fixtures ---

function makeScreenResult(overrides: {
  lat?: number;
  lon?: number;
  slopeDeg?: number;
  nearestSubKm?: number | null;
  nearestLineKm?: number | null;
  maxVoltageKv?: number | null;
  irradiance?: number;
  hasConstraint?: boolean;
  constraintCount?: number;
  overall?: "pass" | "warn" | "fail";
  flags?: any[];
  warnings?: string[];
} = {}) {
  const lat = overrides.lat ?? 52.0;
  const lon = overrides.lon ?? 0.5;
  const overall = overrides.overall ?? "pass";
  const flags = overrides.flags ?? [];

  return {
    lat,
    lon,
    radius_km: 2,
    country: "GB",
    terrain: {
      lat,
      lon,
      elevation_m: 45,
      slope_deg: overrides.slopeDeg ?? 1.2,
      aspect_deg: 180,
      aspect_cardinal: "S",
      flatness_score: 0.99,
      source: "open-meteo-elevation",
    },
    grid: {
      lat,
      lon,
      radius_km: 2,
      substations: overrides.nearestSubKm !== null
        ? [{ name: "Sub A", voltage_kv: overrides.maxVoltageKv ?? 132, operator: "UKPN", distance_km: overrides.nearestSubKm ?? 1.5, lat: lat + 0.01, lon: lon + 0.01 }]
        : [],
      lines: overrides.nearestLineKm !== null
        ? [{ voltage_kv: overrides.maxVoltageKv ?? 132, operator: "UKPN", distance_km: overrides.nearestLineKm ?? 0.8, cables: 3 }]
        : [],
      summary: {
        nearest_substation_km: overrides.nearestSubKm ?? 1.5,
        nearest_line_km: overrides.nearestLineKm ?? 0.8,
        max_nearby_voltage_kv: overrides.maxVoltageKv ?? 132,
      },
    },
    solar: {
      lat,
      lon,
      optimal_angle_deg: 37,
      annual_irradiance_kwh_m2: overrides.irradiance ?? 1150,
      annual_yield_kwh: 990,
      monthly: [],
    },
    constraints: {
      lat,
      lon,
      radius_km: 2,
      country: "GB",
      constraints: overrides.hasConstraint
        ? [{ name: "Test SSSI", type: "sssi", area_ha: 100, source: "natural-england" }]
        : [],
      summary: {
        has_hard_constraint: overrides.hasConstraint ?? false,
        constraint_count: overrides.constraintCount ?? 0,
      },
    },
    agricultural_land: {
      lat,
      lon,
      country: "GB",
      post_1988: null,
      provisional: null,
      effective_grade: null,
      bmv_status: "unknown",
      classification_basis: "none",
      explanation: "No ALC polygon matched this point.",
    },
    flood_risk: {
      lat,
      lon,
      country: "GB",
      flood_zone: "1",
      flood_storage_area: false,
      planning_risk: "low",
      flood_zone_3: [],
      flood_zone_2: [],
      flood_storage_areas: [],
      explanation: "Point is not in Flood Zone 2, Flood Zone 3, or a flood storage area.",
    },
    verdict: { overall, flags },
    source_metadata: {
      terrain: { id: "open-meteo-elevation" } as any,
      grid: { id: "overpass-osm" } as any,
      solar: { id: "pvgis" } as any,
      constraints: { id: "natural-england" } as any,
      agricultural_land: { id: "natural-england-alc" } as any,
      flood_risk: { id: "ea-flood-map" } as any,
    },
    disclaimer: "Test disclaimer",
    ...(overrides.warnings ? { warnings: overrides.warnings } : {}),
  };
}

const GOOD_SITE_A = makeScreenResult({ lat: 52.0, lon: 0.5, irradiance: 1200, nearestSubKm: 1.0, nearestLineKm: 0.5 });
const GOOD_SITE_B = makeScreenResult({ lat: 52.1, lon: 0.6, irradiance: 1100, nearestSubKm: 2.0, nearestLineKm: 1.2 });
const WARNED_SITE = makeScreenResult({
  lat: 52.2, lon: 0.7,
  slopeDeg: 15,
  overall: "warn",
  flags: [{ category: "terrain", level: "warn", reason: "Slope is 15 deg" }],
});
const FAILED_SITE = makeScreenResult({
  lat: 52.3, lon: 0.8,
  hasConstraint: true,
  constraintCount: 1,
  overall: "fail",
  flags: [{ category: "constraints", level: "fail", reason: "1 protected area(s)" }],
});

describe("compareSites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Validation ---

  it("rejects fewer than 2 sites", async () => {
    await expect(
      compareSites({ sites: [{ lat: 52, lon: 0.5 }], country: "GB" }),
    ).rejects.toThrow("At least 2 sites");
  });

  it("rejects more than 10 sites", async () => {
    const sites = Array.from({ length: 11 }, (_, i) => ({ lat: 52 + i * 0.01, lon: 0.5 }));
    await expect(
      compareSites({ sites, country: "GB" }),
    ).rejects.toThrow("at most 10");
  });

  it("rejects unsupported country code", async () => {
    await expect(
      compareSites({
        sites: [{ lat: 40.71, lon: -74.01 }, { lat: 40.75, lon: -73.98 }],
        country: "US",
      }),
    ).rejects.toThrow('not supported');
  });

  // --- Happy path ---

  it("returns ranked results for 2 sites", async () => {
    screenSiteMock
      .mockResolvedValueOnce(GOOD_SITE_A)
      .mockResolvedValueOnce(GOOD_SITE_B);

    const result = await compareSites({
      sites: [{ lat: 52.0, lon: 0.5 }, { lat: 52.1, lon: 0.6 }],
      country: "GB",
    });

    expect(result.rankings).toHaveLength(2);
    expect(result.rankings[0].rank).toBe(1);
    expect(result.rankings[1].rank).toBe(2);
    expect(result.site_count).toBe(2);
  });

  it("calls screenSite for each input site", async () => {
    screenSiteMock
      .mockResolvedValueOnce(GOOD_SITE_A)
      .mockResolvedValueOnce(GOOD_SITE_B);

    await compareSites({
      sites: [{ lat: 52.0, lon: 0.5 }, { lat: 52.1, lon: 0.6 }],
      country: "GB",
    });

    expect(screenSiteMock).toHaveBeenCalledTimes(2);
  });

  it("passes radius_km through to screenSite", async () => {
    screenSiteMock
      .mockResolvedValueOnce(GOOD_SITE_A)
      .mockResolvedValueOnce(GOOD_SITE_B);

    await compareSites({
      sites: [{ lat: 52.0, lon: 0.5 }, { lat: 52.1, lon: 0.6 }],
      country: "GB",
      radius_km: 5,
    });

    expect(screenSiteMock).toHaveBeenCalledWith(
      expect.objectContaining({ radius_km: 5 }),
    );
  });

  // --- Ranking logic ---

  it("ranks pass above warn", async () => {
    screenSiteMock
      .mockResolvedValueOnce(WARNED_SITE)
      .mockResolvedValueOnce(GOOD_SITE_A);

    const result = await compareSites({
      sites: [{ lat: 52.2, lon: 0.7 }, { lat: 52.0, lon: 0.5 }],
      country: "GB",
    });

    expect(result.rankings[0].verdict).toBe("pass");
    expect(result.rankings[1].verdict).toBe("warn");
  });

  it("ranks warn above fail", async () => {
    screenSiteMock
      .mockResolvedValueOnce(FAILED_SITE)
      .mockResolvedValueOnce(WARNED_SITE);

    const result = await compareSites({
      sites: [{ lat: 52.3, lon: 0.8 }, { lat: 52.2, lon: 0.7 }],
      country: "GB",
    });

    expect(result.rankings[0].verdict).toBe("warn");
    expect(result.rankings[1].verdict).toBe("fail");
  });

  it("ranks higher irradiance above lower when both pass", async () => {
    screenSiteMock
      .mockResolvedValueOnce(GOOD_SITE_B)  // 1100 kWh/m2
      .mockResolvedValueOnce(GOOD_SITE_A); // 1200 kWh/m2

    const result = await compareSites({
      sites: [{ lat: 52.1, lon: 0.6 }, { lat: 52.0, lon: 0.5 }],
      country: "GB",
    });

    // Site A (1200) should rank above Site B (1100)
    expect(result.rankings[0].solar_kwh_m2).toBe(1200);
    expect(result.rankings[1].solar_kwh_m2).toBe(1100);
  });

  it("ranks closer grid connection higher when irradiance is equal", async () => {
    const siteClose = makeScreenResult({ lat: 52.0, lon: 0.5, irradiance: 1100, nearestSubKm: 0.5, nearestLineKm: 0.3 });
    const siteFar = makeScreenResult({ lat: 52.1, lon: 0.6, irradiance: 1100, nearestSubKm: 5.0, nearestLineKm: 3.0 });

    screenSiteMock
      .mockResolvedValueOnce(siteFar)
      .mockResolvedValueOnce(siteClose);

    const result = await compareSites({
      sites: [{ lat: 52.1, lon: 0.6 }, { lat: 52.0, lon: 0.5 }],
      country: "GB",
    });

    expect(result.rankings[0].nearest_grid_km).toBeLessThan(result.rankings[1].nearest_grid_km!);
  });

  // --- Determinism ---

  it("produces deterministic rankings for identical inputs", async () => {
    screenSiteMock
      .mockResolvedValueOnce(GOOD_SITE_A)
      .mockResolvedValueOnce(GOOD_SITE_B);

    const result1 = await compareSites({
      sites: [{ lat: 52.0, lon: 0.5 }, { lat: 52.1, lon: 0.6 }],
      country: "GB",
    });

    screenSiteMock
      .mockResolvedValueOnce(GOOD_SITE_A)
      .mockResolvedValueOnce(GOOD_SITE_B);

    const result2 = await compareSites({
      sites: [{ lat: 52.0, lon: 0.5 }, { lat: 52.1, lon: 0.6 }],
      country: "GB",
    });

    expect(result1.rankings.map((r: any) => r.lat)).toEqual(
      result2.rankings.map((r: any) => r.lat),
    );
  });

  // --- Partial failures ---

  it("includes sites that partially failed screening with warnings", async () => {
    const partialSite = makeScreenResult({
      lat: 52.4, lon: 0.9,
      warnings: ["solar: PVGIS timeout"],
    });
    // null out solar to simulate partial failure
    (partialSite as any).solar = null;

    screenSiteMock
      .mockResolvedValueOnce(GOOD_SITE_A)
      .mockResolvedValueOnce(partialSite);

    const result = await compareSites({
      sites: [{ lat: 52.0, lon: 0.5 }, { lat: 52.4, lon: 0.9 }],
      country: "GB",
    });

    expect(result.rankings).toHaveLength(2);
    // The partial site should have a note about missing data
    const partialRank = result.rankings.find((r: any) => r.lat === 52.4);
    expect(partialRank).toBeDefined();
    expect(partialRank!.data_gaps).toBeDefined();
    expect(partialRank!.data_gaps.length).toBeGreaterThan(0);
  });

  it("excludes sites where screenSite throws entirely", async () => {
    screenSiteMock
      .mockResolvedValueOnce(GOOD_SITE_A)
      .mockRejectedValueOnce(new Error("All sub-queries failed"));

    const result = await compareSites({
      sites: [{ lat: 52.0, lon: 0.5 }, { lat: 52.5, lon: 1.0 }],
      country: "GB",
    });

    expect(result.rankings).toHaveLength(1);
    expect(result.failed_sites).toHaveLength(1);
    expect(result.failed_sites[0].lat).toBe(52.5);
  });

  it("throws when all sites fail screening", async () => {
    screenSiteMock
      .mockRejectedValueOnce(new Error("fail1"))
      .mockRejectedValueOnce(new Error("fail2"));

    await expect(
      compareSites({
        sites: [{ lat: 52.0, lon: 0.5 }, { lat: 52.1, lon: 0.6 }],
        country: "GB",
      }),
    ).rejects.toThrow("All sites failed");
  });

  // --- Output structure ---

  it("includes reasoning for each ranked site", async () => {
    screenSiteMock
      .mockResolvedValueOnce(GOOD_SITE_A)
      .mockResolvedValueOnce(GOOD_SITE_B);

    const result = await compareSites({
      sites: [{ lat: 52.0, lon: 0.5 }, { lat: 52.1, lon: 0.6 }],
      country: "GB",
    });

    for (const ranked of result.rankings) {
      expect(ranked.reasoning).toBeDefined();
      expect(ranked.reasoning.length).toBeGreaterThan(0);
    }
  });

  it("includes heuristics_used in the response", async () => {
    screenSiteMock
      .mockResolvedValueOnce(GOOD_SITE_A)
      .mockResolvedValueOnce(GOOD_SITE_B);

    const result = await compareSites({
      sites: [{ lat: 52.0, lon: 0.5 }, { lat: 52.1, lon: 0.6 }],
      country: "GB",
    });

    expect(result.heuristics_used).toBeDefined();
    expect(result.heuristics_used.length).toBeGreaterThan(0);
  });

  it("includes a disclaimer", async () => {
    screenSiteMock
      .mockResolvedValueOnce(GOOD_SITE_A)
      .mockResolvedValueOnce(GOOD_SITE_B);

    const result = await compareSites({
      sites: [{ lat: 52.0, lon: 0.5 }, { lat: 52.1, lon: 0.6 }],
      country: "GB",
    });

    expect(result.disclaimer).toBeDefined();
    expect(result.disclaimer.length).toBeGreaterThan(0);
  });

  // --- Labels ---

  it("uses site labels if provided", async () => {
    screenSiteMock
      .mockResolvedValueOnce(GOOD_SITE_A)
      .mockResolvedValueOnce(GOOD_SITE_B);

    const result = await compareSites({
      sites: [
        { lat: 52.0, lon: 0.5, label: "Field North" },
        { lat: 52.1, lon: 0.6, label: "Field South" },
      ],
      country: "GB",
    });

    expect(result.rankings[0].label).toBeDefined();
    expect(result.rankings[1].label).toBeDefined();
  });

  it("generates default labels when none provided", async () => {
    screenSiteMock
      .mockResolvedValueOnce(GOOD_SITE_A)
      .mockResolvedValueOnce(GOOD_SITE_B);

    const result = await compareSites({
      sites: [{ lat: 52.0, lon: 0.5 }, { lat: 52.1, lon: 0.6 }],
      country: "GB",
    });

    expect(result.rankings[0].label).toMatch(/Site/);
    expect(result.rankings[1].label).toMatch(/Site/);
  });
});
