import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const API_BASE = "https://archive-api.open-meteo.com/v1/archive";
const cache = new TtlCache();

export const era5WeatherSchema = z.object({
  latitude: z.number().describe("Latitude (-90 to 90)."),
  longitude: z.number().describe("Longitude (-180 to 180)."),
  start_date: z
    .string()
    .describe("Start date YYYY-MM-DD. ERA5 data available from 1940."),
  end_date: z
    .string()
    .describe("End date YYYY-MM-DD. Usually available up to 5 days ago."),
  variables: z
    .enum(["wind", "solar", "temperature", "all"])
    .optional()
    .describe(
      '"wind" = wind speed at 10m and 100m hub height. ' +
        '"solar" = GHI, DNI, diffuse radiation. ' +
        '"temperature" = 2m temperature, dewpoint, soil temperature. ' +
        '"all" = all variables (default).'
    ),
});

interface HourlyEntry {
  timestamp: string;
  [key: string]: string | number | null;
}

interface Era5Result {
  source: string;
  latitude: number;
  longitude: number;
  start_date: string;
  end_date: string;
  variables: string[];
  hourly_count: number;
  hourly: HourlyEntry[];
  daily_summary: DailySummary[];
}

interface DailySummary {
  date: string;
  temp_mean_c: number | null;
  temp_min_c: number | null;
  temp_max_c: number | null;
  wind_10m_mean_ms: number | null;
  wind_100m_mean_ms: number | null;
  ghi_wh_m2: number | null;
}

function getHourlyParams(variables?: string): string {
  const wind = "windspeed_10m,windspeed_100m,winddirection_10m,winddirection_100m";
  const solar =
    "shortwave_radiation,direct_radiation,diffuse_radiation,direct_normal_irradiance";
  const temp = "temperature_2m,dewpoint_2m,soil_temperature_0cm";

  switch (variables) {
    case "wind":
      return wind;
    case "solar":
      return solar;
    case "temperature":
      return temp;
    default:
      return `${temp},${wind},${solar}`;
  }
}

export async function getEra5Weather(
  params: z.infer<typeof era5WeatherSchema>
): Promise<Era5Result> {
  const vars = params.variables ?? "all";
  const hourlyParams = getHourlyParams(vars);

  const url =
    `${API_BASE}?latitude=${params.latitude}&longitude=${params.longitude}` +
    `&start_date=${params.start_date}&end_date=${params.end_date}` +
    `&hourly=${hourlyParams}&timezone=UTC`;

  const cached = cache.get<Era5Result>(url);
  if (cached) return cached;

  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Open-Meteo Archive API returned ${response.status}: ${body.slice(0, 300)}`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();
  const hourlyData = json.hourly ?? {};
  const times: string[] = hourlyData.time ?? [];

  // Build hourly entries (cap at 168 = 7 days of hourly)
  const maxEntries = Math.min(times.length, 168);
  const hourly: HourlyEntry[] = [];

  for (let i = 0; i < maxEntries; i++) {
    const entry: HourlyEntry = { timestamp: times[i] };
    for (const [key, values] of Object.entries(hourlyData)) {
      if (key === "time") continue;
      const arr = values as (number | null)[];
      entry[key] = arr[i] ?? null;
    }
    hourly.push(entry);
  }

  // Build daily summaries
  const dailyMap = new Map<
    string,
    { temps: number[]; wind10: number[]; wind100: number[]; ghi: number[] }
  >();

  for (let i = 0; i < times.length; i++) {
    const date = times[i].slice(0, 10);
    if (!dailyMap.has(date)) {
      dailyMap.set(date, { temps: [], wind10: [], wind100: [], ghi: [] });
    }
    const bucket = dailyMap.get(date)!;

    const temp = hourlyData.temperature_2m?.[i];
    if (temp != null) bucket.temps.push(temp);

    const w10 = hourlyData.windspeed_10m?.[i];
    if (w10 != null) bucket.wind10.push(w10);

    const w100 = hourlyData.windspeed_100m?.[i];
    if (w100 != null) bucket.wind100.push(w100);

    const ghi = hourlyData.shortwave_radiation?.[i];
    if (ghi != null) bucket.ghi.push(ghi);
  }

  const dailySummary: DailySummary[] = [];
  for (const [date, bucket] of dailyMap.entries()) {
    const avg = (arr: number[]) =>
      arr.length > 0 ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10 : null;
    const sum = (arr: number[]) =>
      arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0)) : null;

    dailySummary.push({
      date,
      temp_mean_c: avg(bucket.temps),
      temp_min_c: bucket.temps.length > 0 ? Math.round(Math.min(...bucket.temps) * 10) / 10 : null,
      temp_max_c: bucket.temps.length > 0 ? Math.round(Math.max(...bucket.temps) * 10) / 10 : null,
      wind_10m_mean_ms: avg(bucket.wind10),
      wind_100m_mean_ms: avg(bucket.wind100),
      ghi_wh_m2: sum(bucket.ghi),
    });
  }

  const variableNames = Object.keys(hourlyData).filter((k) => k !== "time");

  const result: Era5Result = {
    source: "Open-Meteo Archive (ERA5 reanalysis, Copernicus/ECMWF)",
    latitude: json.latitude ?? params.latitude,
    longitude: json.longitude ?? params.longitude,
    start_date: params.start_date,
    end_date: params.end_date,
    variables: variableNames,
    hourly_count: times.length,
    hourly,
    daily_summary: dailySummary,
  };

  cache.set(url, result, TTL.WEATHER);
  return result;
}
