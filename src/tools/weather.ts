import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const BASE_URL = "https://api.open-meteo.com/v1/forecast";
const cache = new TtlCache();

/** Capital city coordinates for default weather lookups */
const CAPITAL_COORDS: Record<string, { lat: number; lon: number; city: string }> = {
  AT: { lat: 48.21, lon: 16.37, city: "Vienna" },
  BE: { lat: 50.85, lon: 4.35, city: "Brussels" },
  BG: { lat: 42.70, lon: 23.32, city: "Sofia" },
  CH: { lat: 46.95, lon: 7.45, city: "Bern" },
  CZ: { lat: 50.08, lon: 14.42, city: "Prague" },
  DE: { lat: 52.52, lon: 13.41, city: "Berlin" },
  DK: { lat: 55.68, lon: 12.57, city: "Copenhagen" },
  EE: { lat: 59.44, lon: 24.75, city: "Tallinn" },
  ES: { lat: 40.42, lon: -3.70, city: "Madrid" },
  FI: { lat: 60.17, lon: 24.94, city: "Helsinki" },
  FR: { lat: 48.86, lon: 2.35, city: "Paris" },
  GB: { lat: 51.51, lon: -0.13, city: "London" },
  GR: { lat: 37.98, lon: 23.73, city: "Athens" },
  HR: { lat: 45.81, lon: 15.98, city: "Zagreb" },
  HU: { lat: 47.50, lon: 19.04, city: "Budapest" },
  IE: { lat: 53.35, lon: -6.26, city: "Dublin" },
  IT: { lat: 41.90, lon: 12.50, city: "Rome" },
  LT: { lat: 54.69, lon: 25.28, city: "Vilnius" },
  LV: { lat: 56.95, lon: 24.11, city: "Riga" },
  NL: { lat: 52.37, lon: 4.90, city: "Amsterdam" },
  NO: { lat: 59.91, lon: 10.75, city: "Oslo" },
  PL: { lat: 52.23, lon: 21.01, city: "Warsaw" },
  PT: { lat: 38.72, lon: -9.14, city: "Lisbon" },
  RO: { lat: 44.43, lon: 26.10, city: "Bucharest" },
  SE: { lat: 59.33, lon: 18.07, city: "Stockholm" },
  SI: { lat: 46.05, lon: 14.51, city: "Ljubljana" },
  SK: { lat: 48.15, lon: 17.11, city: "Bratislava" },
};

export const weatherSchema = z.object({
  country: z
    .string()
    .optional()
    .describe(
      `Country code for capital city lookup. Available: ${Object.keys(CAPITAL_COORDS).join(", ")}. ` +
        "Ignored if latitude/longitude are provided."
    ),
  latitude: z
    .number()
    .optional()
    .describe("Latitude (-90 to 90). Overrides country-based lookup."),
  longitude: z
    .number()
    .optional()
    .describe("Longitude (-180 to 180). Overrides country-based lookup."),
});

interface HourlyPoint {
  time: string;
  temperature_c: number;
  wind_speed_kmh: number;
  solar_radiation_wm2: number;
}

interface WeatherResult {
  location: string;
  latitude: number;
  longitude: number;
  hourly: HourlyPoint[];
  stats: {
    temp_min_c: number;
    temp_max_c: number;
    temp_mean_c: number;
    wind_mean_kmh: number;
    solar_mean_wm2: number;
  };
}

function resolveCoords(params: z.infer<typeof weatherSchema>): {
  lat: number;
  lon: number;
  location: string;
} {
  if (params.latitude != null && params.longitude != null) {
    return {
      lat: params.latitude,
      lon: params.longitude,
      location: `${params.latitude},${params.longitude}`,
    };
  }

  if (!params.country) {
    throw new Error(
      "Provide either a country code or latitude/longitude coordinates."
    );
  }

  const upper = params.country.toUpperCase();
  const coords = CAPITAL_COORDS[upper];
  if (!coords) {
    throw new Error(
      `Unknown country "${params.country}". Available: ${Object.keys(CAPITAL_COORDS).join(", ")}`
    );
  }
  return { lat: coords.lat, lon: coords.lon, location: `${coords.city}, ${upper}` };
}

export async function getWeatherForecast(
  params: z.infer<typeof weatherSchema>
): Promise<WeatherResult> {
  const { lat, lon, location } = resolveCoords(params);

  const cacheKey = `weather:${lat}:${lon}`;
  const cached = cache.get<WeatherResult>(cacheKey);
  if (cached) return cached;

  const url = new URL(BASE_URL);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set(
    "hourly",
    "temperature_2m,wind_speed_10m,shortwave_radiation"
  );

  const response = await fetch(url.toString());

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Open-Meteo API returned ${response.status}: ${body.slice(0, 300)}`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();
  const h = json.hourly;

  if (!h || !h.time) {
    throw new Error("No hourly forecast data returned.");
  }

  const times: string[] = h.time;
  const temps: number[] = h.temperature_2m;
  const winds: number[] = h.wind_speed_10m;
  const solar: number[] = h.shortwave_radiation;

  const hourly: HourlyPoint[] = times.map((t, i) => ({
    time: t,
    temperature_c: temps[i] ?? 0,
    wind_speed_kmh: winds[i] ?? 0,
    solar_radiation_wm2: solar[i] ?? 0,
  }));

  const tempValues = temps.filter((v) => v != null);
  const windValues = winds.filter((v) => v != null);
  const solarValues = solar.filter((v) => v != null);

  const mean = (arr: number[]) =>
    arr.length > 0
      ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100
      : 0;

  const result: WeatherResult = {
    location,
    latitude: lat,
    longitude: lon,
    hourly,
    stats: {
      temp_min_c: tempValues.length > 0 ? Math.min(...tempValues) : 0,
      temp_max_c: tempValues.length > 0 ? Math.max(...tempValues) : 0,
      temp_mean_c: mean(tempValues),
      wind_mean_kmh: mean(windValues),
      solar_mean_wm2: mean(solarValues),
    },
  };

  cache.set(cacheKey, result, TTL.WEATHER);
  return result;
}
