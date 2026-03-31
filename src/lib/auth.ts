import { z } from "zod";
import { readFile, stat } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";

// ConfigurationError

export class ConfigurationError extends Error {
  constructor(keyName: string) {
    super(
      `API key "${keyName}" is not configured.\n\n` +
        `Resolution order:\n` +
        `  1. Environment variable: ${keyName}\n` +
        `  2. Key file: ${join(homedir(), ".luminus", "keys.json")} → { "${keyName}": "..." }\n\n` +
        `Set one of the above and restart the server.`
    );
    this.name = "ConfigurationError";
  }
}

// Key file schema + cache

const KeyFileSchema = z.record(z.string(), z.string());

let cachedKeyFile: Record<string, string> | null = null;
let keyFileChecked = false;

const KEYS_PATH = join(homedir(), ".luminus", "keys.json");

async function warnOpenPermissions(filePath: string): Promise<void> {
  if (process.platform === "win32") return;
  try {
    const info = await stat(filePath);
    const mode = info.mode & 0o777;
    if (mode & 0o077) {
      process.stderr.write(
        `[luminus] WARNING: ${filePath} is readable by others (mode ${mode.toString(8)}). ` +
          `Run: chmod 600 ${filePath}\n`
      );
    }
  } catch {
    // stat failed — file may not exist, which is fine
  }
}

async function loadKeyFile(): Promise<Record<string, string>> {
  if (keyFileChecked) return cachedKeyFile ?? {};

  keyFileChecked = true;
  try {
    await warnOpenPermissions(KEYS_PATH);
    const raw = await readFile(KEYS_PATH, "utf-8");
    const parsed = KeyFileSchema.parse(JSON.parse(raw));
    cachedKeyFile = parsed;
    return parsed;
  } catch (err: unknown) {
    // Distinguish "file not found" (normal) from "file exists but is broken" (warn)
    const isNotFound =
      err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT";
    if (!isNotFound) {
      process.stderr.write(
        `[luminus] WARNING: failed to load ${KEYS_PATH}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    cachedKeyFile = null;
    return {};
  }
}

// Resolved key cache (in-memory, per-process)

const resolvedKeys = new Map<string, string>();

/**
 * Resolve an API key by name. Tries environment variables first, then
 * ~/.luminus/keys.json. Throws ConfigurationError if not found.
 * Resolved values are cached in memory for the process lifetime.
 */
export async function resolveApiKey(name: string): Promise<string> {
  const cached = resolvedKeys.get(name);
  if (cached !== undefined) return cached;

  // Layer 1: environment variable
  const envValue = process.env[name];
  if (envValue) {
    resolvedKeys.set(name, envValue);
    return envValue;
  }

  // Layer 2: key file
  const fileKeys = await loadKeyFile();
  const fileValue = fileKeys[name];
  if (fileValue) {
    resolvedKeys.set(name, fileValue);
    return fileValue;
  }

  // Not found
  throw new ConfigurationError(name);
}

/** Constant-time string comparison. Reserved for future client authentication. */
export function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Map of tool name to required API key names.
 * Empty array = public API, no key needed.
 */
export const TOOL_KEY_REQUIREMENTS: Readonly<Record<string, readonly string[]>> = {
  // ENTSO-E tools
  get_generation_mix: ["ENTSOE_API_KEY"],
  get_day_ahead_prices: ["ENTSOE_API_KEY"],
  get_cross_border_flows: ["ENTSOE_API_KEY"],
  get_carbon_intensity: ["ENTSOE_API_KEY"],
  get_balancing_prices: ["ENTSOE_API_KEY"],
  get_renewable_forecast: ["ENTSOE_API_KEY"],
  get_demand_forecast: ["ENTSOE_API_KEY"],
  get_outages: ["ENTSOE_API_KEY"],
  get_net_positions: ["ENTSOE_API_KEY"],
  get_transfer_capacities: ["ENTSOE_API_KEY"],
  get_hydro_reservoir: ["ENTSOE_API_KEY"],
  get_intraday_prices: ["ENTSOE_API_KEY"],
  get_imbalance_prices: ["ENTSOE_API_KEY"],
  get_intraday_da_spread: ["ENTSOE_API_KEY"],
  get_realtime_generation: ["ENTSOE_API_KEY"],
  get_balancing_actions: ["ENTSOE_API_KEY"],
  get_ancillary_prices: ["ENTSOE_API_KEY"],
  get_remit_messages: ["ENTSOE_API_KEY"],
  get_price_spread_analysis: ["ENTSOE_API_KEY"],

  // GIE (Gas Infrastructure Europe) tools
  get_gas_storage: ["GIE_API_KEY"],
  get_lng_terminals: ["GIE_API_KEY"],

  // EIA (US Energy Information Administration)
  get_us_gas_data: ["EIA_API_KEY"],

  // Fingrid (Finnish grid)
  get_fingrid_data: ["FINGRID_API_KEY"],

  // REE ESIOS (Spanish grid)
  get_ree_esios: ["ESIOS_API_TOKEN"],

  // Storm Glass (marine weather)
  get_stormglass: ["STORMGLASS_API_KEY"],

  // Public APIs — no key required
  get_weather_forecast: [],
  get_uk_carbon_intensity: [],
  get_uk_grid_demand: [],
  get_power_plants: [],
  get_auction_results: [],
  get_solar_irradiance: [],
  get_eu_frequency: [],
  get_transmission_lines: [],
  get_energy_charts: [],
  get_commodity_prices: [],
  get_nordpool_prices: [],
  get_smard_data: [],
  get_ember_data: [],
  get_entsog_data: [],
  get_elexon_bmrs: [],
  get_era5_weather: [],
  get_regelleistung: [],
  get_rte_france: [],
  get_energi_data: [],
  get_hydro_inflows: [],
  get_acer_remit: [],
  get_terna_data: [],
  get_eu_gas_price: [],
  get_terrain_analysis: [],
  get_grid_proximity: [],
} as const;

/**
 * Check whether all API keys for a tool are resolvable right now.
 * Checks environment variables and the cached key file synchronously.
 * Returns true for tools with no key requirements.
 */
export function hasRequiredKeys(toolName: string): boolean {
  const requirements = TOOL_KEY_REQUIREMENTS[toolName];
  if (!requirements || requirements.length === 0) return true;

  return requirements.every((keyName) => {
    // Check in-memory cache first
    if (resolvedKeys.has(keyName)) return true;
    // Check env
    if (process.env[keyName]) return true;
    // Check file cache (loaded asynchronously, may not be ready yet)
    if (cachedKeyFile?.[keyName]) return true;
    return false;
  });
}

/** Check whether a specific API key name is available (env or key file). */
export function isKeyConfigured(keyName: string): boolean {
  if (resolvedKeys.has(keyName)) return true;
  if (process.env[keyName]) return true;
  if (cachedKeyFile?.[keyName]) return true;
  return false;
}

/** Pre-load keys.json so hasRequiredKeys works immediately. */
export async function preloadKeyFile(): Promise<void> {
  await loadKeyFile();
}
