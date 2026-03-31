# GIS UK/EU Tool Plan — PV/BESS Site Prospecting

## Context

Luminus MCP exposes 48 energy-market tools. This plan adds a geospatial prospecting layer so users can screen candidate land for solar PV and battery storage siting.

The existing repo already provides two building blocks:
- `get_solar_irradiance` (PVGIS) — annual/monthly irradiance and PV yield by lat/lon
- `get_transmission_lines` (OSM Overpass) — HV line routes by country or bounding box

The new GIS tools fill the remaining screening criteria: terrain, environmental constraints, and grid connection proximity. They follow the same patterns as existing tools: zod schema, async handler, built-in `fetch`, `TtlCache`, conditional registration.

---

## Proposed Tool Surface

### 1. `get_land_constraints`

Screen a location against environmental and planning exclusion zones.

**Inputs:**
```
lat: number          // WGS84 latitude
lon: number          // WGS84 longitude
radius_km: number    // Search radius (default 2, max 10)
country: string      // "GB" or ISO 3166-1 alpha-2 (determines data source)
```

**Returns (JSON):**
```
{
  lat, lon, radius_km, country,
  constraints: [
    {
      name: "Exmoor National Park",
      type: "national_park" | "sssi" | "sac" | "spa" | "aonb" | "ramsar" | "flood_zone" | "natura2000",
      distance_km: 0.3,
      area_ha: 69279,
      designation_date: "1954-01-01",
      source: "natural-england-magic"
    },
    ...
  ],
  land_use: {
    class: "agricultural",
    corine_code: 211,
    source: "corine-2018"
  },
  summary: {
    has_hard_constraint: true,
    constraint_count: 2,
    nearest_constraint_km: 0.3
  }
}
```

**Data sources:**
| Country | Source | API | Licence |
|---------|--------|-----|---------|
| GB | Natural England MAGIC | WFS `https://magic.defra.gov.uk/` | Open Government Licence v3 |
| EU-wide | EEA Natura 2000 | WFS `https://bio.discomap.eea.europa.eu/` | EEA standard reuse |
| EU-wide | CORINE Land Cover 2018 | WFS via Copernicus Land Monitoring | Free, Copernicus licence |

**Caching:** `TTL.STATIC_DATA` (24h). Designation boundaries change on multi-year cycles.

**API key:** None. All sources are free public WFS endpoints.

---

### 2. `get_grid_proximity`

Find nearest grid infrastructure (substations and HV lines) to a candidate site.

**Inputs:**
```
lat: number          // WGS84 latitude
lon: number          // WGS84 longitude
radius_km: number    // Search radius (default 5, max 25)
voltage_min_kv: number  // Minimum voltage filter (default 33)
```

**Returns (JSON):**
```
{
  lat, lon, radius_km,
  substations: [
    {
      name: "Bridgwater 132kV",
      voltage_kv: 132,
      operator: "National Grid",
      distance_km: 2.4,
      lat: 51.128,
      lon: -3.003
    },
    ...
  ],
  lines: [
    {
      voltage_kv: 400,
      operator: "National Grid",
      distance_km: 0.8,
      cables: 2
    },
    ...
  ],
  summary: {
    nearest_substation_km: 2.4,
    nearest_line_km: 0.8,
    max_nearby_voltage_kv: 400
  }
}
```

**Data source:** OpenStreetMap via Overpass API (same as existing `get_transmission_lines` tool). Queries `node["power"="substation"]` and `way["power"="line"]` within a radius.

**Caching:** `TTL.STATIC_DATA` (24h). Grid topology changes slowly.

**API key:** None. OSM Overpass is free. Rate-limited (~10k req/day).

**Note:** This tool reuses the same Overpass API pattern from `src/tools/transmission.ts`. Consider extracting shared Overpass query logic into `src/lib/overpass-client.ts` if the duplication is non-trivial.

---

### 3. `get_terrain_analysis`

Elevation, slope, and aspect for a candidate site.

**Inputs:**
```
lat: number          // WGS84 latitude
lon: number          // WGS84 longitude
```

**Returns (JSON):**
```
{
  lat, lon,
  elevation_m: 85,
  slope_deg: 3.2,
  aspect_deg: 180,
  aspect_cardinal: "S",
  flatness_score: 0.92,      // 1.0 = flat, 0.0 = vertical
  source: "open-meteo-elevation"
}
```

**Approach:** Fetch a 3x3 grid of elevation points (9 API calls or a single multi-point request) around the target location at ~30m spacing. Compute slope and aspect from the elevation differences using standard GIS formulas. The Open-Meteo elevation API accepts multiple coordinates in a single request.

**Data source:** Open-Meteo Elevation API (`https://api.open-meteo.com/v1/elevation`). Backed by Copernicus EU-DEM (30m resolution in Europe) and SRTM elsewhere. Free, no key, no registration.

**Caching:** `TTL.STATIC_DATA` (24h). Terrain does not change.

**API key:** None.

---

## Provider/Client Shape

### Existing patterns
Each tool in Luminus is a self-contained file in `src/tools/` that exports:
- A zod schema object (e.g. `solarSchema`)
- An async handler function (e.g. `getSolarIrradiance`)

Shared logic lives in `src/lib/`:
- `entsoe-client.ts` — ENTSO-E XML fetching and parsing
- `cache.ts` — in-memory TTL cache
- `auth.ts` — API key resolution

### New shared clients

**`src/lib/overpass-client.ts`** (optional, sprint 1 or 2)
Extract the Overpass API query logic that `get_transmission_lines` already uses. Both `get_transmission_lines` and `get_grid_proximity` hit the same Overpass endpoint. If the code overlap is small, keep it inline; if substantial, factor out.

**`src/lib/wfs-client.ts`** (sprint 2)
A thin wrapper for OGC WFS `GetFeature` requests. Multiple tools (`get_land_constraints`, and future tools) will query WFS endpoints. Not needed in sprint 1 if we start with a simpler API like MAGIC's REST endpoint for GB-only.

### Files created or modified per tool

| File | Purpose |
|------|---------|
| `src/tools/<name>.ts` | Schema + handler |
| `src/index.ts` | Import + conditional registration block |
| `src/lib/profiles.ts` | Add tool to `gis` profile |
| `src/lib/auth.ts` | Add to `TOOL_KEY_REQUIREMENTS` (empty array for public APIs) |
| `test/<name>.test.ts` | Unit test with mocked fetch |

---

## Caching

All three GIS tools use `TTL.STATIC_DATA` (24h). The data they return (terrain, designations, grid topology) changes on timescales of months to years.

Cache keys follow the existing pattern: `<provider>:<lat>:<lon>:<params>`.

No new TTL constants needed.

---

## Profile Registration

Add a `gis` profile to `src/lib/profiles.ts`:

```typescript
gis: [
  'get_solar_irradiance',     // existing — PV yield
  'get_transmission_lines',   // existing — HV routes
  'get_land_constraints',     // new — environmental exclusions
  'get_grid_proximity',       // new — nearest substations/lines
  'get_terrain_analysis',     // new — elevation/slope/aspect
],
```

This gives the `--profile gis` flag 5 tools for site prospecting. Usage:
```bash
npx luminus-mcp --profile gis
```

Also add GIS tools to the `full` profile (automatic — all tools are included when no profile filter is active).

---

## Coordinate Input Convention

All GIS tools accept `lat` and `lon` in WGS84 (EPSG:4326). This matches the existing `get_solar_irradiance` and `get_weather_forecast` tools. No bounding-box input in sprint 1 — single-point queries keep the tool surface simple.

For `get_land_constraints` and `get_grid_proximity`, a `radius_km` parameter defines the search area around the point. The handler converts this to a bounding box internally for the API query.

---

## Result Shapes

All results are flat JSON objects (no GeoJSON in sprint 1). This matches the existing pattern where tools return structured data, not raw API payloads.

GeoJSON output could be added later via an optional `format: "geojson"` parameter, but the default should remain plain JSON for LLM consumption.

---

## UK-First vs EU-Portable Extension Path

### Sprint 1: UK only
- `get_land_constraints` uses Natural England MAGIC REST/WFS for GB
- `get_grid_proximity` uses OSM Overpass (works globally but tested for GB)
- `get_terrain_analysis` uses Open-Meteo (works globally)

The `country` parameter on `get_land_constraints` is required in sprint 1 and only accepts `"GB"`. Invalid countries return a clear error pointing to the supported list.

### Sprint 2+: EU extension
- `get_land_constraints` adds a code path for `country != "GB"`:
  - EEA Natura 2000 WFS for protected areas
  - CORINE WFS for land use classification
  - Country-specific flood data where available
- `get_grid_proximity` already works EU-wide via OSM
- `get_terrain_analysis` already works EU-wide via Open-Meteo / EU-DEM

The handler branching is `if (country === "GB") { ... } else { ... }`, not a plugin system. Two code paths in one tool file, gated by country.

### Boundary: what stays out of Luminus MCP
- Large raster ingestion or tiling (belongs in a preprocessing pipeline, not a real-time MCP tool)
- Hosted spatial databases (PostGIS, etc.)
- Frontend map rendering (that's luminus-dashboard territory)
- Paid data sources (Ordnance Survey Premium, commercial DNO connection data)

---

## Licensing Summary

| Source | Licence | Commercial use | Attribution required |
|--------|---------|---------------|---------------------|
| Natural England MAGIC | OGL v3 | Yes | Yes (Crown Copyright) |
| EEA Natura 2000 | EEA standard reuse | Yes | Yes (EEA) |
| CORINE Land Cover | Copernicus | Yes | Yes (Copernicus) |
| OpenStreetMap | ODbL | Yes | Yes (OSM contributors) |
| Open-Meteo Elevation | CC BY 4.0 | Yes | Yes (Open-Meteo, Copernicus) |
| PVGIS | Free public service | Yes | Yes (European Commission) |

All sources are free and permit commercial use with attribution. Attribution text should be included in tool response metadata (`source` field) and documented in the README.

---

## Open Questions

1. **WFS endpoint stability:** Natural England MAGIC and EEA WFS services are free but not SLA-backed. We should add timeout + fallback error handling matching the existing `toolHandler` pattern.
2. **Overpass rate limits:** The existing `get_transmission_lines` tool already hits Overpass. Adding `get_grid_proximity` doubles the Overpass surface. May need request deduplication or a shared rate-limit counter in a future sprint.
3. **Higher-level scoring tool:** A `score_site` tool that calls all four layers (solar, terrain, constraints, grid) and returns a composite score. Deferred to sprint 2+ to keep sprint 1 small and testable.
