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
});
