import { z } from "zod";
import { fetchNtpDay, hasNtpCredentials } from "../lib/netztransparenz.js";

/**
 * German system imbalance (NRV-Saldo) from netztransparenz.de (issue #21).
 * ENTSO-E's per-TSO German imbalance volumes have historic control-area gaps,
 * so summing them undercounts; NRV-Saldo is the authoritative national series
 * published by the grid control cooperation.
 */

export const germanImbalanceSchema = z.object({
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format. Defaults to today."),
});

interface ImbalancePoint {
  period: number;
  imbalance_mw: number;
}

export async function getGermanSystemImbalance(
  params: z.infer<typeof germanImbalanceSchema>
): Promise<{
  date: string;
  source: string;
  points: ImbalancePoint[];
  stats: { min: number; max: number; mean: number };
}> {
  if (!(await hasNtpCredentials())) {
    throw new Error(
      "NETZTRANSPARENZ_CLIENT_ID and NETZTRANSPARENZ_CLIENT_SECRET are required. " +
        "Register free at https://www.netztransparenz.de/en/Web-API, then set them " +
        "as environment variables or in ~/.luminus/keys.json."
    );
  }

  const date = params.date ?? new Date().toISOString().slice(0, 10);
  const points: ImbalancePoint[] = (await fetchNtpDay("NrvSaldo", date)).map((p) => ({
    period: p.period,
    imbalance_mw: p.value,
  }));

  const values = points.map((p) => p.imbalance_mw);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const mean =
    values.length > 0
      ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100
      : 0;

  return {
    date,
    source: "netztransparenz_nrv_saldo",
    points,
    stats: { min, max, mean },
  };
}
