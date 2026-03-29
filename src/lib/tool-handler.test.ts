import { describe, it, expect } from "vitest";
import { z } from "zod";
import { toolHandler } from "./tool-handler.js";

const testSchema = z.object({
  zone: z.string(),
});

describe("toolHandler", () => {
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

  it("returns error on schema validation failure", async () => {
    const handler = toolHandler(testSchema, async () => ({}));

    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Error:/);
  });

  it("returns error when handler throws", async () => {
    const handler = toolHandler(testSchema, async () => {
      throw new Error("API timeout");
    });

    const result = await handler({ zone: "DE" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error: API timeout");
  });

  it("handles non-Error throws gracefully", async () => {
    const handler = toolHandler(testSchema, async () => {
      throw "raw string error";
    });

    const result = await handler({ zone: "DE" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error: raw string error");
  });
});
