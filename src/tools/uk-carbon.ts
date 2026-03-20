import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const CARBON_API = "https://api.carbonintensity.org.uk";
const cache = new TtlCache();

export const ukCarbonSchema = z.object({
  action: z
    .enum(["current", "regional", "date"])
    .describe(
      '"current" = national carbon intensity + generation mix. ' +
        '"regional" = carbon intensity by GB region. ' +
        '"date" = historical carbon intensity for a specific date (YYYY-MM-DD).'
    ),
  date: z
    .string()
    .optional()
    .describe('Date in YYYY-MM-DD format. Required for action "date".'),
});

interface FuelMix {
  fuel: string;
  perc: number;
}

interface CarbonCurrent {
  action: "current";
  timestamp: string;
  intensity_gco2_kwh: number;
  index: string;
  generation_mix: FuelMix[];
}

interface RegionEntry {
  region: string;
  intensity_gco2_kwh: number;
  index: string;
  generation_mix: FuelMix[];
}

interface CarbonRegional {
  action: "regional";
  timestamp: string;
  regions: RegionEntry[];
}

interface HalfHourEntry {
  from: string;
  to: string;
  intensity_forecast: number;
  intensity_actual: number | null;
  index: string;
}

interface CarbonDate {
  action: "date";
  date: string;
  periods: HalfHourEntry[];
  stats: {
    mean_forecast: number;
    min_forecast: number;
    max_forecast: number;
  };
}

type UkCarbonResult = CarbonCurrent | CarbonRegional | CarbonDate;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchCarbon(path: string): Promise<any> {
  const url = `${CARBON_API}${path}`;

  const cached = cache.get(url);
  if (cached) return cached;

  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Carbon Intensity API returned ${response.status}: ${body.slice(0, 300)}`
    );
  }

  const json = await response.json();
  cache.set(url, json, TTL.REALTIME);
  return json;
}

async function getCurrent(): Promise<CarbonCurrent> {
  const [intensityData, genData] = await Promise.all([
    fetchCarbon("/intensity"),
    fetchCarbon("/generation"),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const intensity = intensityData?.data?.[0] ?? ({} as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const genMix: any[] = genData?.data?.generationmix ?? [];

  return {
    action: "current",
    timestamp: intensity.from ?? new Date().toISOString(),
    intensity_gco2_kwh: Number(intensity.intensity?.actual ?? intensity.intensity?.forecast ?? 0),
    index: intensity.intensity?.index ?? "unknown",
    generation_mix: genMix.map((g) => ({
      fuel: g.fuel ?? "",
      perc: Number(g.perc ?? 0),
    })),
  };
}

async function getRegional(): Promise<CarbonRegional> {
  const data = await fetchCarbon("/regional");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const regions: any[] = data?.data?.[0]?.regions ?? [];

  return {
    action: "regional",
    timestamp: data?.data?.[0]?.from ?? new Date().toISOString(),
    regions: regions.map((r) => ({
      region: r.shortname ?? r.dnoregion ?? "unknown",
      intensity_gco2_kwh: Number(r.intensity?.forecast ?? 0),
      index: r.intensity?.index ?? "unknown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      generation_mix: (r.generationmix ?? []).map((g: any) => ({
        fuel: g.fuel ?? "",
        perc: Number(g.perc ?? 0),
      })),
    })),
  };
}

async function getByDate(date: string): Promise<CarbonDate> {
  const data = await fetchCarbon(`/intensity/date/${date}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const periods: any[] = data?.data ?? [];

  const entries: HalfHourEntry[] = periods.map((p) => ({
    from: p.from ?? "",
    to: p.to ?? "",
    intensity_forecast: Number(p.intensity?.forecast ?? 0),
    intensity_actual: p.intensity?.actual != null ? Number(p.intensity.actual) : null,
    index: p.intensity?.index ?? "unknown",
  }));

  const forecasts = entries.map((e) => e.intensity_forecast).filter((v) => v > 0);
  const mean = forecasts.length > 0
    ? Math.round((forecasts.reduce((s, v) => s + v, 0) / forecasts.length) * 10) / 10
    : 0;

  return {
    action: "date",
    date,
    periods: entries,
    stats: {
      mean_forecast: mean,
      min_forecast: forecasts.length > 0 ? Math.min(...forecasts) : 0,
      max_forecast: forecasts.length > 0 ? Math.max(...forecasts) : 0,
    },
  };
}

export async function getUkCarbonIntensity(
  params: z.infer<typeof ukCarbonSchema>
): Promise<UkCarbonResult> {
  switch (params.action) {
    case "current":
      return getCurrent();
    case "regional":
      return getRegional();
    case "date": {
      if (!params.date) {
        throw new Error('Date parameter is required for action "date".');
      }
      return getByDate(params.date);
    }
  }
}
