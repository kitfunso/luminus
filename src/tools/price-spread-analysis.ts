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
  interval_start_utc: string;
  price: number;
  action: "charge" | "discharge" | "hold";
}

type ArbSignal = "strong_arb" | "moderate_arb" | "weak_arb" | "no_arb";

export async function getPriceSpreadAnalysis(
  params: z.infer<typeof priceSpreadAnalysisSchema>
): Promise<{
  zone: string;
  date: string;
  currency: string;
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
      currency: priceData.currency,
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

  // One cycle = one hour of charge at 1C; at finer resolution that's several intervals.
  const resolutionMinutes = priceData.resolution_minutes || 60;
  const intervalsPerCycle = Math.max(1, Math.round((cycles * 60) / resolutionMinutes));

  const sorted = [...prices].sort((a, b) => a.price - b.price);
  const chargeCount = Math.min(intervalsPerCycle, sorted.length);
  const dischargeCount = Math.min(intervalsPerCycle, sorted.length);

  const chargeStarts = new Set(sorted.slice(0, chargeCount).map((p) => p.interval_start_utc));
  const dischargeStarts = new Set(sorted.slice(-dischargeCount).map((p) => p.interval_start_utc));

  // Resolve conflicts: if the same interval appears in both, remove it from charge.
  for (const start of chargeStarts) {
    if (dischargeStarts.has(start)) {
      chargeStarts.delete(start);
    }
  }

  const chargeAvg = sorted.slice(0, chargeCount).reduce((s, p) => s + p.price, 0) / chargeCount;
  const dischargeAvg = sorted.slice(-dischargeCount).reduce((s, p) => s + p.price, 0) / dischargeCount;

  const grossSpread = Math.round((dischargeAvg - chargeAvg) * 100) / 100;
  // Net spread: discharge_price * efficiency - charge_price (efficiency loss on discharge side)
  const netSpread = Math.round((dischargeAvg * efficiency - chargeAvg) * 100) / 100;
  const revenuePerMwDay = Math.round(netSpread * cycles * 100) / 100;

  let signal: ArbSignal;
  if (netSpread > 30) signal = "strong_arb";
  else if (netSpread > 15) signal = "moderate_arb";
  else if (netSpread > 5) signal = "weak_arb";
  else signal = "no_arb";

  const schedule: ScheduleEntry[] = prices.map((p) => ({
    interval_start_utc: p.interval_start_utc,
    price: Math.round(p.price * 100) / 100,
    action: chargeStarts.has(p.interval_start_utc)
      ? ("charge" as const)
      : dischargeStarts.has(p.interval_start_utc)
        ? ("discharge" as const)
        : ("hold" as const),
  }));

  schedule.sort((a, b) => Date.parse(a.interval_start_utc) - Date.parse(b.interval_start_utc));

  const peakPrice = Math.round(Math.max(...prices.map((p) => p.price)) * 100) / 100;
  const offPeakPrice = Math.round(Math.min(...prices.map((p) => p.price)) * 100) / 100;

  return {
    zone: params.zone.toUpperCase(),
    date,
    currency: priceData.currency,
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
