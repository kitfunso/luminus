import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const API_BASE = "https://transparency.entsog.eu/api/v1";
const cache = new TtlCache();

export const entsogSchema = z.object({
  dataset: z
    .enum(["physical_flows", "nominations", "interruptions", "capacities"])
    .describe(
      '"physical_flows" = actual gas pipeline flows (GWh/d) between points. ' +
        '"nominations" = day-ahead nominated gas volumes. ' +
        '"interruptions" = pipeline capacity interruptions and maintenance. ' +
        '"capacities" = technical/booked/available pipeline capacities.'
    ),
  country: z
    .string()
    .optional()
    .describe(
      "ISO-2 country code to filter by operator country (e.g. DE, NL, AT, FR, IT, PL). Optional."
    ),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to yesterday."),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchEntsog(endpoint: string, params: Record<string, string>): Promise<any> {
  const query = new URLSearchParams({ ...params, limit: "100" });
  const url = `${API_BASE}/${endpoint}?${query}`;

  const cached = cache.get(url);
  if (cached) return cached;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ENTSOG API returned ${response.status}: ${body.slice(0, 300)}`);
  }

  const json = await response.json();
  cache.set(url, json, TTL.FLOWS);
  return json;
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

interface FlowRecord {
  point_label: string;
  operator: string;
  direction: string;
  flow_gwh: number;
  date: string;
}

interface FlowsResult {
  dataset: "physical_flows";
  source: string;
  date: string;
  country: string | null;
  records: FlowRecord[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseFlows(data: any, date: string, country: string | null): FlowsResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const points: any[] = Array.isArray(data?.physicalflows) ? data.physicalflows : [];

  const records: FlowRecord[] = points.slice(0, 50).map((p) => ({
    point_label: p.pointLabel ?? p.pointKey ?? "Unknown",
    operator: p.operatorLabel ?? p.operatorKey ?? "Unknown",
    direction: p.directionKey ?? "unknown",
    flow_gwh: Math.round((Number(p.value ?? 0)) * 100) / 100,
    date: p.periodFrom ?? date,
  }));

  return {
    dataset: "physical_flows",
    source: "ENTSOG Transparency Platform",
    date,
    country,
    records,
  };
}

interface NominationRecord {
  point_label: string;
  operator: string;
  direction: string;
  nominated_gwh: number;
  date: string;
}

interface NominationsResult {
  dataset: "nominations";
  source: string;
  date: string;
  country: string | null;
  records: NominationRecord[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseNominations(data: any, date: string, country: string | null): NominationsResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const points: any[] = Array.isArray(data?.nominations) ? data.nominations : [];

  const records: NominationRecord[] = points.slice(0, 50).map((p) => ({
    point_label: p.pointLabel ?? p.pointKey ?? "Unknown",
    operator: p.operatorLabel ?? p.operatorKey ?? "Unknown",
    direction: p.directionKey ?? "unknown",
    nominated_gwh: Math.round((Number(p.value ?? 0)) * 100) / 100,
    date: p.periodFrom ?? date,
  }));

  return {
    dataset: "nominations",
    source: "ENTSOG Transparency Platform",
    date,
    country,
    records,
  };
}

interface InterruptionRecord {
  point_label: string;
  operator: string;
  type: string;
  start: string;
  end: string;
  affected_capacity_gwh: number;
}

interface InterruptionsResult {
  dataset: "interruptions";
  source: string;
  country: string | null;
  records: InterruptionRecord[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseInterruptions(data: any, country: string | null): InterruptionsResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = Array.isArray(data?.interruptions) ? data.interruptions : [];

  const records: InterruptionRecord[] = items.slice(0, 50).map((i) => ({
    point_label: i.pointLabel ?? i.pointKey ?? "Unknown",
    operator: i.operatorLabel ?? i.operatorKey ?? "Unknown",
    type: i.type ?? "unknown",
    start: i.periodFrom ?? "",
    end: i.periodTo ?? "",
    affected_capacity_gwh: Math.round((Number(i.value ?? 0)) * 100) / 100,
  }));

  return {
    dataset: "interruptions",
    source: "ENTSOG Transparency Platform",
    country,
    records,
  };
}

interface CapacityRecord {
  point_label: string;
  operator: string;
  direction: string;
  technical_gwh: number;
  booked_gwh: number;
  available_gwh: number;
}

interface CapacitiesResult {
  dataset: "capacities";
  source: string;
  date: string;
  country: string | null;
  records: CapacityRecord[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseCapacities(data: any, date: string, country: string | null): CapacitiesResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = Array.isArray(data?.operationaldatas) ? data.operationaldatas : [];

  const records: CapacityRecord[] = items.slice(0, 50).map((c) => ({
    point_label: c.pointLabel ?? c.pointKey ?? "Unknown",
    operator: c.operatorLabel ?? c.operatorKey ?? "Unknown",
    direction: c.directionKey ?? "unknown",
    technical_gwh: Math.round((Number(c.technicalCapacity ?? 0)) * 100) / 100,
    booked_gwh: Math.round((Number(c.bookedCapacity ?? 0)) * 100) / 100,
    available_gwh: Math.round((Number(c.availableCapacity ?? 0)) * 100) / 100,
  }));

  return {
    dataset: "capacities",
    source: "ENTSOG Transparency Platform",
    date,
    country,
    records,
  };
}

type EntsogResult = FlowsResult | NominationsResult | InterruptionsResult | CapacitiesResult;

export async function getEntsogData(
  params: z.infer<typeof entsogSchema>
): Promise<EntsogResult> {
  const date = params.date ?? yesterday();
  const country = params.country?.toUpperCase() ?? null;

  const baseParams: Record<string, string> = {
    from: date,
    to: date,
    periodType: "day",
    indicator: "Physical Flow",
  };

  if (country) {
    baseParams.operatorCountry = country;
  }

  switch (params.dataset) {
    case "physical_flows": {
      baseParams.indicator = "Physical Flow";
      const data = await fetchEntsog("operationaldatas", baseParams);
      return parseFlows(data, date, country);
    }
    case "nominations": {
      baseParams.indicator = "Nomination";
      const data = await fetchEntsog("nominationdatas", baseParams);
      return parseNominations(data, date, country);
    }
    case "interruptions": {
      const data = await fetchEntsog("interruptions", {
        from: date,
        to: date,
        ...(country ? { operatorCountry: country } : {}),
        limit: "50",
      });
      return parseInterruptions(data, country);
    }
    case "capacities": {
      baseParams.indicator = "Physical Flow";
      const data = await fetchEntsog("operationaldatas", baseParams);
      return parseCapacities(data, date, country);
    }
  }
}
