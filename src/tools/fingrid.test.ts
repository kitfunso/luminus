import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(data: unknown) {
  return {
    ok: true,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function makeRows(count: number, startIndex = 0) {
  return Array.from({ length: count }, (_, idx) => ({
    startTime: new Date(Date.UTC(2026, 0, 1, 0, (startIndex + idx) * 3)).toISOString(),
    value: startIndex + idx + 1,
  }));
}

describe("getFingridData", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    process.env.FINGRID_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.FINGRID_API_KEY;
  });

  it("paginates through the full requested window", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const page = Number(new URL(String(input)).searchParams.get("page"));
      if (page === 1) return jsonResponse({ data: makeRows(200, 0) });
      if (page === 2) return jsonResponse({ data: makeRows(200, 200) });
      return jsonResponse({ data: makeRows(80, 400) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getFingridData } = await import("./fingrid.js");
    const result = await getFingridData({ dataset: "consumption" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.count).toBe(480);
    expect(result.latest).toMatchObject({
      timestamp: makeRows(1, 479)[0].startTime,
      value: 480,
    });
    expect(result.data[0]).toMatchObject({ value: 1 });
  });

  it("reuses the cache for default windows inside the same TTL bucket", async () => {
    vi.setSystemTime(new Date("2026-04-01T10:00:00.123Z"));

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: makeRows(1, 0) }));
    vi.stubGlobal("fetch", fetchMock);

    const { getFingridData } = await import("./fingrid.js");
    await getFingridData({ dataset: "frequency" });

    vi.setSystemTime(new Date("2026-04-01T10:00:01.456Z"));
    await getFingridData({ dataset: "frequency" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
