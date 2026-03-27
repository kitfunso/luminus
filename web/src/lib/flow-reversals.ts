import type { CrossBorderFlow } from './data-fetcher';

export interface FlowReversal {
  from: string;
  to: string;
  currentFlowMW: number;
  expectedDirection: string;  // "FR->DE"
  actualDirection: string;    // "DE->FR"
  reversalMagnitude: number;  // MW in unexpected direction
}

/**
 * Detect flow reversals from cross-border flow data.
 *
 * A reversal occurs when:
 * 1. The current `flowMW` is negative (flow going opposite to the labelled direction), OR
 * 2. The `hourlyFlowMW` profile shows a sign change during the day (early hours
 *    positive but recent hours negative, or vice versa).
 */
export function detectFlowReversals(flows: CrossBorderFlow[]): FlowReversal[] {
  const reversals: FlowReversal[] = [];

  for (const flow of flows) {
    // Case 1: current net flow is negative (opposite to labelled from->to)
    if (flow.flowMW < 0) {
      reversals.push({
        from: flow.from,
        to: flow.to,
        currentFlowMW: flow.flowMW,
        expectedDirection: `${flow.from}->${flow.to}`,
        actualDirection: `${flow.to}->${flow.from}`,
        reversalMagnitude: Math.abs(flow.flowMW),
      });
      continue;
    }

    // Case 2: intraday sign change in hourly data
    if (flow.hourlyFlowMW && flow.hourlyFlowMW.length >= 4) {
      const hourly = flow.hourlyFlowMW;
      const midpoint = Math.floor(hourly.length / 2);
      const earlySlice = hourly.slice(0, midpoint);
      const recentSlice = hourly.slice(midpoint);

      const earlyAvg = earlySlice.reduce((a, b) => a + b, 0) / earlySlice.length;
      const recentAvg = recentSlice.reduce((a, b) => a + b, 0) / recentSlice.length;

      // Sign change between early and recent periods
      if (earlyAvg > 0 && recentAvg < 0) {
        reversals.push({
          from: flow.from,
          to: flow.to,
          currentFlowMW: flow.flowMW,
          expectedDirection: `${flow.from}->${flow.to}`,
          actualDirection: `${flow.to}->${flow.from}`,
          reversalMagnitude: Math.abs(recentAvg),
        });
      } else if (earlyAvg < 0 && recentAvg > 0) {
        reversals.push({
          from: flow.from,
          to: flow.to,
          currentFlowMW: flow.flowMW,
          expectedDirection: `${flow.to}->${flow.from}`,
          actualDirection: `${flow.from}->${flow.to}`,
          reversalMagnitude: Math.abs(recentAvg),
        });
      }
    }
  }

  return reversals.sort((a, b) => b.reversalMagnitude - a.reversalMagnitude);
}
