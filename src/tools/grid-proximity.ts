import { z } from "zod";
import { TtlCache, TTL } from "../lib/cache.js";
import { fetchOverpassJson } from "../lib/overpass.js";

const cache = new TtlCache();

export const gridProximitySchema = z.object({
  lat: z
    .number()
    .describe("Latitude (-90 to 90). WGS84."),
  lon: z
    .number()
    .describe("Longitude (-180 to 180). WGS84."),
  radius_km: z
    .number()
    .optional()
    .describe("Search radius in km (default 5, max 25)."),
  voltage_min_kv: z
    .number()
    .optional()
    .describe("Minimum voltage in kV to include (default 33)."),
});

interface Substation {
  name: string | null;
  voltage_kv: number | null;
  operator: string | null;
  distance_km: number;
  lat: number;
  lon: number;
}

interface Line {
  voltage_kv: number;
  operator: string | null;
  distance_km: number;
  cables: number | null;
}

interface GridProximitySummary {
  nearest_substation_km: number | null;
  nearest_line_km: number | null;
  max_nearby_voltage_kv: number | null;
}

interface GridProximityResult {
  lat: number;
  lon: number;
  radius_km: number;
  substations: Substation[];
  lines: Line[];
  summary: GridProximitySummary;
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseVoltageKv(voltageStr: string | undefined): number | null {
  if (!voltageStr) return null;
  const v = Number(voltageStr.split(";")[0]);
  if (Number.isNaN(v) || v <= 0) return null;
  return Math.round(v / 1000);
}

function minDistanceToWay(
  lat: number,
  lon: number,
  geometry: Array<{ lat: number; lon: number }>,
): number {
  if (geometry.length === 0) return Infinity;
  let minDist = Infinity;
  for (const pt of geometry) {
    const d = haversineKm(lat, lon, pt.lat, pt.lon);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

export async function getGridProximity(
  params: z.infer<typeof gridProximitySchema>,
): Promise<GridProximityResult> {
  const { lat, lon } = params;
  const radiusKm = params.radius_km ?? 5;
  const voltageMinKv = params.voltage_min_kv ?? 33;

  if (lat < -90 || lat > 90) throw new Error("Latitude must be between -90 and 90.");
  if (lon < -180 || lon > 180) throw new Error("Longitude must be between -180 and 180.");
  if (radiusKm <= 0 || radiusKm > 25) throw new Error("radius_km must be between 0 and 25.");

  const cacheKey = `grid-prox:${lat}:${lon}:${radiusKm}:${voltageMinKv}`;
  const cached = cache.get<GridProximityResult>(cacheKey);
  if (cached) return cached;

  const radiusM = radiusKm * 1000;
  const query = `[out:json][timeout:30];(
    node["power"="substation"](around:${radiusM},${lat},${lon});
    way["power"="line"](around:${radiusM},${lat},${lon});
  );out geom;`;

  const json = await fetchOverpassJson<{ elements?: unknown[] }>(query);
  const elements = Array.isArray(json.elements) ? json.elements : [];

  const substations: Substation[] = [];
  const lines: Line[] = [];

  for (const el of elements as Array<any>) {
    if (el.tags?.power === "substation" && el.type === "node") {
      const vKv = parseVoltageKv(el.tags?.voltage);
      substations.push({
        name: el.tags?.name ?? null,
        voltage_kv: vKv,
        operator: el.tags?.operator ?? null,
        distance_km: Math.round(haversineKm(lat, lon, el.lat, el.lon) * 100) / 100,
        lat: el.lat,
        lon: el.lon,
      });
    }

    if (el.tags?.power === "line" && el.type === "way") {
      const vKv = parseVoltageKv(el.tags?.voltage);
      if (vKv !== null && vKv < voltageMinKv) continue;

      const geometry = Array.isArray(el.geometry)
        ? el.geometry.map((g: { lat: number; lon: number }) => ({ lat: g.lat, lon: g.lon }))
        : [];

      lines.push({
        voltage_kv: vKv ?? 0,
        operator: el.tags?.operator ?? null,
        distance_km: Math.round(minDistanceToWay(lat, lon, geometry) * 100) / 100,
        cables: el.tags?.cables ? Number(el.tags.cables) : null,
      });
    }
  }

  substations.sort((a, b) => a.distance_km - b.distance_km);
  lines.sort((a, b) => a.distance_km - b.distance_km);

  const allVoltages = [
    ...substations.map((s) => s.voltage_kv).filter((v): v is number => v !== null),
    ...lines.map((l) => l.voltage_kv),
  ];

  const summary: GridProximitySummary = {
    nearest_substation_km: substations.length > 0 ? substations[0].distance_km : null,
    nearest_line_km: lines.length > 0 ? lines[0].distance_km : null,
    max_nearby_voltage_kv: allVoltages.length > 0 ? Math.max(...allVoltages) : null,
  };

  const result: GridProximityResult = {
    lat,
    lon,
    radius_km: radiusKm,
    substations,
    lines,
    summary,
  };

  cache.set(cacheKey, result, TTL.STATIC_DATA);
  return result;
}
