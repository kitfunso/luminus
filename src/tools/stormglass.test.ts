import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(data: unknown) {
  return {
    ok: true,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

describe("getStormglass", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    process.env.STORMGLASS_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.STORMGLASS_API_KEY;
  });

  it("reuses the cache for default weather windows inside the same TTL bucket", async () => {
    vi.setSystemTime(new Date("2026-04-01T10:00:00.123Z"));

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        hours: [
          {
            time: "2026-04-01T10:00:00Z",
            windSpeed: { sg: 8 },
            windDirection: { sg: 180 },
            gust: { sg: 10 },
            waveHeight: { sg: 1.2 },
            wavePeriod: { sg: 6 },
            waveDirection: { sg: 190 },
            swellHeight: { sg: 0.8 },
            swellPeriod: { sg: 7 },
            waterTemperature: { sg: 12 },
            airTemperature: { sg: 10 },
            pressure: { sg: 1012 },
            visibility: { sg: 9 },
            cloudCover: { sg: 45 },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getStormglass } = await import("./stormglass.js");
    const first = await getStormglass({ latitude: 54.1, longitude: 1.2 });

    vi.setSystemTime(new Date("2026-04-01T10:00:20.456Z"));
    const second = await getStormglass({ latitude: 54.1, longitude: 1.2 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });
});
