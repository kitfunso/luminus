import { z } from "zod";
import {
  GATE2_RULES,
  type Gate2Rule,
  type Gate2RuleStatus,
} from "../lib/gb-connections/gate2-rules.js";

export const gate2ReadinessCheckSchema = z.object({
  project_name: z.string().describe("Human-readable project name used in the output."),
  technology: z
    .enum([
      "solar",
      "onshore_wind",
      "offshore_wind",
      "battery",
      "hydro",
      "biomass",
      "gas",
      "nuclear",
      "interconnector",
      "demand",
      "other",
      "unknown",
    ])
    .describe("Project technology category."),
  capacity_mw: z.number().describe("Project capacity in MW."),
  connection_voltage_kv: z
    .number()
    .optional()
    .describe("Nominated connection voltage in kV, if known."),
  planning_status: z
    .enum(["none", "submitted", "determined", "granted"])
    .describe("Planning permission status: none, submitted (application live), determined (decision issued), or granted."),
  land_rights_status: z
    .enum(["none", "option", "lease", "freehold"])
    .describe("Land control status evidence."),
  nominated_connection_point: z
    .string()
    .optional()
    .describe("Specific connection point or substation nominated (e.g. 'Berkswell GSP')."),
  grid_reference: z
    .string()
    .optional()
    .describe("OS grid reference or coordinates for the site."),
  target_energisation_year: z
    .number()
    .int()
    .optional()
    .describe("Target energisation year (YYYY)."),
});

interface Gate2RuleResult {
  rule_id: string;
  label: string;
  category: Gate2Rule["category"];
  severity: Gate2Rule["severity"];
  status: Gate2RuleStatus;
  reason: string;
  reference_url: string;
}

interface Gate2ReadinessSummary {
  pass: number;
  warn: number;
  fail: number;
  not_applicable: number;
  total: number;
}

interface Gate2ReadinessResult {
  project: {
    name: string;
    technology: string;
    capacity_mw: number;
    connection_voltage_kv: number | null;
    planning_status: string;
    land_rights_status: string;
    nominated_connection_point: string | null;
    grid_reference: string | null;
    target_energisation_year: number | null;
  };
  results: Gate2RuleResult[];
  summary: Gate2ReadinessSummary;
  confidence_notes: string[];
  source_metadata: {
    id: string;
    name: string;
    provider: string;
    url: string;
    description: string;
  };
  disclaimer: string;
}

const DISCLAIMER =
  "This is a rules-based checklist against publicly documented Gate 2 entry criteria as interpreted " +
  "from NESO and UK government sources. It is NOT a prediction of Gate 2 outcome, a NESO decision, " +
  "or a connection offer. Criteria evolve; confirm current requirements with NESO before applying.";

const CREDIBLE_ENERGISATION_MAX_YEARS_AHEAD = 10;

type ProjectInput = z.infer<typeof gate2ReadinessCheckSchema>;

function evaluateRule(rule: Gate2Rule, project: ProjectInput): {
  status: Gate2RuleStatus;
  reason: string;
} {
  switch (rule.id) {
    case "gate2.technology_declared": {
      if (project.technology === "unknown" || project.technology === "other") {
        return { status: "fail", reason: `Technology reported as '${project.technology}'; a specific technology is required.` };
      }
      return { status: "pass", reason: `Technology declared as ${project.technology}.` };
    }

    case "gate2.capacity_declared": {
      if (!Number.isFinite(project.capacity_mw) || project.capacity_mw <= 0) {
        return { status: "fail", reason: `capacity_mw is ${project.capacity_mw}; a positive value is required.` };
      }
      return { status: "pass", reason: `Capacity declared as ${project.capacity_mw} MW.` };
    }

    case "gate2.planning_status_submitted": {
      if (project.planning_status === "none") {
        return { status: "fail", reason: "Planning status is 'none'; at minimum a submitted application is required." };
      }
      return { status: "pass", reason: `Planning status is '${project.planning_status}'.` };
    }

    case "gate2.planning_status_granted": {
      if (project.planning_status === "granted") {
        return { status: "pass", reason: "Planning is granted." };
      }
      if (project.planning_status === "determined") {
        return { status: "warn", reason: "Planning determined but not yet confirmed granted — treat as weaker evidence." };
      }
      if (project.planning_status === "submitted") {
        return { status: "warn", reason: "Planning submitted but not yet granted." };
      }
      return { status: "fail", reason: "Planning is not granted." };
    }

    case "gate2.land_rights_secured": {
      if (project.land_rights_status === "none") {
        return { status: "fail", reason: "Land rights are 'none'; at minimum an option agreement is required." };
      }
      return { status: "pass", reason: `Land rights evidence is '${project.land_rights_status}'.` };
    }

    case "gate2.land_rights_substantial": {
      if (project.land_rights_status === "lease" || project.land_rights_status === "freehold") {
        return { status: "pass", reason: `Land rights are '${project.land_rights_status}'.` };
      }
      if (project.land_rights_status === "option") {
        return { status: "warn", reason: "Only an option agreement is held; a lease or freehold is stronger." };
      }
      return { status: "fail", reason: "No land rights declared." };
    }

    case "gate2.connection_point_nominated": {
      const value = project.nominated_connection_point?.trim();
      if (!value) {
        return { status: "fail", reason: "No connection point nominated." };
      }
      return { status: "pass", reason: `Connection point nominated: '${value}'.` };
    }

    case "gate2.grid_reference_provided": {
      const value = project.grid_reference?.trim();
      if (!value) {
        return { status: "fail", reason: "No grid reference provided." };
      }
      return { status: "pass", reason: `Grid reference provided: '${value}'.` };
    }

    case "gate2.target_energisation_realistic": {
      if (project.target_energisation_year === undefined) {
        return { status: "not_applicable", reason: "No target energisation year provided." };
      }
      const thisYear = new Date().getFullYear();
      if (project.target_energisation_year < thisYear) {
        return {
          status: "fail",
          reason: `Target energisation year ${project.target_energisation_year} is in the past.`,
        };
      }
      if (project.target_energisation_year > thisYear + CREDIBLE_ENERGISATION_MAX_YEARS_AHEAD) {
        return {
          status: "warn",
          reason: `Target energisation year ${project.target_energisation_year} is more than ${CREDIBLE_ENERGISATION_MAX_YEARS_AHEAD} years ahead; treat as weakly evidenced.`,
        };
      }
      return {
        status: "pass",
        reason: `Target energisation year ${project.target_energisation_year} is within the credible delivery window.`,
      };
    }

    case "gate2.clean_power_2030_alignment": {
      if (project.target_energisation_year === undefined) {
        return { status: "not_applicable", reason: "No target energisation year provided." };
      }
      if (project.target_energisation_year <= 2030) {
        return {
          status: "pass",
          reason: `Target energisation year ${project.target_energisation_year} is within the Clean Power 2030 window.`,
        };
      }
      return {
        status: "warn",
        reason: `Target energisation year ${project.target_energisation_year} is after 2030; Clean Power 2030 alignment is weaker.`,
      };
    }

    default:
      return { status: "not_applicable", reason: "No evaluator implemented for this rule." };
  }
}

function buildSummary(results: Gate2RuleResult[]): Gate2ReadinessSummary {
  const summary: Gate2ReadinessSummary = {
    pass: 0,
    warn: 0,
    fail: 0,
    not_applicable: 0,
    total: results.length,
  };
  for (const r of results) {
    summary[r.status] += 1;
  }
  return summary;
}

export async function getGate2ReadinessCheck(
  params: ProjectInput,
): Promise<Gate2ReadinessResult> {
  if (!Number.isFinite(params.capacity_mw)) {
    throw new Error("capacity_mw must be a finite number.");
  }

  const results: Gate2RuleResult[] = GATE2_RULES.map((rule) => {
    const { status, reason } = evaluateRule(rule, params);
    return {
      rule_id: rule.id,
      label: rule.label,
      category: rule.category,
      severity: rule.severity,
      status,
      reason,
      reference_url: rule.reference_url,
    };
  });

  const summary = buildSummary(results);

  const confidenceNotes = [
    "Rules are public-sourced at a single point in time; NESO publishes updates on connections reform and Gate 2 criteria, so check the reference URLs before relying on any rule.",
    "Fields marked 'not_applicable' are skipped, not inferred — missing optional inputs never produce a pass.",
    "Severity labels are this tool's interpretation of public guidance, not NESO's official weighting.",
  ];

  return {
    project: {
      name: params.project_name,
      technology: params.technology,
      capacity_mw: params.capacity_mw,
      connection_voltage_kv: params.connection_voltage_kv ?? null,
      planning_status: params.planning_status,
      land_rights_status: params.land_rights_status,
      nominated_connection_point: params.nominated_connection_point ?? null,
      grid_reference: params.grid_reference ?? null,
      target_energisation_year: params.target_energisation_year ?? null,
    },
    results,
    summary,
    confidence_notes: confidenceNotes,
    source_metadata: {
      id: "gate2-rules-v0",
      name: "Gate 2 Readiness Rules (rules-based)",
      provider: "Luminus (rules distilled from public NESO and gov.uk sources)",
      url: "https://www.neso.energy/industry-information/connections-reform",
      description:
        "Transparent checklist against public NESO connections reform and UK Clean Power 2030 documentation. Each rule cites its own reference_url.",
    },
    disclaimer: DISCLAIMER,
  };
}
