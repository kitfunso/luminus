import { z } from "zod";
import { compareSites } from "./compare-sites.js";
import { getDistributionHeadroom } from "./distribution-headroom.js";
import { getGridConnectionIntelligence } from "./grid-connection-intelligence.js";
import { estimateSiteRevenue } from "./site-revenue.js";

const siteInputSchema = z.object({
  lat: z.number().describe("Latitude (-90 to 90). WGS84."),
  lon: z.number().describe("Longitude (-180 to 180). WGS84."),
  label: z.string().optional().describe("Optional human-readable label for this site."),
});

export const bessShortlistSchema = z.object({
  sites: z.array(siteInputSchema).describe("Array of GB candidate sites to compare (2-10)."),
  country: z.string().describe('Only "GB" is supported.'),
  shortlist_size: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Number of top-ranked sites to return in the shortlist. Defaults to min(3, site count)."),
  capacity_mw: z
    .number()
    .positive()
    .optional()
    .describe("BESS capacity used for the revenue estimate (default 10)."),
  date: z
    .string()
    .optional()
    .describe("Optional price date for the BESS revenue estimate (YYYY-MM-DD)."),
  radius_km: z
    .number()
    .positive()
    .optional()
    .describe("Optional search radius in km passed through to compare_sites."),
});

type Verdict = "pass" | "warn" | "fail";

interface CompareSiteRank {
  rank: number;
  label: string;
  lat: number;
  lon: number;
  verdict: Verdict;
  score: number;
  reasoning: string;
  data_gaps: string[];
}

interface ShortlistedSite {
  rank: number;
  label: string;
  lat: number;
  lon: number;
  verdict: Verdict;
  gis_score: number;
  estimated_annual_revenue_eur: number | null;
  queue_total_mw_queued: number | null;
  queue_project_count: number | null;
  dno_headroom_site: string | null;
  dno_generation_headroom_mw: number | null;
  dno_generation_rag_status: string | null;
  shortlist_score: number;
  reasoning: string;
  data_gaps: string[];
}

interface FailedSite {
  label: string;
  lat: number;
  lon: number;
  error: string;
}

interface BessShortlistResult {
  country: "GB";
  technology: "bess";
  site_count: number;
  shortlist_size: number;
  shortlist: ShortlistedSite[];
  rankings: ShortlistedSite[];
  failed_sites: FailedSite[];
  heuristics_used: string[];
  disclaimer: string;
}

const WEIGHT_GIS = 45;
const WEIGHT_REVENUE = 25;
const WEIGHT_QUEUE = 20;
const WEIGHT_DNO = 10;
const NEUTRAL_OPTIONAL_SIGNAL = 0.5;

const HEURISTICS_USED = [
  `GIS screen score (weight ${WEIGHT_GIS}%): reuses compare_sites score as the base prospecting signal.`,
  `BESS revenue score (weight ${WEIGHT_REVENUE}%): higher estimated annual revenue ranks better, normalised across successful site-revenue calls.`,
  `Queue burden score (weight ${WEIGHT_QUEUE}%): lower MW already queued at the matched GSP ranks better, normalised across successful queue lookups.`,
  `SSEN DNO headroom score (weight ${WEIGHT_DNO}%): higher estimated generation headroom ranks better when SSEN public headroom data resolves; unresolved coverage stays neutral rather than penalising non-SSEN sites.`,
  "Missing revenue or queue data scores 0 for that component; unresolved SSEN headroom coverage stays neutral and is called out in data_gaps.",
  "This is a shortlist heuristic, not a connection-offer, dispatch, or investment recommendation.",
];

const DISCLAIMER =
  "This shortlist combines public GIS screening, a screening-level BESS revenue estimate, GB transmission queue intelligence, and SSEN distribution headroom where public SSEN data resolves. " +
  "It does not infer GB-wide DNO capacity, grid availability, or bankable project returns.";

function normaliseHigherBetter(value: number | null, min: number, max: number): number {
  if (value === null) return 0;
  if (max === min) return 1;
  return (value - min) / (max - min);
}

function normaliseLowerBetter(value: number | null, min: number, max: number): number {
  if (value === null) return 0;
  if (max === min) return 1;
  return 1 - (value - min) / (max - min);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildReasoning(site: ShortlistedSite): string {
  const parts = [
    `GIS score ${round2(site.gis_score)} with verdict ${site.verdict}.`,
  ];

  if (site.estimated_annual_revenue_eur !== null) {
    parts.push(`BESS revenue estimate ${round2(site.estimated_annual_revenue_eur)} EUR/yr.`);
  } else {
    parts.push("Revenue estimate missing.");
  }

  if (site.queue_total_mw_queued !== null) {
    parts.push(`GB transmission queue signal ${round2(site.queue_total_mw_queued)} MW already queued.`);
  } else {
    parts.push("GB transmission queue signal missing.");
  }

  if (site.dno_generation_headroom_mw !== null) {
    parts.push(
      `SSEN DNO headroom ${round2(site.dno_generation_headroom_mw)} MW at ${site.dno_headroom_site ?? "matched site"}${site.dno_generation_rag_status ? ` (${site.dno_generation_rag_status})` : ""}.`,
    );
  } else {
    parts.push("SSEN DNO headroom not resolved.");
  }

  if (site.data_gaps.length > 0) {
    parts.push(`Data gaps: ${site.data_gaps.join(", ")}.`);
  }

  return parts.join(" ");
}

export async function shortlistBessSites(
  params: z.infer<typeof bessShortlistSchema>,
): Promise<BessShortlistResult> {
  const country = params.country.toUpperCase();
  if (country !== "GB") {
    throw new Error('Only country "GB" is supported for shortlist_bess_sites.');
  }
  if (params.sites.length < 2) {
    throw new Error("At least 2 sites are required for shortlist_bess_sites.");
  }
  if (params.sites.length > 10) {
    throw new Error("shortlist_bess_sites accepts at most 10 sites per call.");
  }

  const shortlistSize = params.shortlist_size ?? Math.min(3, params.sites.length);
  if (shortlistSize < 1 || shortlistSize > params.sites.length) {
    throw new Error("shortlist_size must be between 1 and the number of input sites.");
  }

  const compareResult = await compareSites({
    country,
    sites: params.sites,
    ...(params.radius_km !== undefined ? { radius_km: params.radius_km } : {}),
  });

  const detailedRanks = await Promise.all(
    compareResult.rankings.map(async (site) => {
      const dataGaps = [...site.data_gaps];
      let estimatedAnnualRevenue: number | null = null;
      let queueTotalMwQueued: number | null = null;
      let queueProjectCount: number | null = null;
      let dnoHeadroomSite: string | null = null;
      let dnoGenerationHeadroomMw: number | null = null;
      let dnoGenerationRagStatus: string | null = null;

      const [revenueResult, queueResult, dnoResult] = await Promise.allSettled([
        estimateSiteRevenue({
          lat: site.lat,
          lon: site.lon,
          zone: "GB",
          technology: "bess",
          ...(params.capacity_mw !== undefined ? { capacity_mw: params.capacity_mw } : {}),
          ...(params.date !== undefined ? { date: params.date } : {}),
        }),
        getGridConnectionIntelligence({
          lat: site.lat,
          lon: site.lon,
          country: "GB",
        }),
        getDistributionHeadroom({
          lat: site.lat,
          lon: site.lon,
          operator: "SSEN",
        }),
      ]);

      if (revenueResult.status === "fulfilled") {
        estimatedAnnualRevenue = revenueResult.value.revenue.estimated_annual_revenue_eur ?? null;
      } else {
        dataGaps.push("site_revenue");
      }

      if (queueResult.status === "fulfilled") {
        queueTotalMwQueued = queueResult.value.connection_queue?.total_mw_queued ?? null;
        queueProjectCount = queueResult.value.connection_queue?.projects.length ?? null;
      } else {
        dataGaps.push("grid_connection_intelligence");
      }

      if (dnoResult.status === "fulfilled") {
        dnoHeadroomSite = dnoResult.value.nearest_site?.substation ?? null;
        dnoGenerationHeadroomMw =
          dnoResult.value.nearest_site?.estimated_generation_headroom_mw ?? null;
        dnoGenerationRagStatus = dnoResult.value.nearest_site?.generation_rag_status ?? null;
        if (dnoResult.value.nearest_site === null) {
          dataGaps.push("distribution_headroom");
        }
      } else {
        dataGaps.push("distribution_headroom");
      }

      return {
        rank: site.rank,
        label: site.label,
        lat: site.lat,
        lon: site.lon,
        verdict: site.verdict,
        gis_score: site.score,
        estimated_annual_revenue_eur: estimatedAnnualRevenue,
        queue_total_mw_queued: queueTotalMwQueued,
        queue_project_count: queueProjectCount,
        dno_headroom_site: dnoHeadroomSite,
        dno_generation_headroom_mw: dnoGenerationHeadroomMw,
        dno_generation_rag_status: dnoGenerationRagStatus,
        shortlist_score: 0,
        reasoning: site.reasoning,
        data_gaps: [...new Set(dataGaps)],
      };
    }),
  );

  const revenueValues = detailedRanks
    .map((site) => site.estimated_annual_revenue_eur)
    .filter((value): value is number => value !== null);
  const queueValues = detailedRanks
    .map((site) => site.queue_total_mw_queued)
    .filter((value): value is number => value !== null);
  const dnoHeadroomValues = detailedRanks
    .map((site) => site.dno_generation_headroom_mw)
    .filter((value): value is number => value !== null);

  const revenueMin = revenueValues.length > 0 ? Math.min(...revenueValues) : 0;
  const revenueMax = revenueValues.length > 0 ? Math.max(...revenueValues) : 0;
  const queueMin = queueValues.length > 0 ? Math.min(...queueValues) : 0;
  const queueMax = queueValues.length > 0 ? Math.max(...queueValues) : 0;
  const dnoHeadroomMin = dnoHeadroomValues.length > 0 ? Math.min(...dnoHeadroomValues) : 0;
  const dnoHeadroomMax = dnoHeadroomValues.length > 0 ? Math.max(...dnoHeadroomValues) : 0;

  const rankings = detailedRanks
    .map((site) => {
      const gisNorm = site.gis_score / 100;
      const revenueNorm = normaliseHigherBetter(
        site.estimated_annual_revenue_eur,
        revenueMin,
        revenueMax,
      );
      const queueNorm = normaliseLowerBetter(
        site.queue_total_mw_queued,
        queueMin,
        queueMax,
      );
      const dnoNorm =
        site.dno_generation_headroom_mw === null
          ? NEUTRAL_OPTIONAL_SIGNAL
          : normaliseHigherBetter(
              site.dno_generation_headroom_mw,
              dnoHeadroomMin,
              dnoHeadroomMax,
            );
      const shortlistScore = round2(
        WEIGHT_GIS * gisNorm +
          WEIGHT_REVENUE * revenueNorm +
          WEIGHT_QUEUE * queueNorm +
          WEIGHT_DNO * dnoNorm,
      );

      const ranked: ShortlistedSite = {
        ...site,
        shortlist_score: shortlistScore,
        reasoning: "",
      };
      ranked.reasoning = buildReasoning(ranked);
      return ranked;
    })
    .sort((a, b) => {
      if (b.shortlist_score !== a.shortlist_score) return b.shortlist_score - a.shortlist_score;
      return a.rank - b.rank;
    })
    .map((site, index) => ({
      ...site,
      rank: index + 1,
    }));

  const effectiveShortlistSize = Math.min(shortlistSize, rankings.length);

  return {
    country: "GB",
    technology: "bess",
    site_count: params.sites.length,
    shortlist_size: effectiveShortlistSize,
    shortlist: rankings.slice(0, effectiveShortlistSize),
    rankings,
    failed_sites: compareResult.failed_sites.map((site) => ({
      label: site.label,
      lat: site.lat,
      lon: site.lon,
      error: asErrorMessage(site.error),
    })),
    heuristics_used: HEURISTICS_USED,
    disclaimer: DISCLAIMER,
  };
}
