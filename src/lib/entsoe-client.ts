import JSZip from "jszip";
import { parseXml, ensureArray } from "./xml-parser.js";
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

  // Some endpoints (imbalance prices/volumes, procured capacity) return a ZIP
  // of one or more XML documents instead of plain XML. Detect by magic bytes,
  // not content-type (ENTSO-E labels these inconsistently).
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isZip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

  const result = isZip
    ? await parseZipResponse(buffer)
    : parseXml(new TextDecoder().decode(buffer));

  cache.set(cacheKey, result, ttlMs);
  return result;
}

/**
 * Unzip an ENTSO-E archive response and merge its XML documents.
 * Multi-file archives share a root element; their TimeSeries are concatenated
 * under the first document's root so callers see one document.
 */
async function parseZipResponse(buffer: ArrayBuffer): Promise<Record<string, unknown>> {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length === 0) throw new Error("ENTSO-E returned an empty ZIP archive.");

  const docs: Record<string, unknown>[] = [];
  for (const entry of entries) {
    docs.push(parseXml(await entry.async("text")));
  }
  if (docs.length === 1) return docs[0];

  const rootKey = Object.keys(docs[0]).find((k) => k.includes("MarketDocument")) ?? Object.keys(docs[0])[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merged: any = { ...(docs[0][rootKey] as Record<string, unknown>) };
  const series = ensureArray<unknown>(merged.TimeSeries);
  for (const doc of docs.slice(1)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inner: any = doc[rootKey] ?? doc[Object.keys(doc)[0]];
    if (inner?.TimeSeries) series.push(...ensureArray<unknown>(inner.TimeSeries));
  }
  merged.TimeSeries = series;
  return { [rootKey]: merged };
}
