import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const cache = new TtlCache();

export const emberSchema = z.object({
  country: z
    .string()
    .describe('Country name (e.g. "Germany", "France", "Spain")'),
  start_year: z
    .string()
    .optional()
    .describe("Start year YYYY. Defaults to 2020."),
});

interface EmberRecord {
  date: string;
  generation_twh: number;
  demand_twh: number;
  emissions_mtco2: number;
  renewable_pct: number;
}

interface EmberResult {
  country: string;
  source: "ember-climate.org";
  records: EmberRecord[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEmberResponse(country: string, data: any): EmberRecord[] {
  const records: EmberRecord[] = [];

  // The EMBER API may return data in various structures.
  // Attempt to parse the most common response formats.

  // Format 1: { data: [ { date, generation_twh, ... } ] }
  if (Array.isArray(data?.data)) {
    for (const row of data.data) {
      records.push(extractRecord(row));
    }
    return records;
  }

  // Format 2: Top-level array
  if (Array.isArray(data)) {
    for (const row of data) {
      records.push(extractRecord(row));
    }
    return records;
  }

  // Format 3: { results: [...] }
  if (Array.isArray(data?.results)) {
    for (const row of data.results) {
      records.push(extractRecord(row));
    }
    return records;
  }

  // If nothing matched, return empty with a note
  return records;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractRecord(row: any): EmberRecord {
  return {
    date: String(
      row.date ?? row.month ?? row.period ?? row.year ?? "unknown"
    ),
    generation_twh: toNumber(
      row.generation_twh ?? row.generation ?? row.total_generation ?? 0
    ),
    demand_twh: toNumber(
      row.demand_twh ?? row.demand ?? row.total_demand ?? 0
    ),
    emissions_mtco2: toNumber(
      row.emissions_mtco2 ?? row.emissions ?? row.co2_emissions ?? 0
    ),
    renewable_pct: toNumber(
      row.renewable_pct ??
        row.renewable_share ??
        row.renewables_pct ??
        row.share_of_renewables ??
        0
    ),
  };
}

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
}

export async function getEmberData(
  params: z.infer<typeof emberSchema>,
): Promise<EmberResult> {
  const country = params.country;
  const startYear = params.start_year ?? "2020";

  const cacheKey = `ember:${country}:${startYear}`;
  const cached = cache.get<EmberResult>(cacheKey);
  if (cached) return cached;

  // EMBER retired their public JSON API in late 2025.
  // Their endpoints now return HTML pages instead of JSON data.
  // Until a replacement data source is identified, this tool returns
  // a clear error rather than silently failing.
  const encodedCountry = encodeURIComponent(country);
  const url =
    `https://ember-climate.org/api/v1/electricity-generation/monthly` +
    `?entity=${encodedCountry}&start_date=${startYear}-01`;

  let records: EmberRecord[] = [];
  let fetchError: string | null = null;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "luminus-mcp/0.1", Accept: "application/json" },
    });

    if (response.ok) {
      const text = await response.text();
      // EMBER now returns HTML instead of JSON — detect this
      if (text.trimStart().startsWith("<!doctype") || text.trimStart().startsWith("<html")) {
        fetchError = "EMBER API has been retired and now returns HTML instead of JSON data";
      } else {
        try {
          const data = JSON.parse(text);
          records = parseEmberResponse(country, data);
        } catch {
          fetchError = "EMBER API returned non-JSON response";
        }
      }
    } else {
      fetchError = `EMBER API returned ${response.status}`;
    }
  } catch (e) {
    fetchError = (e as Error).message;
  }

  if (records.length === 0) {
    throw new Error(
      `No data returned from EMBER for "${country}" (from ${startYear}). ` +
        (fetchError ? `${fetchError}. ` : "") +
        "EMBER retired their public JSON API in late 2025. " +
        "Use get_energy_charts or get_smard_data for European electricity generation data instead."
    );
  }

  const result: EmberResult = {
    country,
    source: "ember-climate.org",
    records,
  };

  cache.set(cacheKey, result, TTL.STATIC_DATA);
  return result;
}
