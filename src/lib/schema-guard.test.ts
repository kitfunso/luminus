import { describe, expect, it } from "vitest";
import { guardArcGisFields, guardJsonFields } from "./schema-guard.js";

describe("guardArcGisFields", () => {
  it("passes when all expected fields are present", () => {
    const features = [
      { attributes: { SITECODE: "UK123", SITENAME: "Test Site", SITETYPE: "A" } },
    ];
    expect(() =>
      guardArcGisFields(features, ["SITECODE", "SITENAME", "SITETYPE"], "EEA Natura 2000"),
    ).not.toThrow();
  });

  it("throws with clear message when a field is missing", () => {
    const features = [
      { attributes: { SITECODE: "UK123", SITENAME: "Test Site" } },
    ];
    expect(() =>
      guardArcGisFields(features, ["SITECODE", "SITENAME", "MISSING_FIELD"], "EEA Natura 2000"),
    ).toThrow(
      'Schema drift detected in EEA Natura 2000: expected field "MISSING_FIELD" not found in response.',
    );
  });

  it("skips validation on empty features array", () => {
    expect(() =>
      guardArcGisFields([], ["SITECODE", "SITENAME"], "EEA Natura 2000"),
    ).not.toThrow();
  });

  it("throws when first feature has no attributes object", () => {
    const features = [{ attributes: undefined as unknown as Record<string, unknown> }];
    expect(() =>
      guardArcGisFields(features, ["SITECODE"], "EEA Natura 2000"),
    ).toThrow('Schema drift detected in EEA Natura 2000: first feature has no "attributes" object.');
  });

  it("includes provider name in error message", () => {
    const features = [{ attributes: { A: 1 } }];
    expect(() =>
      guardArcGisFields(features, ["B"], "Natural England SSSI"),
    ).toThrow("Natural England SSSI");
  });

  it("includes missing field name in error message", () => {
    const features = [{ attributes: { A: 1 } }];
    expect(() =>
      guardArcGisFields(features, ["Shape__Area"], "Environment Agency"),
    ).toThrow('"Shape__Area"');
  });

  it("accepts fields with null or undefined values as present", () => {
    const features = [
      { attributes: { NAME: null, AREA: undefined } },
    ];
    expect(() =>
      guardArcGisFields(features, ["NAME", "AREA"], "Natural England"),
    ).not.toThrow();
  });
});

describe("guardJsonFields", () => {
  it("passes when all expected fields are present", () => {
    const data = { "Project Name": "Solar Farm", "MW Connected": 50, "HOST TO": "NGET" };
    expect(() =>
      guardJsonFields(data, ["Project Name", "MW Connected", "HOST TO"], "NESO TEC Register"),
    ).not.toThrow();
  });

  it("throws when a field is missing", () => {
    const data = { "Project Name": "Solar Farm" };
    expect(() =>
      guardJsonFields(data, ["Project Name", "Missing Column"], "NESO TEC Register"),
    ).toThrow(
      'Schema drift detected in NESO TEC Register: expected field "Missing Column" not found in response.',
    );
  });

  it("includes provider name in error message", () => {
    const data = { a: 1 };
    expect(() =>
      guardJsonFields(data, ["b"], "My Provider"),
    ).toThrow("My Provider");
  });

  it("includes missing field name in error message", () => {
    const data = { a: 1 };
    expect(() =>
      guardJsonFields(data, ["Connection Site"], "NESO"),
    ).toThrow('"Connection Site"');
  });

  it("accepts fields with null or undefined values as present", () => {
    const data = { key1: null, key2: undefined };
    expect(() =>
      guardJsonFields(data, ["key1", "key2"], "Test Provider"),
    ).not.toThrow();
  });
});
