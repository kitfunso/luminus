import { describe, expect, it } from "vitest";
import { TOOL_KEY_REQUIREMENTS } from "./auth.js";
import { PROFILES } from "./profiles.js";

describe("GIS shortlist tool wiring", () => {
  it("exposes shortlist_bess_sites in the GIS and BESS profiles", () => {
    expect(PROFILES.gis).toContain("shortlist_bess_sites");
    expect(PROFILES.bess).toContain("shortlist_bess_sites");
  });

  it("requires the same ENTSO-E key as the underlying BESS revenue call", () => {
    expect(TOOL_KEY_REQUIREMENTS.shortlist_bess_sites).toEqual(["ENTSOE_API_KEY"]);
  });

  it("exposes public distribution headroom lookup in grid, GIS, and BESS profiles", () => {
    expect(PROFILES.grid).toContain("get_distribution_headroom");
    expect(PROFILES.gis).toContain("get_distribution_headroom");
    expect(PROFILES.bess).toContain("get_distribution_headroom");
    expect(TOOL_KEY_REQUIREMENTS.get_distribution_headroom).toEqual([]);
  });

  it("exposes the NGED public connection signal in the grid and GIS profiles", () => {
    expect(PROFILES.grid).toContain("get_nged_connection_signal");
    expect(PROFILES.gis).toContain("get_nged_connection_signal");
    expect(TOOL_KEY_REQUIREMENTS.get_nged_connection_signal).toEqual([]);
  });
});
