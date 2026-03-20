import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const API_URL = "https://www.mainsfrequency.com/api.php?unit=mHz";
const cache = new TtlCache();

export const frequencySchema = z.object({});

interface FrequencyResult {
  frequency_hz: number;
  deviation_mhz: number;
  timestamp: string;
  status: string;
}

export async function getEuFrequency(
  _params: z.infer<typeof frequencySchema>
): Promise<FrequencyResult> {
  const cacheKey = "eu-frequency";
  const cached = cache.get<FrequencyResult>(cacheKey);
  if (cached) return cached;

  const response = await fetch(API_URL);

  if (!response.ok) {
    throw new Error(`Frequency API returned ${response.status}`);
  }

  const text = await response.text();
  const mhz = Number(text.trim());

  if (isNaN(mhz)) {
    throw new Error(`Unexpected frequency API response: ${text.slice(0, 100)}`);
  }

  const frequencyHz = mhz / 1000;
  const nominalHz = 50.0;
  const deviationMhz = mhz - nominalHz * 1000;

  const status =
    Math.abs(deviationMhz) <= 20 ? "normal" :
    Math.abs(deviationMhz) <= 50 ? "minor deviation" :
    Math.abs(deviationMhz) <= 100 ? "significant deviation" :
    "critical deviation";

  const result: FrequencyResult = {
    frequency_hz: Math.round(frequencyHz * 1000) / 1000,
    deviation_mhz: Math.round(deviationMhz),
    timestamp: new Date().toISOString(),
    status,
  };

  cache.set(cacheKey, result, TTL.FREQUENCY);
  return result;
}
