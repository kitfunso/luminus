import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const BASE_URL = "https://re.jrc.ec.europa.eu/api/v5_3";
const cache = new TtlCache();

export const solarSchema = z.object({
  lat: z
    .number()
    .describe("Latitude (-90 to 90). Example: 48.86 for Paris."),
  lon: z
    .number()
    .describe("Longitude (-180 to 180). Example: 2.35 for Paris."),
  year: z
    .number()
    .optional()
    .describe("Specific year for hourly time series (2005-2023). Omit for long-term monthly averages."),
});

interface MonthlyIrradiance {
  month: number;
  irradiance_kwh_m2: number;
  energy_kwh: number;
}

interface SolarResult {
  lat: number;
  lon: number;
  optimal_angle_deg: number;
  annual_irradiance_kwh_m2: number;
  annual_yield_kwh: number;
  monthly: MonthlyIrradiance[];
}

export async function getSolarIrradiance(
  params: z.infer<typeof solarSchema>
): Promise<SolarResult> {
  const { lat, lon, year } = params;

  if (lat < -90 || lat > 90) throw new Error("Latitude must be between -90 and 90.");
  if (lon < -180 || lon > 180) throw new Error("Longitude must be between -180 and 180.");

  const cacheKey = `pvgis:${lat}:${lon}:${year ?? "avg"}`;
  const cached = cache.get<SolarResult>(cacheKey);
  if (cached) return cached;

  const url = new URL(`${BASE_URL}/PVcalc`);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("peakpower", "1");
  url.searchParams.set("loss", "14");
  url.searchParams.set("outputformat", "json");
  if (year) {
    url.searchParams.set("startyear", String(year));
    url.searchParams.set("endyear", String(year));
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`PVGIS API returned ${response.status}: ${body.slice(0, 300)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();

  const outputs = json.outputs;
  if (!outputs) throw new Error("No data returned from PVGIS for this location.");

  const monthlyData = outputs.monthly?.fixed ?? [];
  const totals = outputs.totals?.fixed ?? {};
  const optimalAngle = json.inputs?.mounting_system?.fixed?.slope?.value ?? 0;

  const monthly: MonthlyIrradiance[] = monthlyData.map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (m: any) => ({
      month: m.month,
      irradiance_kwh_m2: Number(m["H(i)_m"] ?? 0),
      energy_kwh: Number(m.E_m ?? 0),
    })
  );

  const result: SolarResult = {
    lat,
    lon,
    optimal_angle_deg: Number(optimalAngle),
    annual_irradiance_kwh_m2: Number(totals["H(i)_y"] ?? 0),
    annual_yield_kwh: Number(totals.E_y ?? 0),
    monthly,
  };

  cache.set(cacheKey, result, TTL.STATIC_DATA);
  return result;
}
