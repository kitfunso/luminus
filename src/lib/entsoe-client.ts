import { parseXml } from "./xml-parser.js";
import { TtlCache, TTL } from "./cache.js";
import { resolveApiKey } from "./auth.js";

const BASE_URL = "https://web-api.tp.entsoe.eu/api";

const cache = new TtlCache();

async function getApiKey(): Promise<string> {
  try {
    return await resolveApiKey("ENTSOE_API_KEY");
  } catch {
    throw new Error(
      "ENTSOE_API_KEY is required. Set it as an environment variable or in ~/.luminus/keys.json. " +
        "Get one at https://transparency.entsoe.eu/ (register → email token)."
    );
  }
}

export interface EntsoeParams {
  documentType: string;
  processType?: string;
  in_Domain?: string;
  out_Domain?: string;
  periodStart: string;
  periodEnd: string;
  [key: string]: string | undefined;
}

/** Format a Date as ENTSO-E expects: YYYYMMDDHHmm (UTC) */
export function formatEntsoeDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  return `${y}${m}${d}${h}${min}`;
}

/** Build start/end timestamps for a single day query */
export function dayRange(dateStr?: string): {
  periodStart: string;
  periodEnd: string;
} {
  const base = dateStr ? new Date(dateStr + "T00:00:00Z") : new Date();
  const start = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate())
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    periodStart: formatEntsoeDate(start),
    periodEnd: formatEntsoeDate(end),
  };
}

/**
 * Query the ENTSO-E API.
 * Returns parsed XML as JS object.
 * Caches by URL with the given TTL.
 */
export async function queryEntsoe(
  params: EntsoeParams,
  ttlMs: number = TTL.REALTIME
): Promise<Record<string, unknown>> {
  const url = new URL(BASE_URL);
  url.searchParams.set("securityToken", await getApiKey());

  for (const [key, value] of Object.entries(params)) {
    if (value != null) {
      url.searchParams.set(key, value);
    }
  }

  const cacheKey = url.toString().replace(/securityToken=[^&]+/, "token=***");

  const cached = cache.get<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const response = await fetch(url.toString());

  if (!response.ok) {
    const body = await response.text();
    // ENTSO-E returns error details in XML
    if (body.includes("Reason")) {
      const parsed = parseXml(body);
      const reason =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (parsed as any)?.Acknowledgement_MarketDocument?.Reason?.text ??
        body.slice(0, 300);
      throw new Error(`ENTSO-E API error: ${reason}`);
    }
    throw new Error(`ENTSO-E API returned ${response.status}: ${body.slice(0, 300)}`);
  }

  const xml = await response.text();
  const result = parseXml(xml);

  cache.set(cacheKey, result, ttlMs);
  return result;
}
