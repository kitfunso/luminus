/**
 * Live integration tests for lookupGspRegion against the real NESO endpoints.
 *
 * These tests make actual network calls and are intentionally excluded from
 * normal CI runs. To run them locally:
 *
 *   LUMINUS_RUN_INTEGRATION=1 npx vitest run src/lib/neso-gsp.integration.test.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import { lookupGspRegion, resetGspCacheForTests } from "./neso-gsp.js";

const RUN = process.env.LUMINUS_RUN_INTEGRATION === "1";

describe.skipIf(!RUN)("lookupGspRegion -- live NESO integration", () => {
  beforeEach(() => {
    resetGspCacheForTests();
  });

  it(
    "Berkswell (52.39, -1.64) resolves to a BESW GSP within 5 km",
    async () => {
      const result = await lookupGspRegion(52.39, -1.64);

      expect(result).not.toBeNull();
      expect(result!.gsp_name).toMatch(/^BESW/);
      expect(result!.distance_km).toBeLessThan(5);
    },
    30_000,
  );

  it(
    "Canary Wharf (51.505, -0.019) resolves to a London-area GSP within 5 km (NOT Walpole)",
    async () => {
      const result = await lookupGspRegion(51.505, -0.019);

      expect(result).not.toBeNull();
      // Must not return Walpole (Norfolk) -- the pre-fix wrong answer for every coordinate
      expect(result!.gsp_name).not.toBe("WALP_1");
      expect(result!.distance_km).toBeLessThan(5);
    },
    30_000,
  );
});
