import { describe, expect, it } from "vitest";
import { parseGermanNumber, parseNtpCsv } from "./netztransparenz.js";

describe("parseGermanNumber", () => {
  it("parses German decimal format", () => {
    expect(parseGermanNumber("1.234,56")).toBe(1234.56);
    expect(parseGermanNumber("-12,5")).toBe(-12.5);
    expect(parseGermanNumber("0,00")).toBe(0);
    expect(parseGermanNumber("N.A.")).toBeNaN();
  });
});

describe("parseNtpCsv", () => {
  const csv = [
    "Datum;von;bis;Zeitzone;reBAP [EUR/MWh]",
    "08.08.2026;00:00;00:15;CEST;42,50",
    "08.08.2026;00:15;00:30;CEST;-3,25",
    "08.08.2026;23:45;00:00;CEST;1.001,00",
    "09.08.2026;00:00;00:15;CEST;99,99", // different day: dropped
  ].join("\r\n");

  it("parses semicolon CSV with German decimals into quarter-hour periods", () => {
    const points = parseNtpCsv(csv, "2026-08-08", "rebap");
    expect(points).toEqual([
      { period: 1, value: 42.5 },
      { period: 2, value: -3.25 },
      { period: 96, value: 1001.0 },
    ]);
  });

  it("skips unparseable values (published gaps) instead of coercing", () => {
    const gappy = [
      "Datum;von;bis;reBAP [EUR/MWh]",
      "08.08.2026;00:00;00:15;N.A.",
      "08.08.2026;00:15;00:30;5,00",
    ].join("\n");
    expect(parseNtpCsv(gappy, "2026-08-08", "rebap")).toEqual([{ period: 2, value: 5.0 }]);
  });

  it("throws a descriptive error when expected columns are missing", () => {
    expect(() => parseNtpCsv("foo;bar\n1;2", "2026-08-08", "rebap")).toThrow(/missing expected columns/i);
  });

  it("matches the value column by substring for NRV-Saldo headers", () => {
    const nrv = ["Datum;von;bis;NRV-Saldo [MW]", "08.08.2026;12:00;12:15;-250,75"].join("\n");
    expect(parseNtpCsv(nrv, "2026-08-08", "saldo")).toEqual([{ period: 49, value: -250.75 }]);
  });
});
