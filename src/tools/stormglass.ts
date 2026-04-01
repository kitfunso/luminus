import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { resolveApiKey } from "../lib/auth.js";

const API_BASE = "https://api.stormglass.io/v2";
const cache = new TtlCache();
const FORECAST_WINDOW_MS = 48 * 60 * 60 * 1000;

export const stormglassSchema = z.object({
  latitude: z.number().describe("Latitude (-90 to 90)."),
  longitude: z.number().describe("Longitude (-180 to 180)."),
  dataset: z
    .enum(["weather", "tide"])
    .optional()
    .describe(
      '"weather" = marine/offshore weather including wind at hub height, waves, swell (default). ' +
        '"tide" = tidal predictions (sea level, high/low tide times).'
    ),
});

async function getApiKey(): Promise<string> {
  try {
    return await resolveApiKey("STORMGLASS_API_KEY");
  } catch {
    throw new Error(
      "STORMGLASS_API_KEY is required. Set it as an environment variable or in ~/.luminus/keys.json. " +
        "Get a free key at https://stormglass.io/ (10 requests/day on free tier)."
    );
  }
}

interface WeatherHour {
  timestamp: string;
  wind_speed_ms: number;
  wind_direction_deg: number;
  wind_gust_ms: number;
  wave_height_m: number;
  wave_period_s: number;
  wave_direction_deg: number;
  swell_height_m: number;
  swell_period_s: number;
  sea_surface_temp_c: number;
  air_temp_c: number;
  pressure_hpa: number;
  visibility_km: number;
  cloud_cover_pct: number;
}

interface WeatherResult {
  dataset: "weather";
  source: string;
  latitude: number;
  longitude: number;
  description: string;
  hours: WeatherHour[];
  summary: {
    avg_wind_speed_ms: number;
    max_wind_gust_ms: number;
    avg_wave_height_m: number;
    max_wave_height_m: number;
    avg_sea_temp_c: number;
    conditions: string;
  };
}

interface TidePoint {
  timestamp: string;
  type: string;
  height_m: number;
}

interface TideResult {
  dataset: "tide";
  source: string;
  latitude: number;
  longitude: number;
  tides: TidePoint[];
}

type StormglassResult = WeatherResult | TideResult;

function alignToBucket(date: Date, bucketMs: number): Date {
  return new Date(Math.floor(date.getTime() / bucketMs) * bucketMs);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickSource(obj: any): number {
  // Storm Glass returns data from multiple sources; pick the best available
  if (typeof obj === "number") return obj;
  if (obj?.sg != null) return Number(obj.sg);
  if (obj?.noaa != null) return Number(obj.noaa);
  if (obj?.dwd != null) return Number(obj.dwd);
  if (obj?.icon != null) return Number(obj.icon);
  const vals = Object.values(obj ?? {}).filter((v) => typeof v === "number") as number[];
  return vals.length > 0 ? vals[0] : 0;
}

function buildWeatherUrl(lat: number, lon: number): string {
  const params = [
    "windSpeed",
    "windDirection",
    "gust",
    "waveHeight",
    "wavePeriod",
    "waveDirection",
    "swellHeight",
    "swellPeriod",
    "waterTemperature",
    "airTemperature",
    "pressure",
    "visibility",
    "cloudCover",
  ].join(",");

  const start = alignToBucket(new Date(), TTL.WEATHER);
  const end = new Date(start.getTime() + FORECAST_WINDOW_MS);

  return (
    `${API_BASE}/weather/point?lat=${lat}&lng=${lon}` +
    `&params=${params}` +
    `&start=${start.toISOString()}&end=${end.toISOString()}`
  );
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherResult> {
  const url = buildWeatherUrl(lat, lon);

  const cached = cache.get<WeatherResult>(url);
  if (cached) return cached;

  const response = await fetch(url, {
    headers: { Authorization: await getApiKey() },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Storm Glass API returned ${response.status}: ${body.slice(0, 300)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawHours: any[] = json?.hours ?? [];

  const hours: WeatherHour[] = rawHours.slice(0, 48).map((h) => ({
    timestamp: h.time ?? "",
    wind_speed_ms: Math.round(pickSource(h.windSpeed) * 10) / 10,
    wind_direction_deg: Math.round(pickSource(h.windDirection)),
    wind_gust_ms: Math.round(pickSource(h.gust) * 10) / 10,
    wave_height_m: Math.round(pickSource(h.waveHeight) * 100) / 100,
    wave_period_s: Math.round(pickSource(h.wavePeriod) * 10) / 10,
    wave_direction_deg: Math.round(pickSource(h.waveDirection)),
    swell_height_m: Math.round(pickSource(h.swellHeight) * 100) / 100,
    swell_period_s: Math.round(pickSource(h.swellPeriod) * 10) / 10,
    sea_surface_temp_c: Math.round(pickSource(h.waterTemperature) * 10) / 10,
    air_temp_c: Math.round(pickSource(h.airTemperature) * 10) / 10,
    pressure_hpa: Math.round(pickSource(h.pressure) * 10) / 10,
    visibility_km: Math.round(pickSource(h.visibility) * 10) / 10,
    cloud_cover_pct: Math.round(pickSource(h.cloudCover)),
  }));

  const windSpeeds = hours.map((h) => h.wind_speed_ms);
  const gusts = hours.map((h) => h.wind_gust_ms);
  const waves = hours.map((h) => h.wave_height_m);
  const seaTemps = hours.filter((h) => h.sea_surface_temp_c !== 0).map((h) => h.sea_surface_temp_c);

  const avg = (arr: number[]) =>
    arr.length > 0 ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10 : 0;

  const avgWind = avg(windSpeeds);
  const maxWave = waves.length > 0 ? Math.round(Math.max(...waves) * 100) / 100 : 0;

  let conditions = "Calm";
  if (avgWind > 15) conditions = "Storm conditions — offshore operations likely suspended";
  else if (avgWind > 10) conditions = "Strong winds — challenging for offshore maintenance";
  else if (avgWind > 6) conditions = "Moderate winds — good for wind generation";
  else if (avgWind > 3) conditions = "Light winds — reduced wind output";

  const result: WeatherResult = {
    dataset: "weather",
    source: "Storm Glass (marine/offshore weather)",
    latitude: lat,
    longitude: lon,
    description:
      "48-hour marine weather forecast. Key for offshore wind assessment and maintenance windows.",
    hours,
    summary: {
      avg_wind_speed_ms: avgWind,
      max_wind_gust_ms: gusts.length > 0 ? Math.round(Math.max(...gusts) * 10) / 10 : 0,
      avg_wave_height_m: avg(waves),
      max_wave_height_m: maxWave,
      avg_sea_temp_c: avg(seaTemps),
      conditions,
    },
  };

  cache.set(url, result, TTL.WEATHER);
  return result;
}

async function fetchTide(lat: number, lon: number): Promise<TideResult> {
  const url = `${API_BASE}/tide/extremes/point?lat=${lat}&lng=${lon}`;

  const cached = cache.get<TideResult>(url);
  if (cached) return cached;

  const response = await fetch(url, {
    headers: { Authorization: await getApiKey() },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Storm Glass Tide API returned ${response.status}: ${body.slice(0, 300)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawTides: any[] = json?.data ?? [];

  const tides: TidePoint[] = rawTides.slice(0, 20).map((t) => ({
    timestamp: t.time ?? "",
    type: t.type ?? "unknown",
    height_m: Math.round((Number(t.height ?? 0)) * 100) / 100,
  }));

  const result: TideResult = {
    dataset: "tide",
    source: "Storm Glass (tidal predictions)",
    latitude: lat,
    longitude: lon,
    tides,
  };

  cache.set(url, result, TTL.WEATHER);
  return result;
}

export async function getStormglass(
  params: z.infer<typeof stormglassSchema>
): Promise<StormglassResult> {
  const dataset = params.dataset ?? "weather";

  switch (dataset) {
    case "weather":
      return fetchWeather(params.latitude, params.longitude);
    case "tide":
      return fetchTide(params.latitude, params.longitude);
  }
}
