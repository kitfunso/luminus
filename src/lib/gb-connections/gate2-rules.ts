/**
 * Rules-based Gate 2 readiness criteria.
 *
 * Each rule is a narrow, publicly-sourced check against inputs a project
 * sponsor would declare. The rules are NOT a prediction of Gate 2
 * outcome. Every rule carries a live public reference URL; if we cannot
 * cite a source we do not ship the rule.
 */

export type Gate2RuleSeverity = "required" | "recommended";
export type Gate2RuleStatus = "pass" | "warn" | "fail" | "not_applicable";

export type Gate2RuleCategory =
  | "planning"
  | "land_rights"
  | "technology"
  | "capacity"
  | "connection_point"
  | "grid_reference"
  | "energisation_window"
  | "strategic_alignment";

export interface Gate2Rule {
  id: string;
  label: string;
  category: Gate2RuleCategory;
  severity: Gate2RuleSeverity;
  description: string;
  reference_url: string;
}

// Reference URLs verified live against the public NESO and gov.uk pages
// at the time of shipping. If any become a 404, remove the rule that
// cites it — we do not keep uncitable rules.
const REF_NESO_CONNECTIONS = "https://www.neso.energy/industry-information/connections";
const REF_NESO_CONNECTIONS_REFORM = "https://www.neso.energy/industry-information/connections-reform";
const REF_NESO_QUEUE_MANAGEMENT = "https://www.neso.energy/industry-information/connections/queue-management";
const REF_CLEAN_POWER_2030 = "https://www.gov.uk/government/publications/clean-power-2030-action-plan";

export const GATE2_RULES: readonly Gate2Rule[] = [
  {
    id: "gate2.technology_declared",
    label: "Technology type declared",
    category: "technology",
    severity: "required",
    description:
      "Project technology must be identified (e.g. solar, onshore wind, offshore wind, BESS, gas, nuclear). NESO's connections application journey requires technology to be stated up front.",
    reference_url: REF_NESO_CONNECTIONS,
  },
  {
    id: "gate2.capacity_declared",
    label: "Capacity declared in MW",
    category: "capacity",
    severity: "required",
    description:
      "A positive capacity in MW is required for NESO to place the project into the correct technology-capacity band.",
    reference_url: REF_NESO_CONNECTIONS,
  },
  {
    id: "gate2.planning_status_submitted",
    label: "Planning application submitted or later",
    category: "planning",
    severity: "required",
    description:
      "NESO's gated connections reform requires evidence that planning is, at minimum, formally submitted. A project with no planning activity does not meet Gate 2 entry criteria.",
    reference_url: REF_NESO_CONNECTIONS_REFORM,
  },
  {
    id: "gate2.planning_status_granted",
    label: "Planning consent granted",
    category: "planning",
    severity: "recommended",
    description:
      "Granted planning consent strengthens Gate 2 readiness beyond the minimum of a submitted application.",
    reference_url: REF_NESO_CONNECTIONS_REFORM,
  },
  {
    id: "gate2.land_rights_secured",
    label: "Land rights evidence provided",
    category: "land_rights",
    severity: "required",
    description:
      "Gate 2 requires evidence of land control: at minimum a formal option agreement, stronger with a lease or freehold interest.",
    reference_url: REF_NESO_CONNECTIONS_REFORM,
  },
  {
    id: "gate2.land_rights_substantial",
    label: "Land rights are lease or freehold",
    category: "land_rights",
    severity: "recommended",
    description:
      "A lease or freehold interest is stronger than an option agreement and reduces downstream Gate 2 delivery risk.",
    reference_url: REF_NESO_CONNECTIONS_REFORM,
  },
  {
    id: "gate2.connection_point_nominated",
    label: "Connection point nominated",
    category: "connection_point",
    severity: "required",
    description:
      "Gate 2 projects must nominate a specific connection point (substation / bus / GSP) so NESO can assess network impact.",
    reference_url: REF_NESO_CONNECTIONS,
  },
  {
    id: "gate2.grid_reference_provided",
    label: "Grid reference provided",
    category: "grid_reference",
    severity: "required",
    description:
      "An OS grid reference or equivalent coordinates must be provided so the project can be located and matched to a network region.",
    reference_url: REF_NESO_CONNECTIONS,
  },
  {
    id: "gate2.target_energisation_realistic",
    label: "Target energisation year within a credible window",
    category: "energisation_window",
    severity: "recommended",
    description:
      "NESO queue management expects a declared target energisation year that is both not in the past and within a credible delivery window (typically up to ten years ahead).",
    reference_url: REF_NESO_QUEUE_MANAGEMENT,
  },
  {
    id: "gate2.clean_power_2030_alignment",
    label: "Clean Power 2030 window alignment",
    category: "strategic_alignment",
    severity: "recommended",
    description:
      "A target energisation on or before 2030 aligns with the Clean Power 2030 Action Plan and strengthens strategic prioritisation.",
    reference_url: REF_CLEAN_POWER_2030,
  },
];
