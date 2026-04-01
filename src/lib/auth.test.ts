import { afterEach, describe, expect, it, vi } from "vitest";

describe("resolveApiKey", () => {
  afterEach(() => {
    delete process.env.TEST_API_KEY;
    vi.resetModules();
    vi.doUnmock("node:fs/promises");
  });

  it("prefers the environment variable over keys.json", async () => {
    process.env.TEST_API_KEY = "env-value";

    vi.doMock("node:fs/promises", () => ({
      readFile: vi.fn().mockResolvedValue('{"TEST_API_KEY":"file-value"}'),
      stat: vi.fn().mockResolvedValue({ mode: 0o600 }),
    }));

    const { resolveApiKey } = await import("./auth.js");
    await expect(resolveApiKey("TEST_API_KEY")).resolves.toBe("env-value");
  });

  it("falls back to keys.json when the env var is missing", async () => {
    vi.doMock("node:fs/promises", () => ({
      readFile: vi.fn().mockResolvedValue('{"TEST_API_KEY":"file-value"}'),
      stat: vi.fn().mockResolvedValue({ mode: 0o600 }),
    }));

    const { resolveApiKey } = await import("./auth.js");
    await expect(resolveApiKey("TEST_API_KEY")).resolves.toBe("file-value");
  });
});
