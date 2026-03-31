import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const BASE_URL = "https://publicationtool.jao.eu/core/api/data";
const cache = new TtlCache();

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const CORRIDORS = [
  "DE-FR", "FR-DE", "DE-NL", "NL-DE", "DE-BE", "BE-DE",
  "DE-AT", "AT-DE", "DE-PL", "PL-DE", "DE-CZ", "CZ-DE",
  "DE-DK1", "DK1-DE", "FR-BE", "BE-FR", "FR-ES", "ES-FR",
  "NL-BE", "BE-NL", "AT-CZ", "CZ-AT", "AT-HU", "HU-AT",
  "AT-SI", "SI-AT", "PL-CZ", "CZ-PL", "PL-SK", "SK-PL",
  "HU-SK", "SK-HU", "HU-RO", "RO-HU", "HR-SI", "SI-HR",
  "HR-HU", "HU-HR",
] as const;

export const auctionSchema = z.object({
  date: z
    .string()
    .describe("Auction date in YYYY-MM-DD format."),
  corridor: z
    .string()
    .describe(
      `Border corridor (e.g. DE-FR, FR-DE, NL-BE). Available: ${CORRIDORS.slice(0, 10).join(", ")}...`
    ),
});

interface AuctionResult {
  corridor: string;
  date: string;
  allocated_capacity_mw: number | null;
  auction_price_eur_mw: number | null;
  offered_capacity_mw: number | null;
  requested_capacity_mw: number | null;
}

async function fetchWithRetry(url: string, retries: number = MAX_RETRIES): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (response.ok) return response;
      if (attempt < retries && response.status >= 500) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
        continue;
      }
      const body = await response.text();
      throw new Error(`JAO API returned ${response.status}: ${body.slice(0, 300)}`);
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
  throw new Error("JAO API: max retries exceeded");
}

export async function getAuctionResults(
  params: z.infer<typeof auctionSchema>
): Promise<AuctionResult> {
  const corridor = params.corridor.toUpperCase();
  const cacheKey = `jao:${corridor}:${params.date}`;

  const cached = cache.get<AuctionResult>(cacheKey);
  if (cached) return cached;

  // JAO API requires FromUtc and ToUtc as ISO datetime range
  const fromUtc = `${params.date}T00:00:00.000Z`;
  const toUtc = `${params.date}T23:59:59.999Z`;
  const url = `${BASE_URL}/finalComputation?FromUtc=${fromUtc}&ToUtc=${toUtc}&corridor=${corridor}`;
  const response = await fetchWithRetry(url);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();

  // JAO API returns an array or single object
  const entries = Array.isArray(json) ? json : json.data ? (Array.isArray(json.data) ? json.data : [json.data]) : [json];

  if (entries.length === 0) {
    throw new Error(`No auction data for corridor ${corridor} on ${params.date}.`);
  }

  const entry = entries[0];

  const result: AuctionResult = {
    corridor,
    date: params.date,
    allocated_capacity_mw: entry.allocatedCapacity ?? entry.allocated ?? null,
    auction_price_eur_mw: entry.auctionPrice ?? entry.price ?? null,
    offered_capacity_mw: entry.offeredCapacity ?? entry.offered ?? null,
    requested_capacity_mw: entry.requestedCapacity ?? entry.requested ?? null,
  };

  cache.set(cacheKey, result, TTL.AUCTION);
  return result;
}
