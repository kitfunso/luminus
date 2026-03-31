import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the underlying tool modules before importing screen-site
vi.mock("./terrain-analysis.js", () => ({
  getTerrainAnalysis: vi.fn(),
  terrainAnalysisSchema: {} as any,
}));
vi.mock("./grid-proximity.js", () => ({
  getGridProximity: vi.fn(),
  gridProximitySchema: {} as any,
}));
vi.mock("./solar.js", () => ({
  getSolarIrradiance: vi.fn(),
  solarSchema: {} as any,
}));
vi.mock("./land-constraints.js", () => ({
  getLandConstraints: vi.fn(),
  landConstraintsSchema: {} as any,
}));
vi.mock("./agricultural-land.js", () => ({
  getAgriculturalLand: vi.fn(),
  agriculturalLandSchema: {} as any,
}));
vi.mock("./flood-risk.js", () => ({
  getFloodRisk: vi.fn(),
  floodRiskSchema: {} as any,
}));
vi.mock("./land-cover.js", () => ({
  getLandCover: vi.fn(),
  landCoverSchema: {} as any,
}));

import { screenSite } from "./screen-site.js";
import { getTerrainAnalysis } from "./terrain-analysis.js";
import { getGridProximity } from "./grid-proximity.js";
import { getSolarIrradiance } from "./solar.js";
import { getLandConstraints } from "./land-constraints.js";
import { getAgriculturalLand } from "./agricultural-land.js";
import { getFloodRisk } from "./flood-risk.js";
import { getLandCover } from "./land-cover.js";

const terrainMock = vi.mocked(getTerrainAnalysis);
const gridMock = vi.mocked(getGridProximity);
const solarMock = vi.mocked(getSolarIrradiance);
const constraintsMock = vi.mocked(getLandConstraints);
const agriculturalLandMock = vi.mocked(getAgriculturalLand);
const floodRiskMock = vi.mocked(getFloodRisk);
const landCoverMock = vi.mocked(getLandCover);

// --- Fixtures ---

const FLAT_TERRAIN = {
  lat: 52.0,
  lon: 0.5,
  elevation_m: 45,
  slope_deg: 1.2,
  aspect_deg: 180,
  aspect_cardinal: "S",
  flatness_score: 0.99,
  source: "open-meteo-elevation",
};

const STEEP_TERRAIN = {
  ...FLAT_TERRAIN,
  slope_deg: 18,
  flatness_score: 0.8,
};

const GOOD_GRID = {
  lat: 52.0,
  lon: 0.5,
  radius_km: 5,
  substations: [
    { name: "Test Sub", voltage_kv: 132, operator: "UKPN", distance_km: 1.5, lat: 52.01, lon: 0.51 },
  ],
  lines: [
    { voltage_kv: 132, operator: "UKPN", distance_km: 0.8, cables: 3 },
  ],
  summary: {
    nearest_substation_km: 1.5,
    nearest_line_km: 0.8,
    max_nearby_voltage_kv: 132,
  },
};

const NO_GRID = {
  lat: 52.0,
  lon: 0.5,
  radius_km: 5,
  substations: [],
  lines: [],
  summary: {
    nearest_substation_km: null,
    nearest_line_km: null,
    max_nearby_voltage_kv: null,
  },
};

const GOOD_SOLAR = {
  lat: 52.0,
  lon: 0.5,
  optimal_angle_deg: 37,
  annual_irradiance_kwh_m2: 1150,
  annual_yield_kwh: 990,
  monthly: [],
};

const LOW_SOLAR = {
  ...GOOD_SOLAR,
  annual_irradiance_kwh_m2: 700,
  annual_yield_kwh: 580,
};

const NO_CONSTRAINTS = {
  lat: 52.0,
  lon: 0.5,
  radius_km: 2,
  country: "GB",
  constraints: [],
  summary: { has_hard_constraint: false, constraint_count: 0 },
};

const SSSI_CONSTRAINT = {
  lat: 52.0,
  lon: 0.5,
  radius_km: 2,
  country: "GB",
  constraints: [{ name: "Test SSSI", type: "sssi", area_ha: 100, source: "natural-england" }],
  summary: { has_hard_constraint: true, constraint_count: 1 },
};

const NO_BMV = {
  lat: 52.0,
  lon: 0.5,
  country: "GB",
  post_1988: null,
  provisional: null,
  effective_grade: null,
  bmv_status: "unknown",
  classification_basis: "none",
  explanation: "No ALC polygon matched this point.",
};

const BMV_YES = {
  lat: 52.0,
  lon: 0.5,
  country: "GB",
  post_1988: { source: "post_1988", grade: "Grade 3a", area_ha: 5.5, survey_ref: "Leeds" },
  provisional: { source: "provisional", grade: "Grade 2", area_ha: 12.3, survey_ref: "TG2" },
  effective_grade: "Grade 3a",
  bmv_status: "yes",
  classification_basis: "post_1988",
  explanation: "Detailed post-1988 ALC survey classifies this site as Grade 3a.",
};

const BMV_UNCERTAIN = {
  lat: 52.0,
  lon: 0.5,
  country: "GB",
  post_1988: null,
  provisional: { source: "provisional", grade: "Grade 3", area_ha: 12.3, survey_ref: "TG2" },
  effective_grade: "Grade 3",
  bmv_status: "uncertain",
  classification_basis: "provisional",
  explanation: "Grade 3 cannot distinguish 3a from 3b.",
};

const FLOOD_CLEAR = {
  lat: 52.0,
  lon: 0.5,
  country: "GB",
  flood_zone: "1",
  flood_storage_area: false,
  planning_risk: "low",
  flood_zone_3: [],
  flood_zone_2: [],
  flood_storage_areas: [],
  explanation: "No flood-planning layers intersect this point.",
};

const FLOOD_ZONE_2 = {
  lat: 52.0,
  lon: 0.5,
  country: "GB",
  flood_zone: "2",
  flood_storage_area: false,
  planning_risk: "medium",
  flood_zone_3: [],
  flood_zone_2: [{ layer: "flood_zone_2", label: "Flood Zone 2", type: "Rivers and Sea", area_ha: 10 }],
  flood_storage_areas: [],
  explanation: "Point is in Flood Zone 2.",
};

const FLOOD_ZONE_3 = {
  lat: 52.0,
  lon: 0.5,
  country: "GB",
  flood_zone: "3",
  flood_storage_area: false,
  planning_risk: "high",
  flood_zone_3: [{ layer: "flood_zone_3", label: "Flood Zone 3", type: "Tidal Models", area_ha: 10 }],
  flood_zone_2: [{ layer: "flood_zone_2", label: "Flood Zone 2", type: "Tidal Models", area_ha: 12 }],
  flood_storage_areas: [],
  explanation: "Point is in Flood Zone 3.",
};

const FLOOD_STORAGE = {
  lat: 52.0,
  lon: 0.5,
  country: "GB",
  flood_zone: "1",
  flood_storage_area: true,
  planning_risk: "high",
  flood_zone_3: [],
  flood_zone_2: [],
  flood_storage_areas: [{ layer: "flood_storage_area", label: "Flood Storage Areas", type: null, area_ha: 4 }],
  explanation: "Point intersects a flood storage area.",
};

const GOOD_LAND_COVER = {
  lat: 52.0,
  lon: 13.4,
  country: "DE",
  land_cover: {
    code: "211",
    label: "Non-irrigated arable land",
    class_group: "Agricultural areas",
    is_planning_exclusion: false,
    source: "corine-land-cover-2018",
  },
  coverage_note: null,
  source_metadata: { id: "corine-land-cover" },
};

const EXCLUSION_LAND_COVER = {
  lat: 52.0,
  lon: 13.4,
  country: "DE",
  land_cover: {
    code: "411",
    label: "Inland marshes",
    class_group: "Wetlands",
    is_planning_exclusion: true,
    source: "corine-land-cover-2018",
  },
  coverage_note: null,
  source_metadata: { id: "corine-land-cover" },
};

const EU_NO_CONSTRAINTS = {
  lat: 52.0,
  lon: 13.4,
  radius_km: 2,
  country: "DE",
  constraints: [],
  summary: { has_hard_constraint: false, constraint_count: 0 },
};

function setupMocks(overrides: {
  terrain?: any;
  grid?: any;
  solar?: any;
  constraints?: any;
  agriculturalLand?: any;
  floodRisk?: any;
  landCover?: any;
} = {}) {
  terrainMock.mockResolvedValue(overrides.terrain ?? FLAT_TERRAIN);
  gridMock.mockResolvedValue(overrides.grid ?? GOOD_GRID);
  solarMock.mockResolvedValue(overrides.solar ?? GOOD_SOLAR);
  constraintsMock.mockResolvedValue(overrides.constraints ?? NO_CONSTRAINTS);
  agriculturalLandMock.mockResolvedValue(overrides.agriculturalLand ?? NO_BMV);
  floodRiskMock.mockResolvedValue(overrides.floodRisk ?? FLOOD_CLEAR);
  landCoverMock.mockResolvedValue(overrides.landCover ?? GOOD_LAND_COVER);
}

describe("screenSite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Validation ---

  it("rejects invalid latitude", async () => {
    await expect(
      screenSite({ lat: 95, lon: 0, country: "GB" }),
    ).rejects.toThrow("Latitude must be between -90 and 90");
  });

  it("rejects invalid longitude", async () => {
    await expect(
      screenSite({ lat: 51, lon: 200, country: "GB" }),
    ).rejects.toThrow("Longitude must be between -180 and 180");
  });

  it("rejects unsupported country code", async () => {
    await expect(
      screenSite({ lat: 40.71, lon: -74.01, country: "US" }),
    ).rejects.toThrow('Country "US" is not supported');
  });

  it("rejects radius_km > 10", async () => {
    await expect(
      screenSite({ lat: 51, lon: -1, radius_km: 15, country: "GB" }),
    ).rejects.toThrow("radius_km must be between 0 and 10");
  });

  // --- Happy path ---

  it("returns structured summary for a good UK site", async () => {
    setupMocks();
    const result = await screenSite({ lat: 52.0, lon: 0.5, country: "GB" });

    expect(result.lat).toBe(52.0);
    expect(result.lon).toBe(0.5);
    expect(result.country).toBe("GB");
    expect(result.terrain).toBeDefined();
    expect(result.grid).toBeDefined();
    expect(result.solar).toBeDefined();
    expect(result.constraints).toBeDefined();
    expect(result.agricultural_land).toBeDefined();
    expect(result.flood_risk).toBeDefined();
    expect(result.verdict).toBeDefined();
    expect(result.verdict.overall).toBeDefined();
    expect(result.layers_available).toEqual(["terrain", "grid", "solar", "constraints", "agricultural_land", "flood_risk"]);
    expect(result.layers_unavailable).toEqual({
      land_cover:
        "CORINE 2018 does not cover Great Britain. " +
        "Agricultural land classification (agricultural_land layer) provides partial land-use context for England. " +
        "A future integration with the UKCEH Land Cover Map could fill this gap.",
    });
  });

  it("calls all six underlying tools", async () => {
    setupMocks();
    await screenSite({ lat: 52.0, lon: 0.5, country: "GB" });

    expect(terrainMock).toHaveBeenCalledOnce();
    expect(gridMock).toHaveBeenCalledOnce();
    expect(solarMock).toHaveBeenCalledOnce();
    expect(constraintsMock).toHaveBeenCalledOnce();
    expect(agriculturalLandMock).toHaveBeenCalledOnce();
    expect(floodRiskMock).toHaveBeenCalledOnce();
  });

  it("passes radius_km to grid and constraints", async () => {
    setupMocks();
    await screenSite({ lat: 52.0, lon: 0.5, radius_km: 5, country: "GB" });

    expect(gridMock).toHaveBeenCalledWith(
      expect.objectContaining({ radius_km: 5 }),
    );
    expect(constraintsMock).toHaveBeenCalledWith(
      expect.objectContaining({ radius_km: 5 }),
    );
  });

  // --- Verdict logic ---

  it("returns pass verdict for a clear flat site with good solar and grid", async () => {
    setupMocks();
    const result = await screenSite({ lat: 52.0, lon: 0.5, country: "GB" });

    expect(result.verdict.overall).toBe("pass");
    expect(result.verdict.flags).toHaveLength(0);
  });

  it("returns fail verdict when hard constraint exists", async () => {
    setupMocks({ constraints: SSSI_CONSTRAINT });
    const result = await screenSite({ lat: 52.0, lon: 0.5, country: "GB" });

    expect(result.verdict.overall).toBe("fail");
    expect(result.verdict.flags.some((f: any) => f.category === "constraints")).toBe(true);
  });

  it("returns warn verdict for steep terrain", async () => {
    setupMocks({ terrain: STEEP_TERRAIN });
    const result = await screenSite({ lat: 52.0, lon: 0.5, country: "GB" });

    expect(result.verdict.overall).toBe("warn");
    expect(result.verdict.flags.some((f: any) => f.category === "terrain")).toBe(true);
  });

  it("returns warn verdict when no grid infrastructure found", async () => {
    setupMocks({ grid: NO_GRID });
    const result = await screenSite({ lat: 52.0, lon: 0.5, country: "GB" });

    expect(result.verdict.overall).toBe("warn");
    expect(result.verdict.flags.some((f: any) => f.category === "grid")).toBe(true);
  });

  it("returns warn verdict for low solar irradiance", async () => {
    setupMocks({ solar: LOW_SOLAR });
    const result = await screenSite({ lat: 52.0, lon: 0.5, country: "GB" });

    expect(result.verdict.overall).toBe("warn");
    expect(result.verdict.flags.some((f: any) => f.category === "solar")).toBe(true);
  });

  it("returns warn verdict for confirmed BMV agricultural land", async () => {
    setupMocks({ agriculturalLand: BMV_YES });
    const result = await screenSite({ lat: 52.0, lon: 0.5, country: "GB" });

    expect(result.verdict.overall).toBe("warn");
    expect(result.verdict.flags.some((f: any) => f.category === "agricultural_land")).toBe(true);
  });

  it("returns warn verdict for uncertain Grade 3 agricultural land", async () => {
    setupMocks({ agriculturalLand: BMV_UNCERTAIN });
    const result = await screenSite({ lat: 52.0, lon: 0.5, country: "GB" });

    expect(result.verdict.overall).toBe("warn");
    expect(result.verdict.flags.some((f: any) => f.category === "agricultural_land")).toBe(true);
  });

  it("returns warn verdict for Flood Zone 2", async () => {
    setupMocks({ floodRisk: FLOOD_ZONE_2 });
    const result = await screenSite({ lat: 52.0, lon: 0.5, country: "GB" });

    expect(result.verdict.overall).toBe("warn");
    expect(result.verdict.flags.some((f: any) => f.category === "flood_risk")).toBe(true);
  });

  it("returns fail verdict for Flood Zone 3", async () => {
    setupMocks({ floodRisk: FLOOD_ZONE_3 });
    const result = await screenSite({ lat: 52.0, lon: 0.5, country: "GB" });

    expect(result.verdict.overall).toBe("fail");
    expect(result.verdict.flags.some((f: any) => f.category === "flood_risk")).toBe(true);
  });

  it("returns fail verdict for flood storage areas", async () => {
    setupMocks({ floodRisk: FLOOD_STORAGE });
    const result = await screenSite({ lat: 52.0, lon: 0.5, country: "GB" });

    expect(result.verdict.overall).toBe("fail");
    expect(result.verdict.flags.some((f: any) => f.category === "flood_risk")).toBe(true);
  });

  it("fail takes precedence over warn", async () => {
    setupMocks({ constraints: SSSI_CONSTRAINT, terrain: STEEP_TERRAIN, agriculturalLand: BMV_YES });
    const result = await screenSite({ lat: 52.0, lon: 0.5, country: "GB" });

    expect(result.verdict.overall).toBe("fail");
    expect(result.verdict.flags.length).toBeGreaterThanOrEqual(2);
  });

  // --- Partial failures ---

  it("still returns result when one sub-tool fails, with warning", async () => {
    setupMocks();
    solarMock.mockRejectedValue(new Error("PVGIS timeout"));

    const result = await screenSite({ lat: 52.0, lon: 0.5, country: "GB" });

    expect(result.solar).toBeNull();
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some((w: string) => w.includes("solar"))).toBe(true);
    expect(result.terrain).toBeDefined();
    expect(result.grid).toBeDefined();
  });

  it("throws when all sub-tools fail", async () => {
    terrainMock.mockRejectedValue(new Error("fail1"));
    gridMock.mockRejectedValue(new Error("fail2"));
    solarMock.mockRejectedValue(new Error("fail3"));
    constraintsMock.mockRejectedValue(new Error("fail4"));
    agriculturalLandMock.mockRejectedValue(new Error("fail5"));
    floodRiskMock.mockRejectedValue(new Error("fail6"));

    await expect(
      screenSite({ lat: 52.0, lon: 0.5, country: "GB" }),
    ).rejects.toThrow("All sub-queries failed");
  });

  // --- Defaults ---

  it("uses default radius_km of 2", async () => {
    setupMocks();
    const result = await screenSite({ lat: 52.0, lon: 0.5, country: "GB" });

    expect(result.radius_km).toBe(2);
  });

  it("accepts lowercase country code", async () => {
    setupMocks();
    const result = await screenSite({ lat: 52.0, lon: 0.5, country: "gb" });

    expect(result.country).toBe("GB");
  });

  // --- Source metadata ---

  it("includes source_metadata for all six providers", async () => {
    setupMocks();
    const result = await screenSite({ lat: 52.0, lon: 0.5, country: "GB" });

    expect(result.source_metadata).toBeDefined();
    expect(result.source_metadata.terrain.id).toBe("open-meteo-elevation");
    expect(result.source_metadata.grid.id).toBe("overpass-osm");
    expect(result.source_metadata.solar.id).toBe("pvgis");
    expect(result.source_metadata.constraints.id).toBe("natural-england");
    expect(result.source_metadata.agricultural_land.id).toBe("natural-england-alc");
    expect(result.source_metadata.flood_risk.id).toBe("ea-flood-map");

    for (const meta of Object.values(result.source_metadata)) {
      expect(meta.provider).toBeDefined();
      expect(meta.licence).toBeDefined();
      expect(meta.coverage).toBeDefined();
      expect(meta.reliability).toBeDefined();
      expect(meta.caveats.length).toBeGreaterThan(0);
      expect(meta.attribution).toBeDefined();
    }
  });

  // --- Disclaimer ---

  it("includes a screening disclaimer", async () => {
    setupMocks();
    const result = await screenSite({ lat: 52.0, lon: 0.5, country: "GB" });

    expect(result.disclaimer).toBeDefined();
    expect(result.disclaimer.length).toBeGreaterThan(0);
  });

  // --- EU screening ---

  describe("EU screening", () => {
    it("accepts an EU country code (DE)", async () => {
      setupMocks({ constraints: EU_NO_CONSTRAINTS });
      const result = await screenSite({ lat: 52.52, lon: 13.41, country: "DE" });

      expect(result.country).toBe("DE");
      expect(result.terrain).toBeDefined();
      expect(result.grid).toBeDefined();
      expect(result.solar).toBeDefined();
      expect(result.constraints).toBeDefined();
      expect(result.land_cover).toBeDefined();
    });

    it("calls terrain, grid, solar, constraints, and land_cover for EU", async () => {
      setupMocks({ constraints: EU_NO_CONSTRAINTS });
      await screenSite({ lat: 52.52, lon: 13.41, country: "DE" });

      expect(terrainMock).toHaveBeenCalledOnce();
      expect(gridMock).toHaveBeenCalledOnce();
      expect(solarMock).toHaveBeenCalledOnce();
      expect(constraintsMock).toHaveBeenCalledOnce();
      expect(landCoverMock).toHaveBeenCalledOnce();
    });

    it("does NOT call agricultural_land or flood_risk for EU", async () => {
      setupMocks({ constraints: EU_NO_CONSTRAINTS });
      await screenSite({ lat: 52.52, lon: 13.41, country: "DE" });

      expect(agriculturalLandMock).not.toHaveBeenCalled();
      expect(floodRiskMock).not.toHaveBeenCalled();
    });

    it("returns layers_available and layers_unavailable for EU", async () => {
      setupMocks({ constraints: EU_NO_CONSTRAINTS });
      const result = await screenSite({ lat: 52.52, lon: 13.41, country: "DE" });

      expect(result.layers_available).toEqual(["terrain", "grid", "solar", "constraints", "land_cover"]);
      expect(result.layers_unavailable).toEqual({
        agricultural_land: "England only — no equivalent EU source",
        flood_risk: "England only — no equivalent EU source",
      });
    });

    it("sets agricultural_land and flood_risk to null for EU", async () => {
      setupMocks({ constraints: EU_NO_CONSTRAINTS });
      const result = await screenSite({ lat: 52.52, lon: 13.41, country: "DE" });

      expect(result.agricultural_land).toBeNull();
      expect(result.flood_risk).toBeNull();
    });

    it("land_cover planning exclusion triggers a warn verdict", async () => {
      setupMocks({ constraints: EU_NO_CONSTRAINTS, landCover: EXCLUSION_LAND_COVER });
      const result = await screenSite({ lat: 52.52, lon: 13.41, country: "DE" });

      expect(result.verdict.overall).toBe("warn");
      expect(result.verdict.flags.some((f: any) => f.category === "land_cover" && f.level === "warn")).toBe(true);
    });

    it("uses Natura 2000 and CORINE source metadata for EU", async () => {
      setupMocks({ constraints: EU_NO_CONSTRAINTS });
      const result = await screenSite({ lat: 52.52, lon: 13.41, country: "DE" });

      expect(result.source_metadata.constraints.id).toBe("eea-natura2000");
      expect(result.source_metadata.land_cover?.id).toBe("corine-land-cover");
      expect(result.source_metadata.agricultural_land).toBeUndefined();
      expect(result.source_metadata.flood_risk).toBeUndefined();
    });

    it("still rejects unsupported country codes (US)", async () => {
      await expect(
        screenSite({ lat: 40.71, lon: -74.01, country: "US" }),
      ).rejects.toThrow('Country "US" is not supported');
    });
  });
});
