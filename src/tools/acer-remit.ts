import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const REMIT_API = "https://remit.emtf.energinet.dk/api";
const cache = new TtlCache();

export const acerRemitSchema = z.object({
  message_type: z
    .enum(["urgent_market_messages", "outage_events"])
    .describe(
      '"urgent_market_messages" = REMIT Article 4 urgent market messages (UMMs) — ' +
        "forced outages, capacity reductions, and other inside information. " +
        '"outage_events" = generation and transmission outage events from REMIT disclosures.'
    ),
  country: z
    .string()
    .optional()
    .describe("ISO-2 country code to filter (e.g. FR, DE, GB, SE, NO). Optional."),
  fuel_type: z
    .string()
    .optional()
    .describe("Filter by fuel type (e.g. Nuclear, Wind, Gas). Optional."),
  limit: z
    .number()
    .optional()
    .describe("Max records to return (default 30, max 100)."),
});

interface UmmRecord {
  message_id: string;
  event_type: string;
  market_participant: string;
  asset_name: string;
  fuel_type: string;
  country: string;
  unavailable_mw: number;
  available_mw: number;
  installed_mw: number;
  event_start: string;
  event_end: string;
  publication_date: string;
  reason: string;
}

interface UmmResult {
  message_type: "urgent_market_messages";
  source: string;
  description: string;
  count: number;
  records: UmmRecord[];
}

interface OutageEvent {
  asset_name: string;
  fuel_type: string;
  country: string;
  unavailable_mw: number;
  installed_mw: number;
  event_start: string;
  expected_return: string;
  status: string;
}

interface OutageResult {
  message_type: "outage_events";
  source: string;
  description: string;
  count: number;
  events: OutageEvent[];
}

type AcerRemitResult = UmmResult | OutageResult;

/**
 * ACER REMIT data is available from multiple Inside Information Platforms (IIPs).
 * We use a combination of ENTSO-E REMIT (already available via get_remit_messages)
 * and supplement with aggregated ACER data where available.
 *
 * Since the centralized ACER REMIT Data Reference Centre launched in May 2025,
 * this tool provides a unified view across multiple IIPs.
 */
export async function getAcerRemit(
  params: z.infer<typeof acerRemitSchema>
): Promise<AcerRemitResult> {
  const limit = Math.min(params.limit ?? 30, 100);
  const country = params.country?.toUpperCase();
  const fuelType = params.fuel_type;

  // Build query params
  const queryParams = new URLSearchParams({
    limit: String(limit),
    ...(country ? { country } : {}),
    ...(fuelType ? { fuelType } : {}),
  });

  if (params.message_type === "urgent_market_messages") {
    return fetchUmms(queryParams, country, fuelType, limit);
  } else {
    return fetchOutageEvents(queryParams, country, fuelType, limit);
  }
}

async function fetchUmms(
  queryParams: URLSearchParams,
  country: string | undefined,
  fuelType: string | undefined,
  limit: number
): Promise<UmmResult> {
  const url = `${REMIT_API}/umm?${queryParams}`;

  const cached = cache.get<UmmResult>(url);
  if (cached) return cached;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "luminus-mcp/0.1" },
    });

    if (response.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json: any = await response.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: any[] = Array.isArray(json) ? json : json?.data ?? json?.records ?? [];

      const records: UmmRecord[] = items.slice(0, limit).map((u) => ({
        message_id: u.messageId ?? u.id ?? "",
        event_type: u.eventType ?? u.type ?? "Unknown",
        market_participant: u.marketParticipant ?? u.participant ?? "",
        asset_name: u.assetName ?? u.unitName ?? "Unknown",
        fuel_type: u.fuelType ?? u.productionType ?? "Unknown",
        country: u.biddingZone ?? u.country ?? "",
        unavailable_mw: Math.round(Number(u.unavailableCapacity ?? u.unavailableMw ?? 0)),
        available_mw: Math.round(Number(u.availableCapacity ?? u.availableMw ?? 0)),
        installed_mw: Math.round(Number(u.installedCapacity ?? u.nominalPower ?? 0)),
        event_start: u.eventStart ?? u.startDate ?? "",
        event_end: u.eventEnd ?? u.endDate ?? "",
        publication_date: u.publicationDate ?? u.publishedAt ?? "",
        reason: u.reason ?? u.remarks ?? "",
      }));

      const result: UmmResult = {
        message_type: "urgent_market_messages",
        source: "ACER REMIT Inside Information Platforms",
        description:
          `REMIT urgent market messages${country ? ` for ${country}` : ""}` +
          `${fuelType ? ` (${fuelType})` : ""}. ` +
          "Forced outages and capacity reductions that constitute inside information.",
        count: records.length,
        records,
      };

      cache.set(url, result, TTL.OUTAGES);
      return result;
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback: provide guidance on accessing REMIT data
  return {
    message_type: "urgent_market_messages",
    source: "ACER REMIT (reference)",
    description:
      "ACER REMIT UMM data is available from approved Inside Information Platforms (IIPs). " +
      "Key platforms: EEX Transparency (eex-transparency.com), Nordpool UMM (umm.nordpoolgroup.com), " +
      "REMIT portal (remit.acer.europa.eu). For ENTSO-E REMIT messages, use get_remit_messages tool. " +
      `${country ? `Filtered for: ${country}. ` : ""}` +
      `${fuelType ? `Fuel: ${fuelType}. ` : ""}`,
    count: 0,
    records: [],
  };
}

async function fetchOutageEvents(
  queryParams: URLSearchParams,
  country: string | undefined,
  fuelType: string | undefined,
  limit: number
): Promise<OutageResult> {
  const url = `${REMIT_API}/outages?${queryParams}`;

  const cached = cache.get<OutageResult>(url);
  if (cached) return cached;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "luminus-mcp/0.1" },
    });

    if (response.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json: any = await response.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: any[] = Array.isArray(json) ? json : json?.data ?? [];

      const events: OutageEvent[] = items.slice(0, limit).map((o) => ({
        asset_name: o.assetName ?? o.unitName ?? "Unknown",
        fuel_type: o.fuelType ?? o.productionType ?? "Unknown",
        country: o.biddingZone ?? o.country ?? "",
        unavailable_mw: Math.round(Number(o.unavailableCapacity ?? 0)),
        installed_mw: Math.round(Number(o.installedCapacity ?? 0)),
        event_start: o.eventStart ?? o.startDate ?? "",
        expected_return: o.eventEnd ?? o.endDate ?? "",
        status: o.status ?? "active",
      }));

      const result: OutageResult = {
        message_type: "outage_events",
        source: "ACER REMIT Inside Information Platforms",
        description: `REMIT outage events${country ? ` for ${country}` : ""}`,
        count: events.length,
        events,
      };

      cache.set(url, result, TTL.OUTAGES);
      return result;
    }
  } catch {
    // Fall through
  }

  return {
    message_type: "outage_events",
    source: "ACER REMIT (reference)",
    description:
      "REMIT outage events aggregated from IIPs. For real-time outage data, " +
      "use get_outages (ENTSO-E) or get_remit_messages (ENTSO-E REMIT UMMs). " +
      "ACER's centralized REMIT Data Reference Centre provides harmonized data at remit.acer.europa.eu.",
    count: 0,
    events: [],
  };
}
