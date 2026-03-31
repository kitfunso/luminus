/**
 * GIS data source metadata — provenance, reliability, and caveats.
 *
 * Each GIS tool response includes a `source_metadata` block drawn from
 * these definitions. The goal is to make data quality and upstream
 * limitations visible to callers, not hidden behind a clean API surface.
 */

export interface GisSourceMetadata {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly licence: string;
  readonly url: string;
  readonly api_key_required: boolean;
  readonly coverage: string;
  readonly update_frequency: string;
  readonly reliability: "high" | "medium" | "low";
  readonly caveats: readonly string[];
  readonly attribution: string;
  readonly verified_at?: string;
}

export const GIS_SOURCES: Readonly<Record<string, GisSourceMetadata>> = {
  "open-meteo-elevation": {
    id: "open-meteo-elevation",
    name: "Open-Meteo Elevation API",
    provider: "Open-Meteo / Copernicus EU-DEM",
    licence: "Copernicus Licence (free, attribution required)",
    url: "https://open-meteo.com/en/docs/elevation-api",
    api_key_required: false,
    coverage: "Global (EU-DEM ~30m resolution over Europe)",
    update_frequency: "Static dataset, updated infrequently",
    reliability: "high",
    caveats: [
      "Resolution is ~30m — fine for site-level screening, not parcel-level",
      "Slope/aspect derived from a 3x3 grid around the point (Horn's method)",
      "Urban areas and steep valleys may have elevation artefacts",
    ],
    attribution: "Data: Copernicus EU-DEM via Open-Meteo",
  },
  "overpass-osm": {
    id: "overpass-osm",
    name: "Overpass API (OpenStreetMap)",
    provider: "OpenStreetMap contributors",
    licence: "ODbL (Open Data Commons Open Database License)",
    url: "https://wiki.openstreetmap.org/wiki/Overpass_API",
    api_key_required: false,
    coverage: "Global — but completeness varies by region",
    update_frequency: "Near-real-time (OSM edits propagate within minutes to hours)",
    reliability: "medium",
    caveats: [
      "Public endpoints can be slow or rate-limited under load",
      "Substation and line tagging is volunteer-maintained — some assets may be missing or incorrectly tagged",
      "Voltage values are often absent or imprecise for lower-voltage infrastructure",
      "Three fallback endpoints are used, but all can be degraded simultaneously",
    ],
    attribution: "Data: OpenStreetMap contributors (ODbL)",
  },
  "natural-england": {
    id: "natural-england",
    name: "Natural England Open Data Geoportal",
    provider: "Natural England / ArcGIS Online",
    licence: "OGL v3 (Open Government Licence)",
    url: "https://naturalengland-defra.opendata.arcgis.com/",
    api_key_required: false,
    coverage: "England only (not Scotland, Wales, or Northern Ireland)",
    update_frequency: "Updated periodically — typically monthly to quarterly",
    reliability: "medium",
    caveats: [
      "Covers England only — Scotland (NatureScot) and Wales (NRW) use separate services",
      "ArcGIS field names and service slugs can change between service versions",
      "Individual layers may be temporarily unavailable while the service is updated",
      "Bounding-box queries may return features that only partially intersect the search area",
    ],
    attribution:
      "Contains Natural England data. Contains Ordnance Survey data. Crown copyright and database rights.",
  },
  "natural-england-alc": {
    id: "natural-england-alc",
    name: "Natural England Agricultural Land Classification",
    provider: "Natural England / ArcGIS Online",
    licence: "OGL v3 (Open Government Licence)",
    url: "https://naturalengland-defra.opendata.arcgis.com/",
    api_key_required: false,
    coverage: "England only, with patchy detailed-survey coverage and provisional fallback",
    update_frequency: "Updated periodically — typically monthly to quarterly",
    reliability: "medium",
    caveats: [
      "Detailed post-1988 surveys are incomplete, so many locations fall back to provisional ALC",
      "Provisional Grade 3 does not distinguish 3a from 3b, so BMV status can be uncertain",
      "England only — there is no equivalent coverage in this tool yet for Scotland, Wales, or Northern Ireland",
      "ArcGIS field names and service slugs can change between service versions",
    ],
    attribution:
      "Contains Natural England Agricultural Land Classification data. Contains Ordnance Survey data. Crown copyright and database rights.",
  },
  "pvgis": {
    id: "pvgis",
    name: "PVGIS (Photovoltaic Geographical Information System)",
    provider: "European Commission Joint Research Centre",
    licence: "Free access, no key required",
    url: "https://re.jrc.ec.europa.eu/pvg_tools/",
    api_key_required: false,
    coverage: "Europe, Africa, parts of Asia and Americas",
    update_frequency: "Updated with new satellite data roughly annually",
    reliability: "high",
    caveats: [
      "Optimal tilt angle sometimes returns 0 for UK latitudes — appears to be a PVGIS default",
      "Monthly averages are long-term climatological values, not current-year",
      "Coastal and mountainous sites may differ from the grid-cell average",
    ],
    attribution: "Data: PVGIS, European Commission Joint Research Centre",
  },
} as const;

/** Health check endpoint for each GIS source. */
export interface GisHealthCheckConfig {
  readonly source_id: string;
  readonly url: string;
  readonly method: "GET" | "POST";
  readonly body?: string;
  readonly timeout_ms: number;
  /** A function that checks whether the response body looks sane. */
  readonly validate: (status: number, body: string) => string | null;
}

export const GIS_HEALTH_CHECKS: readonly GisHealthCheckConfig[] = [
  {
    source_id: "open-meteo-elevation",
    url: "https://api.open-meteo.com/v1/elevation?latitude=51.5&longitude=-0.1",
    method: "GET",
    timeout_ms: 10_000,
    validate: (status, body) => {
      if (status !== 200) return `HTTP ${status}`;
      try {
        const json = JSON.parse(body);
        if (!Array.isArray(json.elevation) || json.elevation.length === 0) {
          return "Response missing elevation array";
        }
        return null;
      } catch {
        return "Response is not valid JSON";
      }
    },
  },
  {
    source_id: "overpass-osm",
    url: "https://overpass-api.de/api/interpreter",
    method: "POST",
    body: `data=${encodeURIComponent('[out:json][timeout:10];node["power"="substation"](around:1000,51.5,-0.1);out count;')}`,
    timeout_ms: 15_000,
    validate: (status, body) => {
      if (status !== 200) return `HTTP ${status}`;
      try {
        const json = JSON.parse(body);
        if (!Array.isArray(json.elements)) {
          return "Response missing elements array";
        }
        return null;
      } catch {
        return "Response is not valid JSON";
      }
    },
  },
  {
    source_id: "natural-england",
    url: "https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/SSSI_England/FeatureServer/0/query?where=1%3D1&resultRecordCount=1&outFields=NAME&returnGeometry=false&f=json",
    method: "GET",
    timeout_ms: 15_000,
    validate: (status, body) => {
      if (status !== 200) return `HTTP ${status}`;
      try {
        const json = JSON.parse(body);
        if (json.error) return `ArcGIS error: ${json.error.message ?? "unknown"}`;
        if (!Array.isArray(json.features)) return "Response missing features array";
        return null;
      } catch {
        return "Response is not valid JSON";
      }
    },
  },
  {
    source_id: "natural-england-alc",
    url: "https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/Agricultural_Land_Classification_Post_1988/FeatureServer/0/query?where=1%3D1&resultRecordCount=1&outFields=ALC_GRADE&returnGeometry=false&f=json",
    method: "GET",
    timeout_ms: 15_000,
    validate: (status, body) => {
      if (status !== 200) return `HTTP ${status}`;
      try {
        const json = JSON.parse(body);
        if (json.error) return `ArcGIS error: ${json.error.message ?? "unknown"}`;
        if (!Array.isArray(json.features)) return "Response missing features array";
        return null;
      } catch {
        return "Response is not valid JSON";
      }
    },
  },
  {
    source_id: "pvgis",
    url: "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=51.5&lon=-0.1&peakpower=1&loss=14&outputformat=json",
    method: "GET",
    timeout_ms: 15_000,
    validate: (status, body) => {
      if (status !== 200) return `HTTP ${status}`;
      try {
        const json = JSON.parse(body);
        if (!json.outputs) return "Response missing outputs field";
        return null;
      } catch {
        return "Response is not valid JSON";
      }
    },
  },
];
