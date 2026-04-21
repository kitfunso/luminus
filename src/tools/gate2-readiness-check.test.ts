import { describe, it, expect } from "vitest";
import { getGate2ReadinessCheck } from "./gate2-readiness-check.js";
import { GATE2_RULES } from "../lib/gb-connections/gate2-rules.js";

const THIS_YEAR = new Date().getFullYear();

const HAPPY_INPUT = {
  project_name: "Alpha Solar",
  technology: "solar" as const,
  capacity_mw: 50,
  connection_voltage_kv: 132,
  planning_status: "granted" as const,
  land_rights_status: "freehold" as const,
  nominated_connection_point: "Berkswell GSP",
  grid_reference: "SP 24567 79852",
  target_energisation_year: 2028,
};

describe("getGate2ReadinessCheck", () => {
  it("returns one result per rule with a non-empty reference URL", async () => {
    const result = await getGate2ReadinessCheck(HAPPY_INPUT);

    expect(result.results.length).toBe(GATE2_RULES.length);
    for (const r of result.results) {
      expect(r.reference_url.length).toBeGreaterThan(0);
      expect(r.reference_url.startsWith("http")).toBe(true);
    }
  });

  it("happy path yields mostly passes and no fails", async () => {
    const result = await getGate2ReadinessCheck(HAPPY_INPUT);
    expect(result.summary.fail).toBe(0);
    expect(result.summary.pass).toBeGreaterThan(result.summary.warn);
  });

  it("fails on an empty planning status and empty land rights", async () => {
    const result = await getGate2ReadinessCheck({
      ...HAPPY_INPUT,
      planning_status: "none",
      land_rights_status: "none",
    });

    const planningSubmitted = result.results.find((r) => r.rule_id === "gate2.planning_status_submitted");
    const landSecured = result.results.find((r) => r.rule_id === "gate2.land_rights_secured");

    expect(planningSubmitted?.status).toBe("fail");
    expect(landSecured?.status).toBe("fail");
    expect(result.summary.fail).toBeGreaterThanOrEqual(2);
  });

  it("warns when land rights are only an option", async () => {
    const result = await getGate2ReadinessCheck({
      ...HAPPY_INPUT,
      land_rights_status: "option",
    });

    const substantial = result.results.find((r) => r.rule_id === "gate2.land_rights_substantial");
    expect(substantial?.status).toBe("warn");

    const secured = result.results.find((r) => r.rule_id === "gate2.land_rights_secured");
    expect(secured?.status).toBe("pass");
  });

  it("fails when grid reference and connection point are missing", async () => {
    const result = await getGate2ReadinessCheck({
      ...HAPPY_INPUT,
      nominated_connection_point: undefined,
      grid_reference: undefined,
    });

    const conn = result.results.find((r) => r.rule_id === "gate2.connection_point_nominated");
    const grid = result.results.find((r) => r.rule_id === "gate2.grid_reference_provided");
    expect(conn?.status).toBe("fail");
    expect(grid?.status).toBe("fail");
  });

  it("marks realistic-energisation and CP2030 rules not_applicable when year is missing", async () => {
    const result = await getGate2ReadinessCheck({
      ...HAPPY_INPUT,
      target_energisation_year: undefined,
    });

    const realistic = result.results.find((r) => r.rule_id === "gate2.target_energisation_realistic");
    const cp2030 = result.results.find((r) => r.rule_id === "gate2.clean_power_2030_alignment");

    expect(realistic?.status).toBe("not_applicable");
    expect(cp2030?.status).toBe("not_applicable");
  });

  it("warns on a target energisation year beyond CP2030", async () => {
    const result = await getGate2ReadinessCheck({
      ...HAPPY_INPUT,
      target_energisation_year: 2033,
    });

    const cp2030 = result.results.find((r) => r.rule_id === "gate2.clean_power_2030_alignment");
    expect(cp2030?.status).toBe("warn");
  });

  it("fails on a past target energisation year", async () => {
    const result = await getGate2ReadinessCheck({
      ...HAPPY_INPUT,
      target_energisation_year: THIS_YEAR - 1,
    });

    const realistic = result.results.find((r) => r.rule_id === "gate2.target_energisation_realistic");
    expect(realistic?.status).toBe("fail");
  });

  it("fails when technology is 'unknown'", async () => {
    const result = await getGate2ReadinessCheck({
      ...HAPPY_INPUT,
      technology: "unknown",
    });

    const techRule = result.results.find((r) => r.rule_id === "gate2.technology_declared");
    expect(techRule?.status).toBe("fail");
  });

  it("fails when capacity_mw is zero or negative", async () => {
    const result = await getGate2ReadinessCheck({
      ...HAPPY_INPUT,
      capacity_mw: 0,
    });

    const capRule = result.results.find((r) => r.rule_id === "gate2.capacity_declared");
    expect(capRule?.status).toBe("fail");
  });

  it("exposes a disclaimer that explicitly denies predictive scoring", async () => {
    const result = await getGate2ReadinessCheck(HAPPY_INPUT);
    expect(result.disclaimer).toContain("NOT a prediction");
    expect(result.disclaimer).toContain("NESO");
  });

  it("summary counts sum to total", async () => {
    const result = await getGate2ReadinessCheck({
      ...HAPPY_INPUT,
      planning_status: "submitted",
      land_rights_status: "option",
      target_energisation_year: 2031,
    });

    const { pass, warn, fail, not_applicable, total } = result.summary;
    expect(pass + warn + fail + not_applicable).toBe(total);
    expect(total).toBe(GATE2_RULES.length);
  });
});
