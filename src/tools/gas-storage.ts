import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { resolveApiKey } from "../lib/auth.js";

const BASE_URL = "https://agsi.gie.eu/api";
const cache = new TtlCache();

const GIE_COUNTRIES = [
  "EU", "AT", "BE", "BG", "HR", "CZ", "DK", "FR", "DE",
  "HU", "IE", "IT", "LV", "NL", "PL", "PT", "RO", "SK", "ES", "SE", "GB",
] as const;

type GieCountry = (typeof GIE_COUNTRIES)[number];

export const gasStorageSchema = z.object({
  country: z
    .string()
    .describe(
      `Country code for gas storage data. Available: ${GIE_COUNTRIES.join(", ")}`
    ),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
});

async function getApiKey(): Promise<string> {
  try {
    return await resolveApiKey("GIE_API_KEY");
  } catch {
    throw new Error(
      "GIE_API_KEY is required. Set it as an environment variable or in ~/.luminus/keys.json. " +
        "Get one at https://agsi.gie.eu/ (register for API access)."
    );
  }
}

function validateCountry(code: string): GieCountry {
  const upper = code.toUpperCase();
  if (!GIE_COUNTRIES.includes(upper as GieCountry)) {
    throw new Error(
      `Unknown country "${code}". Available: ${GIE_COUNTRIES.join(", ")}`
    );
  }
  return upper as GieCountry;
}

interface StorageData {
  country: string;
  date: string;
  gas_in_storage_twh: number;
  full_pct: number;
  injection_gwh: number;
  withdrawal_gwh: number;
  net_gwh: number;
  trend_vs_last_year_pct: number | null;
  working_volume_twh: number;
}

export async function getGasStorage(
  params: z.infer<typeof gasStorageSchema>
): Promise<StorageData> {
  const country = validateCountry(params.country);
  const date = params.date ?? new Date().toISOString().slice(0, 10);

  const cacheKey = `gie:${country}:${date}`;
  const cached = cache.get<StorageData>(cacheKey);
  if (cached) return cached;

  const url = `${BASE_URL}/data/${country}?date=${date}`;
  const response = await fetch(url, {
    headers: { "x-key": await getApiKey() },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GIE API returned ${response.status}: ${body.slice(0, 300)}`);
  }

  const json = await response.json();

  // AGSI+ returns { data: [...] } with storage entries
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries: any[] = Array.isArray(json.data) ? json.data : [];
  if (entries.length === 0) {
    throw new Error(`No gas storage data for ${country} on ${date}.`);
  }

  // First entry is the aggregate for the country
  const entry = entries[0];

  const result: StorageData = {
    country,
    date: entry.gasDayStart ?? date,
    gas_in_storage_twh: Number(entry.gasInStorage ?? 0),
    full_pct: Number(entry.full ?? 0),
    injection_gwh: Number(entry.injection ?? 0),
    withdrawal_gwh: Number(entry.withdrawal ?? 0),
    net_gwh: Number(entry.netWithdrawal ?? 0),
    trend_vs_last_year_pct: entry.trend != null ? Number(entry.trend) : null,
    working_volume_twh: Number(entry.workingGasVolume ?? 0),
  };

  cache.set(cacheKey, result, TTL.STORAGE);
  return result;
}
