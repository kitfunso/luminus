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
  "eea-natura2000": {
    id: "eea-natura2000",
    name: "EEA Natura 2000 Protected Sites",
    provider: "European Environment Agency / ArcGIS REST",
    licence: "EEA public environmental data access",
    url: "https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites/Natura2000_Dyna_WM/MapServer",
    api_key_required: false,
    coverage: "EU Natura 2000 network coverage via EEA protected sites service",
    update_frequency: "Updated when EEA refreshes Natura 2000 releases",
    reliability: "medium",
    caveats: [
      "Covers Natura 2000 protected sites only, not the full set of national planning designations in each EU country",
      "Site type codes are simplified into birds or habitats directive groupings for fast screening",
      "This is a coarse screening layer, not a legal boundary determination or permitting decision",
      "ArcGIS service structure and field names can change between publishing cycles",
    ],
    attribution:
      "Contains European Environment Agency Natura 2000 protected sites data.",
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
  "ea-flood-map": {
    id: "ea-flood-map",
    name: "Environment Agency Flood Map for Planning",
    provider: "Environment Agency / DEFRA ArcGIS",
    licence: "Open Government Licence v3",
    url: "https://environment.data.gov.uk/dataset/04532375-a198-476e-985e-0579a0a11b47",
    api_key_required: false,
    coverage: "England only for Flood Map for Planning layers",
    update_frequency: "Updated periodically as national and local flood models are refreshed",
    reliability: "medium",
    caveats: [
      "England only — separate services are needed for Scotland, Wales, and Northern Ireland",
      "Flood Map for Planning is for development screening, not property-level flood advice",
      "Flood Zone 2 should be interpreted together with Flood Zone 3 and flood storage areas",
      "ArcGIS service structure and field names can change between publishing cycles",
    ],
    attribution:
      "Contains Environment Agency information licensed under the Open Government Licence v3.0.",
  },
  "corine-land-cover": {
    id: "corine-land-cover",
    name: "CORINE Land Cover 2018",
    provider: "European Environment Agency / Copernicus Land Monitoring Service",
    licence: "Copernicus Land Monitoring Service (free, attribution required)",
    url: "https://land.copernicus.eu/pan-european/corine-land-cover/clc2018",
    api_key_required: false,
    coverage: "EU27 member states plus EEA/EFTA countries. Great Britain not covered (UK withdrew after CLC 2012).",
    update_frequency: "Static — CLC 2018 is the most recent release; next update expected as CLC 2024",
    reliability: "high",
    caveats: [
      "Minimum mapping unit is 25 hectares — small parcels may not appear",
      "Great Britain is not covered; use get_agricultural_land for England instead",
      "Classification is based on 2018 satellite imagery; recent land-use changes will not be reflected",
      "ArcGIS service structure or field names may change between EEA publishing cycles",
    ],
    attribution:
      "Contains CORINE Land Cover 2018 data from the Copernicus Land Monitoring Service, " +
      "© European Environment Agency (EEA).",
  },
  "neso-gsp-lookup": {
    id: "neso-gsp-lookup",
    name: "NESO GSP-Gnode Region Lookup",
    provider: "National Energy System Operator (NESO)",
    licence: "NESO Open Data Licence",
    url: "https://api.neso.energy/dataset/2810092e-d4b2-472f-b955-d8bea01f9ec0",
    api_key_required: false,
    coverage: "Great Britain Grid Supply Point regions",
    update_frequency: "Updated infrequently — GSP boundaries change rarely",
    reliability: "high",
    caveats: [
      "Uses official NESO GSP region polygons when available, with nearest-point fallback for unresolved matches",
      "Some polygon GSP codes may not map cleanly to CSV or TEC register naming, so fallback logic remains in place",
      "Some GSP names may not match TEC register connection site names exactly",
      "Coverage is GB only — does not include Northern Ireland or offshore",
    ],
    attribution: "Contains data from the National Energy System Operator (NESO) GSP-Gnode lookup.",
  },
  "neso-tec-register": {
    id: "neso-tec-register",
    name: "NESO Transmission Entry Capacity Register",
    provider: "National Energy System Operator (NESO)",
    licence: "NESO Open Data Licence",
    url: "https://api.neso.energy/api/3/action/package_show?id=transmission-entry-capacity-tec-register",
    api_key_required: false,
    coverage: "Great Britain transmission-level connection register. Covers TEC-holding projects, not the full DNO queue.",
    update_frequency: "Twice weekly",
    reliability: "high",
    caveats: [
      "Transmission-level signal only — it is not a GB-wide DNO headroom or flexibility map",
      "Register entries reflect contracted TEC positions and project statuses, not guaranteed connection availability",
      "Connection site names in the register may not match local substation naming exactly",
      "Projects can appear multiple times because staged or technology-split agreements are still being refined by NESO",
    ],
    attribution: "Contains data from the National Energy System Operator (NESO) TEC register.",
  },
  "ssen-distribution-headroom": {
    id: "ssen-distribution-headroom",
    name: "SSEN Distribution Headroom Dashboard",
    provider: "Scottish and Southern Electricity Networks (SSEN)",
    licence: "Open Government Licence v3.0",
    url: "https://data-api.ssen.co.uk/dataset/generation-availability-and-network-capacity",
    api_key_required: false,
    coverage: "SSEN licence areas (SEPD, SHEPD, Shetland)",
    update_frequency: "Published periodically by SSEN",
    reliability: "medium",
    caveats: [
      "Coverage is limited to SSEN licence areas and does not include UKPN or NGED",
      "Headroom values are planning signals, not guaranteed connection capacity or queue position",
      "Site matching is nearest-point only; it does not infer DNO boundaries from the site list",
    ],
    attribution: "Contains data from Scottish and Southern Electricity Networks (SSEN).",
  },
  "npg-heatmap-substation-areas": {
    id: "npg-heatmap-substation-areas",
    name: "Northern Powergrid Heat Map Data - Substation Areas",
    provider: "Northern Powergrid",
    licence: "Open Government Licence v3.0",
    url: "https://northernpowergrid.opendatasoft.com/explore/dataset/heatmapsubstationareas/",
    api_key_required: false,
    coverage: "Northern Powergrid licence areas via published Primary, BSP, and GSP heat-map sites",
    update_frequency: "Published periodically by Northern Powergrid",
    reliability: "medium",
    caveats: [
      "Coverage is limited to Northern Powergrid's licence area and published heat-map sites",
      "Generation headroom is published in MW and demand headroom in MVA as planning signals, not guaranteed connection capacity",
      "This tool currently matches against published site locations and does not yet use the dataset's service-area polygons",
    ],
    attribution: "Contains data from Northern Powergrid.",
  },
  "nged-connection-queue": {
    id: "nged-connection-queue",
    name: "NGED Connection Queue",
    provider: "National Grid Electricity Distribution (NGED)",
    licence: "Open Government Licence v3.0",
    url: "https://connecteddata.nationalgrid.co.uk/dataset/connection-queue",
    api_key_required: false,
    coverage: "NGED licence areas via public per-GSP queue resources",
    update_frequency: "Published periodically by NGED",
    reliability: "medium",
    caveats: [
      "Coverage is limited to the GSP resources NGED currently publishes publicly",
      "Queue rows are project or machine records, not guaranteed available capacity",
      "A matched NESO GSP may still have no public NGED resource if naming or coverage drifts",
    ],
    attribution: "Contains data from National Grid Electricity Distribution (NGED).",
  },
  "nged-asset-limits": {
    id: "nged-asset-limits",
    name: "NGED Asset Limits (Pre-Event Transmission Distribution Limits)",
    provider: "National Grid Electricity Distribution (NGED)",
    licence: "Open Government Licence v3.0",
    url: "https://connecteddata.nationalgrid.co.uk/dataset/asset-limits-pre-event-transmission-distribution-limits",
    api_key_required: false,
    coverage: "NGED licence areas via public per-GSP TD-limit resources",
    update_frequency: "Published periodically by NGED",
    reliability: "medium",
    caveats: [
      "TD limits describe seasonal boundary transfer limits, not spare connection headroom",
      "Coverage is limited to the GSP resources NGED currently publishes publicly",
      "A matched NESO GSP may still have no public NGED TD-limit resource if naming or coverage drifts",
    ],
    attribution: "Contains data from National Grid Electricity Distribution (NGED).",
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
    source_id: "eea-natura2000",
    url: "https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites/Natura2000_Dyna_WM/MapServer/0/query?where=1%3D1&resultRecordCount=1&outFields=SITECODE%2CSITENAME%2CSITETYPE&returnGeometry=false&f=json",
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
    source_id: "corine-land-cover",
    url: "https://image.discomap.eea.europa.eu/arcgis/rest/services/Corine/CLC2018_WM/MapServer/0/query?geometry=2.35%2C48.85&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=Code_18&returnGeometry=false&resultRecordCount=1&f=json",
    method: "GET",
    timeout_ms: 15_000,
    validate: (status, body) => {
      if (status !== 200) return `HTTP ${status}`;
      try {
        const json = JSON.parse(body);
        if (json.error) return `ArcGIS error: ${json.error.message ?? "unknown"}`;
        if (!Array.isArray(json.features)) return "Response missing features array";
        const code = json.features[0]?.attributes?.Code_18;
        if (typeof code !== "string" || code.length === 0) return "Response missing Code_18 value";
        return null;
      } catch {
        return "Response is not valid JSON";
      }
    },
  },
  {
    source_id: "ea-flood-map",
    url: "https://environment.data.gov.uk/KB6uNVj5ZcJr7jUP/ArcGIS/rest/services/Flood_Map_for_Planning/FeatureServer/1/query?where=1%3D1&resultRecordCount=1&outFields=layer,type&returnGeometry=false&f=json",
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
    source_id: "neso-gsp-lookup",
    url: "https://api.neso.energy/dataset/2810092e-d4b2-472f-b955-d8bea01f9ec0/resource/bbe2cc72-a6c6-46e6-8f4e-48b879467368/download/gsp_gnode_directconnect_region_lookup.csv",
    method: "GET",
    timeout_ms: 15_000,
    validate: (status, body) => {
      if (status !== 200) return `HTTP ${status}`;
      if (!body.includes("gsp_id")) return "Response missing gsp_id column header";
      return null;
    },
  },
  {
    source_id: "neso-tec-register",
    url: "https://api.neso.energy/api/3/action/datastore_search?resource_id=17becbab-e3e8-473f-b303-3806f43a6a10&limit=1",
    method: "GET",
    timeout_ms: 15_000,
    validate: (status, body) => {
      if (status !== 200) return `HTTP ${status}`;
      try {
        const json = JSON.parse(body);
        if (!json.success) return json.error?.message ?? "NESO API reported failure";
        if (!Array.isArray(json.result?.records)) return "Response missing records array";
        return null;
      } catch {
        return "Response is not valid JSON";
      }
    },
  },
  {
    source_id: "ssen-distribution-headroom",
    url: "https://data-api.ssen.co.uk/api/3/action/package_show?id=generation-availability-and-network-capacity",
    method: "GET",
    timeout_ms: 15_000,
    validate: (status, body) => {
      if (status !== 200) return `HTTP ${status}`;
      try {
        const json = JSON.parse(body);
        const resources = Array.isArray(json.result?.resources) ? json.result.resources : [];
        const hasHeadroomCsv = resources.some((resource: { name?: string; format?: string }) =>
          resource.format === "CSV" &&
          typeof resource.name === "string" &&
          resource.name.startsWith("Headroom Dashboard Data"),
        );
        if (!hasHeadroomCsv) return "Response missing headroom CSV resource";
        return null;
      } catch {
        return "Response is not valid JSON";
      }
    },
  },
  {
    source_id: "npg-heatmap-substation-areas",
    url:
      "https://northernpowergrid.opendatasoft.com/api/explore/v2.1/catalog/datasets/heatmapsubstationareas/records?limit=1&select=name,type,substation_location",
    method: "GET",
    timeout_ms: 10_000,
    validate: (status, body) => {
      if (status !== 200) return `HTTP ${status}`;
      try {
        const json = JSON.parse(body);
        const row = Array.isArray(json.results) ? json.results[0] : null;
        if (!row) return "Response missing results";
        for (const field of ["name", "type", "substation_location"]) {
          if (!(field in row)) {
            return `Response missing field "${field}"`;
          }
        }
        return null;
      } catch {
        return "Response is not valid JSON";
      }
    },
  },
  {
    source_id: "nged-connection-queue",
    url: "https://connecteddata.nationalgrid.co.uk/api/3/action/package_show?id=connection-queue",
    method: "GET",
    timeout_ms: 15_000,
    validate: (status, body) => {
      if (status !== 200) return `HTTP ${status}`;
      try {
        const json = JSON.parse(body);
        if (!json.success) return json.error?.message ?? "NGED API reported failure";
        const resources = Array.isArray(json.result?.resources) ? json.result.resources : [];
        const hasDatastoreResource = resources.some((resource: { datastore_active?: boolean }) =>
          resource.datastore_active === true,
        );
        if (!hasDatastoreResource) return "Response missing datastore-backed queue resource";
        return null;
      } catch {
        return "Response is not valid JSON";
      }
    },
  },
  {
    source_id: "nged-asset-limits",
    url: "https://connecteddata.nationalgrid.co.uk/api/3/action/package_show?id=asset-limits-pre-event-transmission-distribution-limits",
    method: "GET",
    timeout_ms: 15_000,
    validate: (status, body) => {
      if (status !== 200) return `HTTP ${status}`;
      try {
        const json = JSON.parse(body);
        if (!json.success) return json.error?.message ?? "NGED API reported failure";
        const resources = Array.isArray(json.result?.resources) ? json.result.resources : [];
        const hasDatastoreResource = resources.some((resource: { datastore_active?: boolean }) =>
          resource.datastore_active === true,
        );
        if (!hasDatastoreResource) return "Response missing datastore-backed asset-limits resource";
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
