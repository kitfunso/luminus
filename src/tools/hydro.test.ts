import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryEntsoeMock } = vi.hoisted(() => ({
  queryEntsoeMock: vi.fn(),
}));

vi.mock("../lib/entsoe-client.js", () => ({
  queryEntsoe: queryEntsoeMock,
  formatEntsoeDate: vi.fn((date: Date) => date.toISOString().slice(0, 16).replace(/[-:T]/g, "")),
}));

vi.mock("../lib/zone-codes.js", () => ({
  resolveZone: vi.fn(() => "10YFI-1--------U"),
  AVAILABLE_ZONES: "FI",
}));

import { getHydroReservoir } from "./hydro.js";

describe("getHydroReservoir", () => {
  beforeEach(() => {
    queryEntsoeMock.mockReset();
  });

  it("uses point.position to derive distinct weekly timestamps", async () => {
    queryEntsoeMock.mockResolvedValue({
      GL_MarketDocument: {
        TimeSeries: {
          Period: {
            timeInterval: { start: "2026-01-01T00:00:00Z" },
            resolution: "P7D",
            Point: [
              { position: "1", quantity: "100" },
              { position: "2", quantity: "150" },
            ],
          },
        },
      },
    });

    const result = await getHydroReservoir({
      zone: "FI",
      start_date: "2026-01-01",
      end_date: "2026-01-15",
    });

    expect(result.reservoir).toEqual([
      { week_start: "2026-01-01", stored_energy_mwh: 100 },
      { week_start: "2026-01-08", stored_energy_mwh: 150 },
    ]);
    expect(result.latest_stored_mwh).toBe(150);
  });
});
