import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";

const CONVENTIONAL_URL =
  "https://data.open-power-system-data.org/conventional_power_plants/latest/conventional_power_plants_EU.csv";
const RENEWABLE_URL =
  "https://data.open-power-system-data.org/renewable_power_plants/latest/renewable_power_plants_EU_DE.csv";

const cache = new TtlCache();

export const powerPlantsSchema = z.object({
  country: z
    .string()
    .optional()
    .describe("ISO country code to filter (e.g. DE, FR, GB). Returns all if omitted."),
  fuel_type: z
    .string()
    .optional()
    .describe(
      "Fuel/energy type filter (e.g. Natural gas, Hard coal, Solar, Wind). Case-insensitive partial match."
    ),
  min_capacity_mw: z
    .number()
    .optional()
    .describe("Minimum capacity in MW to include. Defaults to 0."),
});

interface PowerPlant {
  name: string;
  country: string;
  capacity_mw: number;
  fuel: string;
  lat: number | null;
  lon: number | null;
  commissioned_year: number | null;
}

function parseCsvRows(csv: string): Record<string, string>[] {
  const lines = csv.split("\n");
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function fetchAndParsePlants(url: string, type: "conventional" | "renewable"): Promise<PowerPlant[]> {
  const cacheKey = `opsd:${type}`;
  const cached = cache.get<PowerPlant[]>(cacheKey);
  if (cached) return cached;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open Power System Data returned ${response.status} for ${type} plants.`);
  }

  const csv = await response.text();
  const rows = parseCsvRows(csv);
  const plants: PowerPlant[] = [];

  for (const row of rows) {
    const name = row["name"] ?? row["project_name"] ?? "";
    const country = row["country"] ?? "";
    const capacityStr = row["capacity_net_bnetza"] ?? row["capacity_gross_uba"] ??
      row["electrical_capacity"] ?? row["capacity"] ?? "";
    const capacity = parseFloat(capacityStr);
    if (isNaN(capacity) || capacity <= 0) continue;

    const fuel = row["energy_source"] ?? row["fuel"] ?? row["technology"] ?? "";
    const lat = parseFloat(row["lat"] ?? "");
    const lon = parseFloat(row["lon"] ?? "");
    const yearStr = row["commissioned"] ?? row["commissioning_date"] ?? "";
    const year = parseInt(yearStr.slice(0, 4), 10);

    plants.push({
      name: name || "Unknown",
      country: country.toUpperCase(),
      capacity_mw: Math.round(capacity * 10) / 10,
      fuel: fuel || "Unknown",
      lat: isNaN(lat) ? null : lat,
      lon: isNaN(lon) ? null : lon,
      commissioned_year: isNaN(year) ? null : year,
    });
  }

  cache.set(cacheKey, plants, TTL.STATIC_DATA);
  return plants;
}

export async function getPowerPlants(
  params: z.infer<typeof powerPlantsSchema>
): Promise<{
  filters: { country?: string; fuel_type?: string; min_capacity_mw: number };
  total_count: number;
  plants: PowerPlant[];
  total_capacity_mw: number;
}> {
  const minCap = params.min_capacity_mw ?? 0;

  // Fetch both datasets concurrently
  const [conventional, renewable] = await Promise.all([
    fetchAndParsePlants(CONVENTIONAL_URL, "conventional").catch(() => [] as PowerPlant[]),
    fetchAndParsePlants(RENEWABLE_URL, "renewable").catch(() => [] as PowerPlant[]),
  ]);

  let plants = [...conventional, ...renewable];

  // Apply filters
  if (params.country) {
    const countryUpper = params.country.toUpperCase();
    plants = plants.filter((p) => p.country === countryUpper);
  }

  if (params.fuel_type) {
    const fuelLower = params.fuel_type.toLowerCase();
    plants = plants.filter((p) => p.fuel.toLowerCase().includes(fuelLower));
  }

  plants = plants.filter((p) => p.capacity_mw >= minCap);

  // Sort by capacity descending
  plants.sort((a, b) => b.capacity_mw - a.capacity_mw);

  // Limit to top 200 to avoid huge responses
  const limited = plants.slice(0, 200);
  const total_capacity_mw =
    Math.round(plants.reduce((s, p) => s + p.capacity_mw, 0) * 10) / 10;

  return {
    filters: {
      country: params.country?.toUpperCase(),
      fuel_type: params.fuel_type,
      min_capacity_mw: minCap,
    },
    total_count: plants.length,
    plants: limited,
    total_capacity_mw,
  };
}
