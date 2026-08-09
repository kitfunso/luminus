import { resolveApiKey } from "./auth.js";
import { TtlCache, TTL } from "./cache.js";

/**
 * Netztransparenz.de Web API client (German TSOs' transparency platform).
 *
 * The authoritative source for full German imbalance data (issue #21):
 * ENTSO-E has no German imbalance price before 2022-09-30 and historic
 * TSO-area gaps in system imbalance. reBAP (the uniform German imbalance
 * price) and NRV-Saldo (grid control cooperation system imbalance) are
 * published here.
 *
 * Auth: OAuth2 client credentials. Register free at
 * https://www.netztransparenz.de/en/Web-API for NETZTRANSPARENZ_CLIENT_ID
 * and NETZTRANSPARENZ_CLIENT_SECRET (env or ~/.luminus/keys.json).
 *
 * Responses are German-format CSV: ";" separator, "," decimal,
 * "Datum" (DD.MM.YYYY) + "von" (HH:MM) time columns.
 */

const TOKEN_URL = "https://identity.netztransparenz.de/users/connect/token";
const API_BASE = "https://ds.netztransparenz.de/api/v1";

const cache = new TtlCache();

let cachedToken: { token: string; expiresAt: number } | null = null;

/** True when both NTP credentials resolve (env or key file), without throwing. */
export async function hasNtpCredentials(): Promise<boolean> {
  try {
    await resolveApiKey("NETZTRANSPARENZ_CLIENT_ID");
    await resolveApiKey("NETZTRANSPARENZ_CLIENT_SECRET");
    return true;
  } catch {
    return false;
  }
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  const clientId = await resolveApiKey("NETZTRANSPARENZ_CLIENT_ID");
  const clientSecret = await resolveApiKey("NETZTRANSPARENZ_CLIENT_SECRET");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!response.ok) {
    throw new Error(`Netztransparenz token request failed (${response.status}).`);
  }
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Netztransparenz token response had no access_token.");
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

export interface NtpPoint {
  period: number; // quarter-hour position within the day, 1..96
  value: number;
}

/** Parse "1.234,56" / "-12,5" German decimal format. NaN when unparseable. */
export function parseGermanNumber(raw: string): number {
  return Number(raw.trim().replace(/\./g, "").replace(",", "."));
}

/**
 * Parse a Netztransparenz CSV into quarter-hour points for one date.
 * The value column is the first header containing `valueHeaderMatch`
 * (case-insensitive); rows outside `date` (DD.MM.YYYY vs YYYY-MM-DD) are
 * dropped. Exported for tests.
 */
export function parseNtpCsv(csvText: string, date: string, valueHeaderMatch: string): NtpPoint[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(";").map((h) => h.trim());
  const dateIdx = headers.findIndex((h) => h.toLowerCase() === "datum");
  const fromIdx = headers.findIndex((h) => h.toLowerCase() === "von");
  const valueIdx = headers.findIndex((h) =>
    h.toLowerCase().includes(valueHeaderMatch.toLowerCase())
  );
  if (dateIdx < 0 || fromIdx < 0 || valueIdx < 0) {
    throw new Error(
      `Netztransparenz CSV missing expected columns (Datum/von/${valueHeaderMatch}); got: ${headers.join(", ")}`
    );
  }

  const [y, m, d] = date.split("-");
  const germanDate = `${d}.${m}.${y}`;

  const points: NtpPoint[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(";");
    if ((cells[dateIdx] ?? "").trim() !== germanDate) continue;
    const time = (cells[fromIdx] ?? "").trim();
    const tm = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!tm) continue;
    const period = Number(tm[1]) * 4 + Math.floor(Number(tm[2]) / 15) + 1;
    const value = parseGermanNumber(cells[valueIdx] ?? "");
    if (!Number.isFinite(value)) continue; // gaps published as "N.A." etc.
    points.push({ period, value });
  }
  points.sort((a, b) => a.period - b.period);
  return points;
}

/**
 * Fetch one day of a NrvSaldo-group dataset.
 * dataset "reBAP" -> uniform German imbalance price (EUR/MWh);
 * dataset "NrvSaldo" -> system imbalance of the grid control cooperation (MW).
 */
export async function fetchNtpDay(dataset: "reBAP" | "NrvSaldo", date: string): Promise<NtpPoint[]> {
  const url = `${API_BASE}/data/NrvSaldo/${dataset}/Qualitaetsgesichert/${date}T00:00:00/${date}T23:59:59`;

  const cached = cache.get<NtpPoint[]>(url);
  if (cached) return cached;

  const token = await getToken();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`Netztransparenz API returned ${response.status} for ${dataset}.`);
  }
  const points = parseNtpCsv(await response.text(), date, dataset === "reBAP" ? "rebap" : "saldo");
  cache.set(url, points, TTL.BALANCING);
  return points;
}
