import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeTextResponse(text: string) {
  return {
    ok: true,
    text: async () => text,
    json: async () => {
      throw new Error("json() not expected for text response");
    },
  };
}

function makeJsonResponse(data: unknown) {
  return {
    ok: true,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

describe("getPowerPlants", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes GB plants in the unfiltered result set via NESO fallback", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        makeTextResponse(
          [
            "name,country,capacity_net_bnetza,energy_source,lat,lon,commissioned",
            "DE Solar,DE,100,Solar,51.0,10.0,2020",
          ].join("\n"),
        ),
      )
      .mockResolvedValueOnce(
        makeTextResponse(
          [
            "name,country,capacity,technology,lat,lon,commissioning_date",
            "FR Wind,FR,80,Wind,48.0,2.0,2021-01-01",
          ].join("\n"),
        ),
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          result: {
            records: [
              { "Project Name": "GB Solar", "MW Connected": 200, "Plant Type": "Solar" },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          result: {
            resources: [],
          },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const { getPowerPlants } = await import("./power-plants.js");
    const result = await getPowerPlants({});

    expect(result.total_count).toBe(3);
    expect(result.plants.some((plant) => plant.country === "GB" && plant.name === "GB Solar")).toBe(true);
  });

  it("returns GB plants when country=GB", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeTextResponse("name,country,capacity_net_bnetza,energy_source\nDE Solar,DE,100,Solar"))
      .mockResolvedValueOnce(makeTextResponse("name,country,capacity,technology\nFR Wind,FR,80,Wind"))
      .mockResolvedValueOnce(
        makeJsonResponse({
          result: {
            records: [
              { "Project Name": "GB Battery", "MW Connected": 150, "Plant Type": "Energy Storage System" },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          result: {
            resources: [],
          },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const { getPowerPlants } = await import("./power-plants.js");
    const result = await getPowerPlants({ country: "GB" });

    expect(result.total_count).toBe(1);
    expect(result.plants[0]).toMatchObject({
      country: "GB",
      name: "GB Battery",
      capacity_mw: 150,
    });
  });
});
