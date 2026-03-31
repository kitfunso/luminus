import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const API_BASE = "https://api.open-meteo.com/v1/forecast";
const HYDRO_API = "https://archive-api.open-meteo.com/v1/archive";
const cache = new TtlCache();

/**
 * Key hydropower basins in Europe with representative coordinates.
 * River discharge data from Open-Meteo (backed by ERA5-Land) serves as
 * a proxy for hydropower inflow conditions.
 */
const HYDRO_BASINS: Record<string, { lat: number; lon: number; description: string }> = {
  NO: { lat: 60.5, lon: 7.5, description: "Norway (major hydro reservoirs)" },
  SE: { lat: 63.0, lon: 15.0, description: "Sweden (northern hydro)" },
  CH: { lat: 46.8, lon: 8.2, description: "Switzerland (Alpine hydro)" },
  AT: { lat: 47.2, lon: 13.3, description: "Austria (Alpine hydro)" },
  FR: { lat: 45.0, lon: 6.0, description: "France (Alpine + Pyrenees hydro)" },
  IT: { lat: 46.0, lon: 11.0, description: "Italy (Alpine hydro)" },
  ES: { lat: 42.5, lon: -0.5, description: "Spain (Pyrenees + central hydro)" },
  PT: { lat: 41.0, lon: -8.0, description: "Portugal (Douro basin)" },
  FI: { lat: 64.0, lon: 27.0, description: "Finland (northern hydro)" },
  RO: { lat: 45.5, lon: 24.5, description: "Romania (Carpathian hydro)" },
};

export const hydroInflowsSchema = z.object({
  country: z
    .string()
    .describe(
      `Country code for hydropower basin. Available: ${Object.keys(HYDRO_BASINS).join(", ")}. ` +
        "Data uses precipitation, snowmelt, and temperature as proxies for hydro inflow conditions."
    ),
  period: z
    .enum(["recent", "historical"])
    .optional()
    .describe(
      '"recent" = last 7 days of conditions (default). ' +
        '"historical" = last 30 days for trend analysis.'
    ),
});

interface DailyInflow {
  date: string;
  precipitation_mm: number;
  snowfall_mm: number;
  temperature_max_c: number;
  rain_mm: number;
  inflow_proxy_index: number;
}

interface HydroInflowResult {
  source: string;
  country: string;
  basin_description: string;
  latitude: number;
  longitude: number;
  period_days: number;
  daily: DailyInflow[];
  summary: {
    total_precipitation_mm: number;
    total_snowfall_mm: number;
    avg_temperature_c: number;
    avg_inflow_proxy: number;
    trend: string;
  };
}

export async function getHydroInflows(
  params: z.infer<typeof hydroInflowsSchema>
): Promise<HydroInflowResult> {
  const code = params.country.toUpperCase();
  const basin = HYDRO_BASINS[code];

  if (!basin) {
    throw new Error(
      `Unknown country "${params.country}". Available: ${Object.keys(HYDRO_BASINS).join(", ")}`
    );
  }

  const days = params.period === "historical" ? 30 : 7;
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1); // yesterday (ERA5 lag)
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);

  const url =
    `${HYDRO_API}?latitude=${basin.lat}&longitude=${basin.lon}` +
    `&start_date=${start}&end_date=${end}` +
    `&daily=precipitation_sum,snowfall_sum,temperature_2m_max,rain_sum` +
    `&timezone=UTC`;

  const cached = cache.get<HydroInflowResult>(url);
  if (cached) return cached;

  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Open-Meteo Archive returned ${response.status}: ${body.slice(0, 300)}`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();
  const dailyData = json.daily ?? {};
  const times: string[] = dailyData.time ?? [];

  const daily: DailyInflow[] = [];
  let totalPrecip = 0;
  let totalSnow = 0;
  let tempSum = 0;
  let proxySum = 0;

  for (let i = 0; i < times.length; i++) {
    const precip = Number(dailyData.precipitation_sum?.[i] ?? 0);
    const snow = Number(dailyData.snowfall_sum?.[i] ?? 0);
    const tempMax = Number(dailyData.temperature_2m_max?.[i] ?? 0);
    const rain = Number(dailyData.rain_sum?.[i] ?? 0);

    // Inflow proxy: rain + snowmelt contribution (positive temps melt accumulated snow)
    const snowmeltContrib = tempMax > 2 && snow > 0 ? Math.min(snow * 5, tempMax * 2) : 0;
    const inflowProxy = Math.round((rain + snowmeltContrib) * 10) / 10;

    daily.push({
      date: times[i],
      precipitation_mm: Math.round(precip * 10) / 10,
      snowfall_mm: Math.round(snow * 10) / 10,
      temperature_max_c: Math.round(tempMax * 10) / 10,
      rain_mm: Math.round(rain * 10) / 10,
      inflow_proxy_index: inflowProxy,
    });

    totalPrecip += precip;
    totalSnow += snow;
    tempSum += tempMax;
    proxySum += inflowProxy;
  }

  const n = daily.length || 1;
  const avgProxy = Math.round((proxySum / n) * 10) / 10;

  // Determine trend from first half vs second half
  const mid = Math.floor(n / 2);
  const firstHalf = daily.slice(0, mid).reduce((s, d) => s + d.inflow_proxy_index, 0) / (mid || 1);
  const secondHalf = daily.slice(mid).reduce((s, d) => s + d.inflow_proxy_index, 0) / ((n - mid) || 1);
  const trend = secondHalf > firstHalf * 1.2 ? "increasing" : secondHalf < firstHalf * 0.8 ? "decreasing" : "stable";

  const result: HydroInflowResult = {
    source: "Open-Meteo Archive (ERA5-Land reanalysis) — hydro inflow proxy",
    country: code,
    basin_description: basin.description,
    latitude: basin.lat,
    longitude: basin.lon,
    period_days: days,
    daily,
    summary: {
      total_precipitation_mm: Math.round(totalPrecip * 10) / 10,
      total_snowfall_mm: Math.round(totalSnow * 10) / 10,
      avg_temperature_c: Math.round((tempSum / n) * 10) / 10,
      avg_inflow_proxy: avgProxy,
      trend,
    },
  };

  cache.set(url, result, TTL.WEATHER);
  return result;
}
