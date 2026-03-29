import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { toolHandler } from "./tool-handler.js";

const testSchema = z.object({
  zone: z.string(),
});

describe("toolHandler", () => {
  beforeEach(() => {
    delete process.env.LUMINUS_DEBUG;
    vi.restoreAllMocks();
  });

  it("returns JSON-stringified result on success", async () => {
    const handler = toolHandler(testSchema, async (params) => ({
      zone: params.zone,
      price: 42,
    }));

    const result = await handler({ zone: "DE" });
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text)).toEqual({ zone: "DE", price: 42 });
  });

  it("returns actionable validation errors", async () => {
    const handler = toolHandler(testSchema, async () => ({}));

    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid parameters.");
    expect(result.content[0].text).toContain("zone");
    expect(result.content[0].text).toContain("LUMINUS_DEBUG=1");
  });

  it("normalizes missing API key errors", async () => {
    const handler = toolHandler(testSchema, async () => {
      throw new Error("ENTSOE_API_KEY environment variable is required. Get one first.");
    });

    const result = await handler({ zone: "DE" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Configuration error.");
    expect(result.content[0].text).toContain("API key");
  });

  it("returns raw details in debug mode", async () => {
    process.env.LUMINUS_DEBUG = "1";
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = toolHandler(testSchema, async () => {
      throw new Error("API timeout");
    });

    const result = await handler({ zone: "DE" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Upstream request failed or timed out.");
    expect(result.content[0].text).toContain("Raw error: API timeout");
    expect(consoleSpy).toHaveBeenCalled();
  });
});
