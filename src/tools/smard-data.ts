import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const cache = new TtlCache();
const SMARD_BASE = "https://www.smard.de/app/chart_data";

export const smardSchema = z.object({
  dataset: z
    .enum(["generation", "consumption", "market_price"])
    .describe(
      '"generation" = hourly generation by source. "consumption" = total consumption. "market_price" = day-ahead + intraday prices.'
    ),
});

// SMARD filter IDs
const FILTER_IDS: Record<string, number> = {
  total_generation: 410,
  total_consumption: 4169,
  day_ahead_price: 4170,
};

const GENERATION_SOURCES: Record<string, number> = {
  Biomass: 4068,
  Hydro: 1226,
  "Wind Offshore": 1225,
  "Wind Onshore": 4067,
  Solar: 4069,
  Gas: 1228,
  Coal: 1227,
  Nuclear: 4071,
};

interface SmardIndexResponse {
  timestamps: number[];
}

interface SmardDataResponse {
  series: [number, number | null][];
}

interface HourlyPoint {
  timestamp: string;
  value: number;
}

interface GenerationSource {
  fuel: string;
  latest_mw: number;
  hourly: HourlyPoint[];
}

interface SmardGenerationResult {
  dataset: "generation";
  source: "smard.de";
  generation: GenerationSource[];
  total_mw: number;
}

interface SmardTimeseriesResult {
  dataset: string;
  source: "smard.de";
  resolution: "hourly";
  data: HourlyPoint[];
  latest: number;
  unit: string;
}

type SmardResult = SmardGenerationResult | SmardTimeseriesResult;

async function fetchSmardIndex(filterId: number): Promise<number | null> {
  const cacheKey = `smard:index:${filterId}`;
  const cached = cache.get<number>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${SMARD_BASE}/${filterId}/DE/index_hour.json`;
    const response = await fetch(url, {
      headers: { "User-Agent": "luminus-mcp/0.2" },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as SmardIndexResponse;
    if (!data.timestamps || data.timestamps.length === 0) return null;

    const latest = data.timestamps[data.timestamps.length - 1];
    cache.set(cacheKey, latest, TTL.REALTIME);
    return latest;
  } catch {
    return null;
  }
}

async function fetchSmardSeries(
  filterId: number,
  timestamp: number,
): Promise<[number, number | null][] | null> {
  const cacheKey = `smard:data:${filterId}:${timestamp}`;
  const cached = cache.get<[number, number | null][]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${SMARD_BASE}/${filterId}/DE/${filterId}_DE_hour_${timestamp}.json`;
    const response = await fetch(url, {
      headers: { "User-Agent": "luminus-mcp/0.2" },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as SmardDataResponse;
    if (!data.series || data.series.length === 0) return null;

    cache.set(cacheKey, data.series, TTL.REALTIME);
    return data.series;
  } catch {
    return null;
  }
}

function extractLast24h(
  series: [number, number | null][],
): HourlyPoint[] {
  const now = Date.now();
  const cutoff = now - 24 * 60 * 60 * 1000;

  const points: HourlyPoint[] = [];
  for (const [tsMs, value] of series) {
    if (tsMs < cutoff) continue;
    if (value == null || !Number.isFinite(value)) continue;
    points.push({
      timestamp: new Date(tsMs).toISOString(),
      value: Math.round(value * 100) / 100,
    });
  }
  return points;
}

function latestValue(series: [number, number | null][]): number {
  for (let i = series.length - 1; i >= 0; i--) {
    const val = series[i][1];
    if (val != null && Number.isFinite(val)) {
      return Math.round(val * 100) / 100;
    }
  }
  return 0;
}

async function fetchGeneration(): Promise<SmardGenerationResult> {
  // Fetch all generation sources in parallel
  const entries = Object.entries(GENERATION_SOURCES);
  const results = await Promise.all(
    entries.map(async ([fuel, filterId]) => {
      const timestamp = await fetchSmardIndex(filterId);
      if (timestamp == null) return null;

      const series = await fetchSmardSeries(filterId, timestamp);
      if (!series) return null;

      const hourly = extractLast24h(series);
      const latest = latestValue(series);

      return { fuel, latest_mw: latest, hourly };
    }),
  );

  const generation = results.filter(
    (r): r is GenerationSource => r !== null && r.latest_mw > 0,
  );
  generation.sort((a, b) => b.latest_mw - a.latest_mw);

  const totalMw = generation.reduce((sum, g) => sum + g.latest_mw, 0);

  return {
    dataset: "generation",
    source: "smard.de",
    generation,
    total_mw: Math.round(totalMw),
  };
}

async function fetchTimeseries(
  dataset: "consumption" | "market_price",
): Promise<SmardTimeseriesResult> {
  const filterId =
    dataset === "consumption"
      ? FILTER_IDS.total_consumption
      : FILTER_IDS.day_ahead_price;

  const unit = dataset === "consumption" ? "MW" : "EUR/MWh";

  const timestamp = await fetchSmardIndex(filterId);
  if (timestamp == null) {
    throw new Error(
      `Unable to fetch SMARD index for ${dataset}. Service may be temporarily unavailable.`
    );
  }

  const series = await fetchSmardSeries(filterId, timestamp);
  if (!series) {
    throw new Error(
      `Unable to fetch SMARD data for ${dataset}. Service may be temporarily unavailable.`
    );
  }

  const data = extractLast24h(series);
  const latest = latestValue(series);

  return {
    dataset,
    source: "smard.de",
    resolution: "hourly",
    data,
    latest,
    unit,
  };
}

export async function getSmardData(
  params: z.infer<typeof smardSchema>,
): Promise<SmardResult> {
  switch (params.dataset) {
    case "generation":
      return fetchGeneration();
    case "consumption":
      return fetchTimeseries("consumption");
    case "market_price":
      return fetchTimeseries("market_price");
    default:
      throw new Error(
        `Unknown dataset "${params.dataset}". Use: generation, consumption, market_price.`
      );
  }
}
