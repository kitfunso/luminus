import { z } from "zod";
import { queryEntsoe, dayRange } from "../lib/entsoe-client.js";
import { resolveZone, AVAILABLE_ZONES } from "../lib/zone-codes.js";
import { ensureArray } from "../lib/xml-parser.js";
import { TtlCache, TTL } from "../lib/cache.js";

const ELEXON_API = "https://data.elexon.co.uk/bmrs/api/v1";
const cache = new TtlCache();

export const balancingActionsSchema = z.object({
  zone: z
    .string()
    .describe(
      `Bidding zone code. Examples: DE, FR, GB. Available: ${AVAILABLE_ZONES}`
    ),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
});

interface BalancingAction {
  direction: "up" | "down";
  volume_mw: number;
  period: number;
}

interface BalancingActionsResult {
  zone: string;
  date: string;
  actions: BalancingAction[];
  summary: { total_up_mw: number; total_down_mw: number; net_mw: number };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchElexon(path: string): Promise<any> {
  const url = `${ELEXON_API}${path}`;

  const cached = cache.get(url);
  if (cached) return cached;

  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Elexon BMRS API returned ${response.status}: ${body.slice(0, 300)}`
    );
  }

  const json = await response.json();
  cache.set(url, json, TTL.BALANCING);
  return json;
}

async function getGbBalancingActions(date: string): Promise<BalancingActionsResult> {
  const data = await fetchElexon(
    `/datasets/BOD?settlementDate=${date}&format=json`
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = data?.data ?? [];
  if (rows.length === 0) {
    throw new Error("No GB balancing action data available from Elexon BMRS.");
  }

  // Aggregate volumes per settlement period and direction
  const periodMap = new Map<number, { up: number; down: number }>();

  for (const row of rows) {
    const sp = Number(row.settlementPeriod ?? 0);
    const level = Number(row.bidOfferPairNumber ?? 0);
    const volume = Number(row.bidOfferLevelTo ?? 0) - Number(row.bidOfferLevelFrom ?? 0);

    if (!periodMap.has(sp)) {
      periodMap.set(sp, { up: 0, down: 0 });
    }

    const entry = periodMap.get(sp)!;
    if (level > 0 && volume > 0) {
      entry.up += volume;
    } else if (level < 0 && volume < 0) {
      entry.down += Math.abs(volume);
    }
  }

  const actions: BalancingAction[] = [];
  for (const [period, volumes] of periodMap) {
    if (volumes.up > 0) {
      actions.push({
        direction: "up",
        volume_mw: Math.round(volumes.up),
        period,
      });
    }
    if (volumes.down > 0) {
      actions.push({
        direction: "down",
        volume_mw: Math.round(volumes.down),
        period,
      });
    }
  }

  actions.sort((a, b) => a.period - b.period);

  const totalUp = actions
    .filter((a) => a.direction === "up")
    .reduce((sum, a) => sum + a.volume_mw, 0);
  const totalDown = actions
    .filter((a) => a.direction === "down")
    .reduce((sum, a) => sum + a.volume_mw, 0);

  return {
    zone: "GB",
    date,
    actions,
    summary: {
      total_up_mw: totalUp,
      total_down_mw: totalDown,
      net_mw: totalUp - totalDown,
    },
  };
}

async function getEntsoeBalancingActions(
  zone: string,
  date?: string
): Promise<BalancingActionsResult> {
  const eic = resolveZone(zone);
  const { periodStart, periodEnd } = dayRange(date);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await queryEntsoe(
    {
      documentType: "A88",
      processType: "A16",
      controlArea_Domain: eic,
      periodStart,
      periodEnd,
    },
    TTL.BALANCING
  );

  const doc =
    data.GL_MarketDocument ?? data.Imbalance_MarketDocument ?? data.Publication_MarketDocument;
  if (!doc) throw new Error("No balancing action data returned for this zone/date.");

  const timeSeries = ensureArray(doc.TimeSeries);
  const actions: BalancingAction[] = [];

  for (const ts of timeSeries) {
    // flowDirection.direction: A01 = up (increase generation), A02 = down (decrease generation)
    const flowDir = ts["flowDirection.direction"] ?? ts.flowDirection ?? "";
    const direction: "up" | "down" = flowDir === "A02" ? "down" : "up";

    const periods = ensureArray(ts.Period);
    for (const period of periods) {
      const points = ensureArray(period.Point);
      for (const point of points) {
        const position = Number(point.position);
        const volume = Number(point.quantity ?? 0);

        if (volume > 0) {
          actions.push({
            direction,
            volume_mw: Math.round(volume),
            period: position,
          });
        }
      }
    }
  }

  actions.sort((a, b) => a.period - b.period);

  const totalUp = actions
    .filter((a) => a.direction === "up")
    .reduce((sum, a) => sum + a.volume_mw, 0);
  const totalDown = actions
    .filter((a) => a.direction === "down")
    .reduce((sum, a) => sum + a.volume_mw, 0);

  return {
    zone: zone.toUpperCase(),
    date: date ?? new Date().toISOString().slice(0, 10),
    actions,
    summary: {
      total_up_mw: totalUp,
      total_down_mw: totalDown,
      net_mw: totalUp - totalDown,
    },
  };
}

export async function getBalancingActions(
  params: z.infer<typeof balancingActionsSchema>
): Promise<BalancingActionsResult> {
  const date = params.date ?? new Date().toISOString().slice(0, 10);

  if (params.zone.toUpperCase() === "GB") {
    return getGbBalancingActions(date);
  }

  return getEntsoeBalancingActions(params.zone, params.date);
}
