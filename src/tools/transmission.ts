import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { COUNTRY_BBOXES } from "../lib/zone-codes.js";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const cache = new TtlCache();

export const transmissionSchema = z.object({
  country: z
    .string()
    .optional()
    .describe(
      `Country code to look up bounding box. Available: ${Object.keys(COUNTRY_BBOXES).join(", ")}. ` +
        "Use this OR provide lat/lon bounds directly."
    ),
  lat_min: z.number().optional().describe("Southern latitude bound."),
  lon_min: z.number().optional().describe("Western longitude bound."),
  lat_max: z.number().optional().describe("Northern latitude bound."),
  lon_max: z.number().optional().describe("Eastern longitude bound."),
  min_voltage_kv: z
    .number()
    .optional()
    .describe("Minimum voltage in kV to filter lines. Defaults to 220 (high-voltage only)."),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of lines to return. Defaults to 100."),
});

interface TransmissionLine {
  id: number;
  voltage_kv: number;
  operator: string | null;
  cables: number | null;
  coordinates: Array<{ lat: number; lon: number }>;
}

export async function getTransmissionLines(
  params: z.infer<typeof transmissionSchema>
): Promise<{
  bbox: [number, number, number, number];
  line_count: number;
  lines: TransmissionLine[];
}> {
  let bbox: [number, number, number, number];

  if (params.country) {
    const upper = params.country.toUpperCase();
    const countryBbox = COUNTRY_BBOXES[upper];
    if (!countryBbox) {
      throw new Error(
        `No bounding box for "${upper}". Available: ${Object.keys(COUNTRY_BBOXES).join(", ")}`
      );
    }
    bbox = countryBbox;
  } else if (
    params.lat_min != null &&
    params.lon_min != null &&
    params.lat_max != null &&
    params.lon_max != null
  ) {
    bbox = [params.lat_min, params.lon_min, params.lat_max, params.lon_max];
  } else {
    throw new Error("Provide either 'country' or all four bounding box parameters.");
  }

  const minVoltageV = (params.min_voltage_kv ?? 220) * 1000;
  const maxResults = params.limit ?? 100;

  const cacheKey = `overpass:${bbox.join(",")}:${minVoltageV}:${maxResults}`;
  const cached = cache.get<{ bbox: [number, number, number, number]; line_count: number; lines: TransmissionLine[] }>(cacheKey);
  if (cached) return cached;

  // Overpass bbox format: south, west, north, east
  const bboxStr = `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`;
  const query = `[out:json][timeout:30];way["power"="line"]["voltage"](${bboxStr});out geom;`;

  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Overpass API returned ${response.status}: ${body.slice(0, 300)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();
  const elements = Array.isArray(json.elements) ? json.elements : [];

  let lines: TransmissionLine[] = [];

  for (const el of elements) {
    const voltageStr = el.tags?.voltage ?? "0";
    // Voltage can be semicolon-separated for multi-circuit lines (e.g. "380000;220000")
    const voltageV = Number(voltageStr.split(";")[0]);
    if (voltageV < minVoltageV) continue;

    const coords = Array.isArray(el.geometry)
      ? el.geometry.map((g: { lat: number; lon: number }) => ({ lat: g.lat, lon: g.lon }))
      : [];

    lines.push({
      id: el.id,
      voltage_kv: Math.round(voltageV / 1000),
      operator: el.tags?.operator ?? null,
      cables: el.tags?.cables ? Number(el.tags.cables) : null,
      coordinates: coords,
    });
  }

  // Sort by voltage descending, then limit
  lines.sort((a, b) => b.voltage_kv - a.voltage_kv);
  lines = lines.slice(0, maxResults);

  const result = { bbox, line_count: lines.length, lines };
  cache.set(cacheKey, result, TTL.STATIC_DATA);
  return result;
}
