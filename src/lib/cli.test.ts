import { describe, expect, it } from "vitest";
import { parseProfileArg } from "./cli.js";

describe("parseProfileArg", () => {
  it("defaults to full when --profile is absent", () => {
    expect(parseProfileArg(["node", "dist/index.js"])).toBe("full");
  });

  it("returns the supplied profile", () => {
    expect(parseProfileArg(["node", "dist/index.js", "--profile", "grid"])).toBe("grid");
  });

  it("throws when --profile has no value", () => {
    expect(() => parseProfileArg(["node", "dist/index.js", "--profile"]))
      .toThrow("Missing value for --profile.");
  });

  it("throws when --profile is followed by another flag", () => {
    expect(() => parseProfileArg(["node", "dist/index.js", "--profile", "--debug"]))
      .toThrow("Missing value for --profile.");
  });
});
