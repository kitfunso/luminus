import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all upstream tools before importing the module under test.
vi.mock("./solar.js", () => ({
  getSolarIrradiance: vi.fn(),
}));
vi.mock("./prices.js", () => ({
  getDayAheadPrices: vi.fn(),
}));
vi.mock("./price-spread-analysis.js", () => ({
  getPriceSpreadAnalysis: vi.fn(),
}));
vi.mock("./terrain-analysis.js", () => ({
  getTerrainAnalysis: vi.fn(),
}));

import { estimateSiteRevenue } from "./site-revenue.js";
import { getSolarIrradiance } from "./solar.js";
import { getDayAheadPrices } from "./prices.js";
import { getPriceSpreadAnalysis } from "./price-spread-analysis.js";
import { getTerrainAnalysis } from "./terrain-analysis.js";

const mockSolar = vi.mocked(getSolarIrradiance);
const mockPrices = vi.mocked(getDayAheadPrices);
const mockSpread = vi.mocked(getPriceSpreadAnalysis);
const mockTerrain = vi.mocked(getTerrainAnalysis);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSolarResponse(annualYield = 1100) {
  return {
    lat: 51.5,
    lon: -0.1,
    optimal_angle_deg: 37,
    annual_irradiance_kwh_m2: 1200,
    annual_yield_kwh: annualYield,
    monthly: [],
    source_metadata: { name: "PVGIS", url: "https://pvgis.eu", license: "free" },
  } as Awaited<ReturnType<typeof getSolarIrradiance>>;
}

function makePriceResponse() {
  // 24 hours, daylight hours (7-19) average ~60 EUR/MWh
  const prices = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    price_eur_mwh: hour >= 7 && hour <= 19 ? 60 : 30,
  }));
  return {
    zone: "GB",
    start_date: "2026-03-31",
    end_date: "2026-03-31",
    currency: "EUR",
    prices,
    stats: { min: 30, max: 60, mean: 47.5 },
  } as Awaited<ReturnType<typeof getDayAheadPrices>>;
}

function makeSpreadResponse() {
  return {
    zone: "GB",
    date: "2026-03-31",
    efficiency: 0.88,
    targetCycles: 2,
    grossSpread: 40,
    netSpread: 25.2,
    revenuePerMwDay: 50.4,
    signal: "moderate_arb" as const,
    peakPrice: 80,
    offPeakPrice: 30,
    schedule: [],
  } as Awaited<ReturnType<typeof getPriceSpreadAnalysis>>;
}

function makeTerrainResponse() {
  return {
    lat: 51.5,
    lon: -0.1,
    elevation_m: 45,
    slope_deg: 2.1,
    aspect_deg: 180,
    aspect_cardinal: "S",
    flatness_score: 0.98,
    source: "open-meteo-elevation",
    source_metadata: { name: "Open-Meteo", url: "https://open-meteo.com", license: "free" },
  } as Awaited<ReturnType<typeof getTerrainAnalysis>>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("estimateSiteRevenue", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockTerrain.mockResolvedValue(makeTerrainResponse());
  });

  // ---- PV mode ----

  describe("PV mode", () => {
    beforeEach(() => {
      mockSolar.mockResolvedValue(makeSolarResponse());
      mockPrices.mockResolvedValue(makePriceResponse());
    });

    it("returns generation, capture price, and annual revenue", async () => {
      const result = await estimateSiteRevenue({
        lat: 51.5,
        lon: -0.1,
        zone: "GB",
        technology: "pv",
        capacity_mw: 10,
        date: "2026-03-31",
      });

      expect(result.technology).toBe("pv");
      expect(result.revenue.annual_generation_mwh).toBeDefined();
      expect(result.revenue.annual_generation_mwh).toBeGreaterThan(0);
      expect(result.revenue.capture_price_eur_mwh).toBeDefined();
      expect(result.revenue.capture_price_eur_mwh).toBe(60);
      expect(result.revenue.estimated_annual_revenue_eur).toBeDefined();
      expect(result.revenue.estimated_annual_revenue_eur).toBeGreaterThan(0);
      expect(result.revenue.capacity_factor).toBeDefined();
      expect(result.revenue.capacity_factor).toBeGreaterThan(0);
      expect(result.revenue.capacity_factor).toBeLessThan(1);
    });

    it("computes annual_generation_mwh = capacity_mw * annual_yield_kwh", async () => {
      // capacity_mw=10, annual_yield=1100 kWh/kWp
      // annual_generation_mwh = 10 * 1000 * (1100/1000) = 11000
      const result = await estimateSiteRevenue({
        lat: 51.5,
        lon: -0.1,
        zone: "GB",
        technology: "pv",
        capacity_mw: 10,
        date: "2026-03-31",
      });

      expect(result.revenue.annual_generation_mwh).toBe(11000);
    });

    it("computes annual revenue = generation * capture_price / 1000", async () => {
      const result = await estimateSiteRevenue({
        lat: 51.5,
        lon: -0.1,
        zone: "GB",
        technology: "pv",
        capacity_mw: 10,
        date: "2026-03-31",
      });

      // 11000 MWh * 60 EUR/MWh / 1000 = 660 EUR
      expect(result.revenue.estimated_annual_revenue_eur).toBe(660);
    });

    it("does not include BESS-specific fields", async () => {
      const result = await estimateSiteRevenue({
        lat: 51.5,
        lon: -0.1,
        zone: "GB",
        technology: "pv",
      });

      expect(result.revenue.daily_spread_eur_mwh).toBeUndefined();
      expect(result.revenue.daily_revenue_eur).toBeUndefined();
      expect(result.revenue.arb_signal).toBeUndefined();
    });
  });

  // ---- BESS mode ----

  describe("BESS mode", () => {
    beforeEach(() => {
      mockSpread.mockResolvedValue(makeSpreadResponse());
    });

    it("returns spread, daily revenue, and arb signal", async () => {
      const result = await estimateSiteRevenue({
        lat: 51.5,
        lon: -0.1,
        zone: "GB",
        technology: "bess",
        capacity_mw: 10,
        date: "2026-03-31",
      });

      expect(result.technology).toBe("bess");
      expect(result.revenue.daily_spread_eur_mwh).toBe(25.2);
      expect(result.revenue.daily_revenue_eur).toBe(504);
      expect(result.revenue.arb_signal).toBe("moderate_arb");
      expect(result.revenue.estimated_annual_revenue_eur).toBe(183960);
    });

    it("computes annual revenue = daily_revenue * 365", async () => {
      const result = await estimateSiteRevenue({
        lat: 51.5,
        lon: -0.1,
        zone: "GB",
        technology: "bess",
        capacity_mw: 10,
        date: "2026-03-31",
      });

      const expectedDaily = 50.4 * 10; // revenuePerMwDay * capacity_mw
      expect(result.revenue.estimated_annual_revenue_eur).toBe(
        Math.round(expectedDaily * 365 * 100) / 100,
      );
    });

    it("does not include PV-specific fields", async () => {
      const result = await estimateSiteRevenue({
        lat: 51.5,
        lon: -0.1,
        zone: "GB",
        technology: "bess",
      });

      expect(result.revenue.annual_generation_mwh).toBeUndefined();
      expect(result.revenue.capacity_factor).toBeUndefined();
      expect(result.revenue.capture_price_eur_mwh).toBeUndefined();
    });
  });

  // ---- Defaults ----

  it("uses default capacity_mw of 10", async () => {
    mockSolar.mockResolvedValue(makeSolarResponse());
    mockPrices.mockResolvedValue(makePriceResponse());

    const result = await estimateSiteRevenue({
      lat: 51.5,
      lon: -0.1,
      zone: "GB",
      technology: "pv",
    });

    expect(result.capacity_mw).toBe(10);
  });

  // ---- Caveats ----

  it("always includes common caveats for PV", async () => {
    mockSolar.mockResolvedValue(makeSolarResponse());
    mockPrices.mockResolvedValue(makePriceResponse());

    const result = await estimateSiteRevenue({
      lat: 51.5,
      lon: -0.1,
      zone: "GB",
      technology: "pv",
    });

    expect(result.caveats).toContain(
      "Revenue estimate uses a single day's price curve, not historical averages",
    );
    expect(result.caveats).toContain(
      "No degradation, curtailment, or network losses modeled",
    );
    expect(result.caveats).toContain("Grid connection costs are not included");
    expect(result.caveats).toContain(
      "Capture price uses daylight hours (07:00-19:00) as a simple proxy",
    );
    expect(result.disclaimer).toBeTruthy();
  });

  it("always includes common caveats for BESS", async () => {
    mockSpread.mockResolvedValue(makeSpreadResponse());

    const result = await estimateSiteRevenue({
      lat: 51.5,
      lon: -0.1,
      zone: "GB",
      technology: "bess",
    });

    expect(result.caveats).toContain(
      "Revenue estimate uses a single day's price curve, not historical averages",
    );
    expect(result.caveats).toContain(
      "Arbitrage assumes optimal dispatch with perfect foresight",
    );
    expect(result.disclaimer).toBeTruthy();
  });

  // ---- Terrain failure is non-blocking ----

  it("terrain failure does not block PV revenue calculation", async () => {
    mockSolar.mockResolvedValue(makeSolarResponse());
    mockPrices.mockResolvedValue(makePriceResponse());
    mockTerrain.mockRejectedValue(new Error("Elevation API down"));

    const result = await estimateSiteRevenue({
      lat: 51.5,
      lon: -0.1,
      zone: "GB",
      technology: "pv",
    });

    expect(result.terrain).toBeNull();
    expect(result.revenue.estimated_annual_revenue_eur).toBeGreaterThan(0);
  });

  it("terrain failure does not block BESS revenue calculation", async () => {
    mockSpread.mockResolvedValue(makeSpreadResponse());
    mockTerrain.mockRejectedValue(new Error("Elevation API down"));

    const result = await estimateSiteRevenue({
      lat: 51.5,
      lon: -0.1,
      zone: "GB",
      technology: "bess",
    });

    expect(result.terrain).toBeNull();
    expect(result.revenue.estimated_annual_revenue_eur).toBeGreaterThan(0);
  });

  // ---- Price/solar failure throws ----

  it("throws clearly when solar data fails (PV)", async () => {
    mockSolar.mockRejectedValue(new Error("PVGIS returned 500"));
    mockPrices.mockResolvedValue(makePriceResponse());

    await expect(
      estimateSiteRevenue({ lat: 51.5, lon: -0.1, zone: "GB", technology: "pv" }),
    ).rejects.toThrow("Solar irradiance lookup failed");
  });

  it("throws clearly when price data fails (PV)", async () => {
    mockSolar.mockResolvedValue(makeSolarResponse());
    mockPrices.mockRejectedValue(new Error("ENTSO-E returned 401"));

    await expect(
      estimateSiteRevenue({ lat: 51.5, lon: -0.1, zone: "GB", technology: "pv" }),
    ).rejects.toThrow("Day-ahead price lookup failed");
  });

  it("throws clearly when spread analysis fails (BESS)", async () => {
    mockSpread.mockRejectedValue(new Error("ENTSO-E returned 401"));

    await expect(
      estimateSiteRevenue({ lat: 51.5, lon: -0.1, zone: "GB", technology: "bess" }),
    ).rejects.toThrow("Price spread analysis failed");
  });

  // ---- Price snapshot ----

  it("includes price_snapshot for PV", async () => {
    mockSolar.mockResolvedValue(makeSolarResponse());
    mockPrices.mockResolvedValue(makePriceResponse());

    const result = await estimateSiteRevenue({
      lat: 51.5,
      lon: -0.1,
      zone: "GB",
      technology: "pv",
    });

    expect(result.price_snapshot).not.toBeNull();
    expect(result.price_snapshot!.date).toBe("2026-03-31");
    expect(result.price_snapshot!.peak_eur_mwh).toBe(60);
    expect(result.price_snapshot!.off_peak_eur_mwh).toBe(30);
  });

  it("includes price_snapshot for BESS", async () => {
    mockSpread.mockResolvedValue(makeSpreadResponse());

    const result = await estimateSiteRevenue({
      lat: 51.5,
      lon: -0.1,
      zone: "GB",
      technology: "bess",
    });

    expect(result.price_snapshot).not.toBeNull();
    expect(result.price_snapshot!.peak_eur_mwh).toBe(80);
    expect(result.price_snapshot!.off_peak_eur_mwh).toBe(30);
  });

  // ---- Terrain present ----

  it("includes terrain data when available", async () => {
    mockSolar.mockResolvedValue(makeSolarResponse());
    mockPrices.mockResolvedValue(makePriceResponse());

    const result = await estimateSiteRevenue({
      lat: 51.5,
      lon: -0.1,
      zone: "GB",
      technology: "pv",
    });

    expect(result.terrain).toEqual({
      elevation_m: 45,
      slope_deg: 2.1,
      aspect_cardinal: "S",
    });
  });
});
