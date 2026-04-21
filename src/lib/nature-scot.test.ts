import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SCOTTISH_PROTECTED_AREA_LAYERS,
  queryScottishLayer,
} from "./nature-scot.js";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function makeArcGisResponse(features: unknown[]) {
  return {
    ok: true,
    json: async () => ({ features }),
  };
}

const SSSI_LAYER = SCOTTISH_PROTECTED_AREA_LAYERS.find(
  (l) => l.constraintType === "sssi",
)!;

const SAC_LAYER = SCOTTISH_PROTECTED_AREA_LAYERS.find(
  (l) => l.constraintType === "sac",
)!;

const SSSI_FEATURE = {
  attributes: {
    NAME: "Arthur's Seat Volcano",
    PA_CODE: "1242",
    SITE_HA: 71.8,
  },
};

const SSSI_FEATURE_NAME_MISSING = {
  attributes: {
    NAME: null,
    PA_CODE: "9999",
    SITE_HA: 12.34,
  },
};

describe("queryScottishLayer", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a valid ArcGIS response into ConstraintFeature[] with source nature-scot", async () => {
    fetchMock.mockImplementation(async () => makeArcGisResponse([SSSI_FEATURE]));

    const result = await queryScottishLayer(SSSI_LAYER, 55.9434, -3.1733, 2);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Arthur's Seat Volcano");
    expect(result[0].type).toBe("sssi");
    expect(result[0].area_ha).toBe(71.8);
    expect(result[0].source).toBe("nature-scot");
  });

  it("returns an empty array when the feature list is empty", async () => {
    fetchMock.mockImplementation(async () => makeArcGisResponse([]));

    const result = await queryScottishLayer(SAC_LAYER, 56.0, -4.0, 2);

    expect(result).toEqual([]);
  });

  it("throws with a message mentioning NatureScot on HTTP 503", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 503,
      text: async () => "Service unavailable",
    }));

    await expect(
      queryScottishLayer(SSSI_LAYER, 55.9434, -3.1733, 2),
    ).rejects.toThrow(/NatureScot/);
  });

  it("falls back to PA_CODE when NAME is missing", async () => {
    fetchMock.mockImplementation(async () =>
      makeArcGisResponse([SSSI_FEATURE_NAME_MISSING]),
    );

    const result = await queryScottishLayer(SSSI_LAYER, 55.9434, -3.1733, 2);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("9999");
  });
});
