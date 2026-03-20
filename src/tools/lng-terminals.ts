import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const BASE_URL = "https://alsi.gie.eu/api";
const cache = new TtlCache();

const ALSI_COUNTRIES = [
  "EU", "BE", "ES", "FR", "GB", "GR", "HR", "IT", "LT", "MT", "NL", "PL", "PT",
] as const;

type AlsiCountry = (typeof ALSI_COUNTRIES)[number];

export const lngTerminalsSchema = z.object({
  country: z
    .string()
    .optional()
    .describe(
      `Country code for LNG terminal data. Available: ${ALSI_COUNTRIES.join(", ")}. Defaults to EU aggregate.`
    ),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
});

function getApiKey(): string {
  const key = process.env.GIE_API_KEY;
  if (!key) {
    throw new Error(
      "GIE_API_KEY environment variable is required. " +
        "Get one at https://alsi.gie.eu/ (same key as AGSI+)."
    );
  }
  return key;
}

function validateCountry(code: string): AlsiCountry {
  const upper = code.toUpperCase();
  if (!ALSI_COUNTRIES.includes(upper as AlsiCountry)) {
    throw new Error(
      `Unknown country "${code}". Available: ${ALSI_COUNTRIES.join(", ")}`
    );
  }
  return upper as AlsiCountry;
}

interface TerminalEntry {
  name: string;
  lng_inventory_mcm: number;
  send_out_gwh: number;
  capacity_mcm: number;
  dtrs: number | null;
  status: string;
}

interface LngData {
  country: string;
  date: string;
  terminals: TerminalEntry[];
  total_inventory_mcm: number;
  total_send_out_gwh: number;
}

export async function getLngTerminals(
  params: z.infer<typeof lngTerminalsSchema>
): Promise<LngData> {
  const country = validateCountry(params.country ?? "EU");
  const date = params.date ?? new Date().toISOString().slice(0, 10);

  const cacheKey = `alsi:${country}:${date}`;
  const cached = cache.get<LngData>(cacheKey);
  if (cached) return cached;

  const url = `${BASE_URL}/data/${country}?date=${date}`;
  const response = await fetch(url, {
    headers: { "x-key": getApiKey() },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ALSI API returned ${response.status}: ${body.slice(0, 300)}`);
  }

  const json = await response.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries: any[] = Array.isArray(json.data) ? json.data : [];
  if (entries.length === 0) {
    throw new Error(`No LNG terminal data for ${country} on ${date}.`);
  }

  const terminals: TerminalEntry[] = entries.map((e) => ({
    name: e.name ?? e.facility ?? "Unknown",
    lng_inventory_mcm: Number(e.lngInventory ?? 0),
    send_out_gwh: Number(e.sendOut ?? 0),
    capacity_mcm: Number(e.dtsp ?? 0),
    dtrs: e.dtrs != null ? Number(e.dtrs) : null,
    status: e.status ?? "unknown",
  }));

  const totalInventory = terminals.reduce((s, t) => s + t.lng_inventory_mcm, 0);
  const totalSendOut = terminals.reduce((s, t) => s + t.send_out_gwh, 0);

  const result: LngData = {
    country,
    date: entries[0]?.gasDayStart ?? date,
    terminals,
    total_inventory_mcm: totalInventory,
    total_send_out_gwh: totalSendOut,
  };

  cache.set(cacheKey, result, TTL.STORAGE);
  return result;
}
