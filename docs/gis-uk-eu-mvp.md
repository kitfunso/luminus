# GIS MVP: UK/EU PV & BESS Site Screening

Last updated: 2026-03-31

## Purpose

Define the minimum viable GIS layer stack for Luminus MCP to support solar PV and battery storage site screening, starting with the UK and designed for EU portability.

This is a screening tool, not a full GIS platform. It answers: "Given a candidate location, what are the obvious show-stoppers and how good is the solar resource?" It does not answer: "Find me the best site in England."

---

## MVP Layer Stack (UK-first)

Six layers, in priority order. Each maps to a concrete data source with a known-good licence.

### Layer 1: Solar Resource (PVGIS)

- **Purpose:** Score any UK/EU location for annual solar yield (kWh/kWp) and optimal tilt.
- **Source:** PVGIS REST API (already in Luminus as `get_solar_irradiance`).
- **MCP integration:** Extend existing tool or add a `gis_solar_resource` tool that returns irradiance, optimal angle, and estimated yield for a lat/lon.
- **Work required:** Minimal. Mostly a wrapper around the existing tool with GIS-context framing.

### Layer 2: Land Cover Screening (CORINE)

- **Purpose:** Classify land at the candidate location. Flag unsuitable classes (urban, forest, water, wetland). Identify favourable classes (arable, pasture, industrial/commercial).
- **Source:** CORINE Land Cover 2018 (Copernicus).
- **MCP integration:** Pre-download UK + EU CORINE vector tiles. New `gis_land_cover` tool takes lat/lon, returns CLC class, suitability flag, and area context.
- **Work required:** Medium. Need to download, clip, and index CORINE data. Decide on a lightweight spatial lookup (e.g. pre-processed GeoJSON per country tile, or SQLite with SpatiaLite).

### Layer 3: Protected Areas Exclusion (Natura 2000 + SSSIs)

- **Purpose:** Hard exclusion check. Is the candidate location inside or within a buffer of a Natura 2000 site, SSSI, ASSI, SAC, or SPA?
- **Source:** EEA Natura 2000 dataset (EU-wide) + Natural England/NatureScot/NRW SSSI boundaries (UK).
- **MCP integration:** New `gis_protected_areas` tool. Takes lat/lon plus optional buffer distance (default 500 m). Returns list of nearby designations with distance and type.
- **Work required:** Medium. Download and merge datasets. Point-in-polygon plus buffer query.

### Layer 4: Slope & Aspect (Copernicus DEM)

- **Purpose:** Flag sites with excessive slope (>10 degrees problematic, >15 degrees usually unviable for ground-mount PV) or unfavourable aspect (north-facing in Northern Hemisphere).
- **Source:** Copernicus GLO-30 DEM.
- **MCP integration:** Pre-compute slope and aspect rasters for UK, then EU countries. New `gis_terrain` tool takes lat/lon, returns elevation, slope (degrees), aspect (compass bearing), and a suitability flag.
- **Work required:** Medium-high. Need GDAL processing pipeline to derive slope/aspect from DEM tiles. Pre-compute and store as indexed lookup.

### Layer 5: Grid Proximity (OSM / OpenInfraMap)

- **Purpose:** Estimate distance to nearest HV substation (132 kV+ for UK, 110 kV+ for EU). Grid connection cost is often the largest variable cost in PV/BESS project economics.
- **Source:** OpenStreetMap power infrastructure via Overpass API or pre-extracted PBF.
- **MCP integration:** New `gis_grid_proximity` tool. Takes lat/lon, returns nearest substations (with voltage, distance, and bearing) and nearest HV transmission lines.
- **Work required:** Medium-high. Need to extract and index OSM power data. Overpass API is too slow for real-time queries at scale — pre-extract UK/EU substation and line geometries into a local spatial index.

### Layer 6: Flood Risk (UK only — Environment Agency)

- **Purpose:** Flag sites in Flood Zone 2 or 3. Not a hard exclusion for solar/BESS but triggers additional planning requirements (Flood Risk Assessment, Sequential Test).
- **Source:** Environment Agency Flood Map for Planning (England). SEPA for Scotland. NRW for Wales.
- **MCP integration:** New `gis_flood_risk` tool. Takes lat/lon, returns flood zone classification and risk level.
- **Work required:** Low-medium. Download flood zone polygons. Point-in-polygon query.

### UK Bonus Layer: Agricultural Land Classification

- **Purpose:** Flag Best and Most Versatile (BMV) agricultural land (Grades 1, 2, 3a) which faces strong planning resistance for solar development in England.
- **Source:** Natural England provisional ALC map + detailed post-1988 surveys.
- **MCP integration:** New `gis_agricultural_land` tool. Takes lat/lon, returns ALC grade and BMV flag.
- **Work required:** Low. Download from Natural England Geoportal. Simple point-in-polygon.
- **Caveat:** Provisional map lacks the 3a/3b split. Document this limitation clearly to users.

---

## Composite Screening Tool

Once individual layers are working, add a single `gis_site_screen` tool that:

1. Takes a lat/lon (and optional country hint).
2. Calls all relevant layers in parallel.
3. Returns a structured report:
   - Solar yield score (kWh/kWp/year)
   - Land cover class and suitability
   - Protected area conflicts (if any)
   - Slope/aspect assessment
   - Nearest grid connection point and distance
   - Flood risk (UK) / ALC grade (England)
   - Overall RAG (red/amber/green) rating

This composite tool is the primary user-facing value. Individual layer tools are building blocks and debugging aids.

---

## Caching & Data Strategy

- **Static layers** (CORINE, protected areas, DEM-derived slope/aspect, flood zones, ALC): Download once, pre-process, and store locally. Update annually or when new versions ship.
- **Near-static layers** (OSM grid data): Extract quarterly. Grid infrastructure changes slowly.
- **Dynamic layers** (PVGIS): Query on demand. Cache responses with a 24-hour TTL (solar resource does not change day-to-day).
- **Storage format:** GeoPackage or SpatiaLite for vector layers. Cloud-optimised GeoTIFF or pre-computed grid files for raster-derived data. Keep total local storage under 10 GB for UK; budget ~50 GB for full EU.
- **Spatial indexing:** R-tree index on all vector layers for fast point-in-polygon and nearest-neighbour queries. Critical for sub-second MCP tool responses.

---

## Profile Integration

New `--profile gis` for Luminus MCP:

```bash
npx luminus-mcp --profile gis
```

Registers the GIS screening tools only. Keeps context window cost low. Could be combined with existing profiles:

```bash
npx luminus-mcp --profile gis,uk
```

---

## EU Portability Plan

The MVP is UK-first. Expanding to EU:

| Layer | UK Source | EU Equivalent | Portability |
|-------|----------|---------------|-------------|
| Solar | PVGIS | PVGIS | Already pan-European |
| Land cover | CORINE | CORINE | Same dataset, same format |
| Protected areas | SSSIs + Natura 2000 | Natura 2000 only | Drop SSSI layer, keep Natura 2000 |
| Terrain | Copernicus DEM | Copernicus DEM | Same dataset |
| Grid | OSM (UK) | OSM (EU) | Same source, extract per-country |
| Flood risk | EA Flood Map | Varies by country | Not portable — skip or replace per-country |
| ALC | Natural England | No EU equivalent | UK-only layer |

Layers 1-5 port to EU with minimal work. Layers 6-7 are UK-specific and would need per-country replacements or be dropped for EU screening.

---

## Non-Goals (Ruthless Cut)

These are explicitly out of scope for the MVP. Some are valuable features; none are needed to ship a useful screening tool.

1. **Parcel-level analysis.** We do not have reliable open parcel boundary data across the UK or EU. The tool works on points, not parcels.

2. **Planning application history.** Useful for competitor analysis and precedent, but no open pan-European or even pan-UK dataset exists. England's Planning Data Platform is improving but not ready for programmatic use.

3. **Full site design / layout optimisation.** Row spacing, inverter sizing, cable routing — these are detailed engineering tasks, not screening.

4. **Landscape and Visual Impact Assessment (LVIA).** Viewshed analysis from DEM is computationally expensive and subjective. Not an MCP tool.

5. **Ecology surveys / species data.** Protected area boundaries are a proxy. Actual ecology assessments require field surveys.

6. **Grid capacity / connection queue data.** Knowing *where* a substation is does not tell you if it has spare capacity. In the UK, National Grid ESO publishes some connection queue data, but it is not open geodata and changes constantly. Flagging this as a known limitation.

7. **Revenue modelling / financial analysis.** Luminus already has price and market tools. The GIS extension handles site suitability, not project economics.

8. **Real-time satellite imagery.** Sentinel-2 imagery could verify current land use, but processing it is a full remote-sensing pipeline. Out of scope.

9. **Offshore wind or floating solar.** Different constraint set entirely. Land-based PV and BESS only.

10. **Interactive map frontend.** The deliverable is MCP tools, not a web map. A deck.gl frontend is mentioned in SCOPE.md Phase 2 but is not part of this GIS MVP.

11. **Green Belt boundaries.** Critical constraint in England but no reliable single open dataset exists. Document the gap; do not ship bad data.

---

## Recommended First Sprint

**Scope:** Layers 1-3 only (Solar Resource, Land Cover, Protected Areas) plus the composite `gis_site_screen` tool.

**Why these three first:**
- Solar resource is already half-built (existing PVGIS tool).
- Land cover and protected areas are the two most common show-stoppers for PV/BESS sites.
- All three use well-documented, easy-to-download datasets with clean licences.
- No raster processing needed (CORINE has a vector option; protected areas are vector).
- Gets a useful screening tool into users' hands before tackling the harder DEM and grid proximity layers.

**Sprint 1 delivers:**
- `gis_solar_resource` — point-level solar yield from PVGIS
- `gis_land_cover` — CORINE land use class and suitability flag
- `gis_protected_areas` — Natura 2000 + SSSI exclusion check
- `gis_site_screen` — composite screening report (solar + land cover + protected areas)
- `--profile gis` — new Luminus profile
- Data download and pre-processing scripts for UK CORINE and protected area boundaries
- Documentation and tests

**Sprint 2 (follow-on):**
- Layers 4-5 (terrain, grid proximity) — requires DEM processing and OSM extraction
- Layer 6-7 (flood risk, ALC) — UK-specific refinements
- EU country expansion for layers already portable
