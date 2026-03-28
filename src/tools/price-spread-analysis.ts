import { z } from "zod";
import { getDayAheadPrices } from "./prices.js";
import { AVAILABLE_ZONES } from "../lib/zone-codes.js";

export const priceSpreadAnalysisSchema = z.object({
  zone: z
    .string()
    .describe(
      `Bidding zone code. Examples: DE, FR, GB. Available: ${AVAILABLE_ZONES}`
    ),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
  efficiency: z
    .number()
    .optional()
    .describe("Round-trip efficiency of the BESS (0-1). Defaults to 0.88."),
  cycles: z
    .number()
    .optional()
    .describe("Target charge/discharge cycles per day. Defaults to 2."),
});

interface ScheduleEntry {
  hour: number;
  price: number;
  action: "charge" | "discharge" | "hold";
}

type ArbSignal = "strong_arb" | "moderate_arb" | "weak_arb" | "no_arb";

export async function getPriceSpreadAnalysis(
  params: z.infer<typeof priceSpreadAnalysisSchema>
): Promise<{
  zone: string;
  date: string;
  efficiency: number;
  targetCycles: number;
  grossSpread: number;
  netSpread: number;
  revenuePerMwDay: number;
  signal: ArbSignal;
  peakPrice: number;
  offPeakPrice: number;
  schedule: ScheduleEntry[];
}> {
  const efficiency = params.efficiency ?? 0.88;
  const cycles = params.cycles ?? 2;
  const date = params.date ?? new Date().toISOString().slice(0, 10);

  const priceData = await getDayAheadPrices({
    zone: params.zone,
    start_date: date,
  });

  const prices = priceData.prices;
  if (prices.length === 0) {
    return {
      zone: params.zone.toUpperCase(),
      date,
      efficiency,
      targetCycles: cycles,
      grossSpread: 0,
      netSpread: 0,
      revenuePerMwDay: 0,
      signal: "no_arb",
      peakPrice: 0,
      offPeakPrice: 0,
      schedule: [],
    };
  }

  // Sort by price to find cheapest/most expensive hours
  const sorted = [...prices].sort((a, b) => a.price_eur_mwh - b.price_eur_mwh);
  const chargeCount = Math.min(cycles, sorted.length);
  const dischargeCount = Math.min(cycles, sorted.length);

  const chargeHours = new Set(
    sorted.slice(0, chargeCount).map((p) => p.hour)
  );
  const dischargeHours = new Set(
    sorted.slice(-dischargeCount).map((p) => p.hour)
  );

  // Resolve conflicts: if same hour appears in both, remove from charge
  for (const h of chargeHours) {
    if (dischargeHours.has(h)) {
      chargeHours.delete(h);
    }
  }

  const chargeAvg = sorted.slice(0, chargeCount).reduce((s, p) => s + p.price_eur_mwh, 0) / chargeCount;
  const dischargeAvg = sorted.slice(-dischargeCount).reduce((s, p) => s + p.price_eur_mwh, 0) / dischargeCount;

  const grossSpread = Math.round((dischargeAvg - chargeAvg) * 100) / 100;
  const netSpread = Math.round(grossSpread * efficiency * 100) / 100;
  // Revenue = net_spread * hours_per_cycle (1h charge + 1h discharge = 1 MWh per cycle)
  const revenuePerMwDay = Math.round(netSpread * cycles * 100) / 100;

  let signal: ArbSignal;
  if (netSpread > 30) signal = "strong_arb";
  else if (netSpread > 15) signal = "moderate_arb";
  else if (netSpread > 5) signal = "weak_arb";
  else signal = "no_arb";

  const schedule: ScheduleEntry[] = prices.map((p) => ({
    hour: p.hour,
    price: Math.round(p.price_eur_mwh * 100) / 100,
    action: chargeHours.has(p.hour)
      ? "charge" as const
      : dischargeHours.has(p.hour)
        ? "discharge" as const
        : "hold" as const,
  }));

  schedule.sort((a, b) => a.hour - b.hour);

  const peakPrice = Math.round(Math.max(...prices.map((p) => p.price_eur_mwh)) * 100) / 100;
  const offPeakPrice = Math.round(Math.min(...prices.map((p) => p.price_eur_mwh)) * 100) / 100;

  return {
    zone: params.zone.toUpperCase(),
    date,
    efficiency,
    targetCycles: cycles,
    grossSpread,
    netSpread,
    revenuePerMwDay,
    signal,
    peakPrice,
    offPeakPrice,
    schedule,
  };
}
