import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lccodeToLabel, queryLcaAtPoint } from "./james-hutton-lca.js";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function makeArcGisResponse(features: unknown[]) {
  return {
    ok: true,
    json: async () => ({ features }),
  };
}

function makeFeature(lccode: number | string, areaM2: number) {
  return {
    attributes: {
      LCCODE: lccode,
      AreaM2: areaM2,
    },
  };
}

/**
 * Route the mocked fetch by URL host-path so 50k and 250k can return
 * independent responses within one test.
 */
function routeFetch(
  fiftyK: () => Promise<unknown>,
  twoFiftyK: () => Promise<unknown>,
) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("Hutton_LCA_50K_OSGB")) return fiftyK();
    if (url.includes("Hutton_LCA250K_UKSO")) return twoFiftyK();
    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

describe("lccodeToLabel", () => {
  it("maps numeric 31 to 3.1 and marks agricultural", () => {
    const result = lccodeToLabel(31);
    expect(result.class_label).toBe("3.1");
    expect(result.is_agricultural).toBe(true);
  });

  it("maps string '31' to 3.1 and marks agricultural", () => {
    const result = lccodeToLabel("31");
    expect(result.class_label).toBe("3.1");
    expect(result.is_agricultural).toBe(true);
  });

  it("maps numeric 888 to Built-up area and marks non-agricultural", () => {
    const result = lccodeToLabel(888);
    expect(result.class_label).toBe("Built-up area");
    expect(result.is_agricultural).toBe(false);
  });

  it("maps numeric 7 to '7' and marks agricultural (BMV no via queryLcaAtPoint)", () => {
    const result = lccodeToLabel(7);
    expect(result.class_label).toBe("7");
    expect(result.is_agricultural).toBe(true);
  });

  it("passes through an already-decimal string like '3.1' unchanged", () => {
    const result = lccodeToLabel("3.1");
    expect(result.class_label).toBe("3.1");
    expect(result.is_agricultural).toBe(true);
  });
});

describe("queryLcaAtPoint", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("populates both detailed (50k) and broad (250k) when both return features, preferring 50k", async () => {
    routeFetch(
      async () => makeArcGisResponse([makeFeature(31, 1234.5)]),
      async () => makeArcGisResponse([makeFeature(32, 8765.4)]),
    );

    const result = await queryLcaAtPoint(55.9434, -3.1733);

    expect(result.detailed).not.toBeNull();
    expect(result.detailed?.source).toBe("50k");
    expect(result.detailed?.class_label).toBe("3.1");
    expect(result.detailed?.area_m2).toBe(1234.5);

    expect(result.broad).not.toBeNull();
    expect(result.broad?.source).toBe("250k");
    expect(result.broad?.class_label).toBe("3.2");

    expect(result.effective_source).toBe("50k");
    expect(result.effective_class).toBe("3.1");
    expect(result.classification_basis).toBe("detailed");
    expect(result.bmv_status).toBe("yes"); // 3.1 is BMV
  });

  it("falls back to broad (250k) when 50k has no features", async () => {
    routeFetch(
      async () => makeArcGisResponse([]),
      async () => makeArcGisResponse([makeFeature(42, 500)]),
    );

    const result = await queryLcaAtPoint(57.5, -5.0);

    expect(result.detailed).toBeNull();
    expect(result.broad).not.toBeNull();
    expect(result.broad?.class_label).toBe("4.2");
    expect(result.effective_source).toBe("250k");
    expect(result.classification_basis).toBe("broad");
    expect(result.bmv_status).toBe("no");
  });

  it("returns bmv_status 'yes' when both services return LCCODE 1", async () => {
    // Use distinct coordinates to avoid the module-level TtlCache hitting
    // a result from a prior test.
    routeFetch(
      async () => makeArcGisResponse([makeFeature(1, 100)]),
      async () => makeArcGisResponse([makeFeature(1, 200)]),
    );

    const result = await queryLcaAtPoint(56.1, -4.1);

    expect(result.detailed?.class_label).toBe("1");
    expect(result.broad?.class_label).toBe("1");
    expect(result.effective_class).toBe("1");
    expect(result.bmv_status).toBe("yes");
  });

  it("marks non-agricultural and unknown BMV when 50k returns 888 (built-up)", async () => {
    routeFetch(
      async () => makeArcGisResponse([makeFeature(888, 321)]),
      async () => makeArcGisResponse([]),
    );

    const result = await queryLcaAtPoint(55.9533, -3.1883);

    expect(result.detailed).not.toBeNull();
    expect(result.detailed?.class_label).toBe("Built-up area");
    expect(result.detailed?.is_agricultural).toBe(false);
    expect(result.bmv_status).toBe("unknown");
    expect(result.classification_basis).toBe("detailed");
  });

  it("returns LCCODE 7 with bmv_status 'no' end-to-end", async () => {
    routeFetch(
      async () => makeArcGisResponse([]),
      async () => makeArcGisResponse([makeFeature(7, 10000)]),
    );

    const result = await queryLcaAtPoint(58.0, -4.5);

    expect(result.broad?.class_label).toBe("7");
    expect(result.broad?.is_agricultural).toBe(true);
    expect(result.bmv_status).toBe("no");
  });

  it("returns classification when one service fails and the other succeeds", async () => {
    routeFetch(
      async () => {
        throw new Error("50k network error");
      },
      async () => makeArcGisResponse([makeFeature(2, 500)]),
    );

    const result = await queryLcaAtPoint(56.5, -3.5);

    expect(result.detailed).toBeNull();
    expect(result.broad?.class_label).toBe("2");
    expect(result.effective_source).toBe("250k");
    expect(result.bmv_status).toBe("yes");
  });

  it("throws when both services fail", async () => {
    routeFetch(
      async () => {
        throw new Error("50k down");
      },
      async () => {
        throw new Error("250k down");
      },
    );

    await expect(queryLcaAtPoint(56.9, -3.9)).rejects.toThrow(
      /All James Hutton LCA queries failed/,
    );
  });
});
