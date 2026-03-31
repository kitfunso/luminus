# GIS Data Sources for UK/EU PV & BESS Prospecting

Last updated: 2026-03-31

This document catalogues free and open geospatial datasets relevant to solar PV and battery storage site screening in the UK and EU. Each entry covers what the dataset provides, geographic scope, licence terms, format/API friction, and whether it belongs in the Luminus MCP MVP.

---

## 1. Solar Resource

### 1a. PVGIS (Photovoltaic Geographical Information System)

- **What it gives us:** Monthly and annual solar irradiance (GHI, DNI, DHI), optimal tilt angle, estimated PV energy output for any point in Europe (and beyond). Hourly TMY (Typical Meteorological Year) time series. The gold standard for European solar resource assessment.
- **Scope:** Europe, Africa, parts of Asia. Full EU/UK coverage at ~2.5 km resolution.
- **Licence:** European Commission Joint Research Centre. Free for all use including commercial. No API key required. Attribution requested but not legally mandated.
- **Format/API friction:** REST API with JSON responses. Well-documented. Rate limits are generous but undocumented — bulk scraping will get you blocked. Single-point queries are fine for prospecting.
- **Caveats:** PVGIS gives modelled irradiance from satellite-derived data (SARAH-3 for Europe). It is not ground-truth measurement. Accuracy degrades in mountainous terrain and at high latitudes in winter. The API returns one location at a time — no batch/area queries.
- **MVP?** Yes. Already integrated into Luminus as `get_solar_irradiance`. The GIS extension would use it for point-level solar yield scoring.
- **URL:** https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en

### 1b. ERA5 / ERA5-Land (Copernicus Climate Data Store)

- **What it gives us:** Historical reanalysis weather data including solar radiation, temperature, and wind speed at hourly resolution. Useful for long-term yield modelling and variability assessment.
- **Scope:** Global. ~31 km grid (ERA5) or ~9 km (ERA5-Land).
- **Licence:** Copernicus licence — free for all use including commercial. Attribution required.
- **Format/API friction:** CDS API or Open-Meteo proxy (already used by Luminus). NetCDF/GRIB native format. Open-Meteo wraps it in a clean JSON API with no key required.
- **Caveats:** ERA5 is reanalysis, not measurement. Open-Meteo proxy covers most use cases without needing a CDS account. Direct CDS access requires registration and has slow queue-based retrieval.
- **MVP?** Partial. Already in Luminus via `get_era5_weather`. Not a primary GIS layer but useful as a secondary validation source for solar yield estimates.

---

## 2. Land Use & Land Cover

### 2a. CORINE Land Cover (Copernicus Land Monitoring Service)

- **What it gives us:** Pan-European land cover classification at 44 classes. Identifies agricultural land, industrial areas, forests, wetlands, water bodies, urban fabric, etc. Essential for filtering out unsuitable land (dense urban, water, forest) and identifying candidate parcels (arable, pasture, industrial).
- **Scope:** EU/EEA member states plus UK, Turkey, and some Balkan countries. 100 m minimum mapping unit. Latest version: CLC 2018 (CLC 2024 in preparation).
- **Licence:** Copernicus data policy — free and open for all use including commercial. Attribution to Copernicus required.
- **Format/API friction:** Available as GeoTIFF raster, GeoPackage vector, or WMS/WFS. Download from Copernicus Land portal. Files are large (pan-European vector is ~2 GB). No real-time API — you download a snapshot and serve it locally or clip to your area of interest.
- **Caveats:** 100 m minimum mapping unit misses small parcels. Classification is from 2018 satellite imagery — land use changes since then are not reflected. The UK is included in CLC 2018 but future editions post-Brexit may or may not include it. For UK-specific work, consider supplementing with UKCEH Land Cover Map.
- **MVP?** Yes. The single most important constraint layer for PV/BESS site screening. Without land cover filtering, every other layer is noise.
- **URL:** https://land.copernicus.eu/en/products/corine-land-cover

### 2b. UKCEH Land Cover Map (UK Centre for Ecology & Hydrology)

- **What it gives us:** UK-specific land cover at 25 m resolution with 21 classes. More detailed and more current than CORINE for UK sites.
- **Scope:** UK only (England, Scotland, Wales, Northern Ireland).
- **Licence:** Open Government Licence (OGL) for the 2021 edition. Free for commercial use with attribution. Earlier editions had more restrictive terms — use the 2021 version.
- **Format/API friction:** GeoTIFF raster download from EIDC (Environmental Information Data Centre). ~500 MB for UK coverage. No API — download and process locally.
- **Caveats:** 25 m resolution is better than CORINE but still not parcel-level. Classification scheme differs from CORINE, so you cannot naively merge them. For an MVP, CORINE alone is sufficient for UK; UKCEH is a nice-to-have upgrade.
- **MVP?** No — nice-to-have for UK refinement. CORINE covers the UK adequately for initial screening.

### 2c. Agricultural Land Classification (England & Wales)

- **What it gives us:** Grades agricultural land from 1 (best and most versatile) to 5 (very poor). Planning policy in England strongly discourages solar development on Grade 1, 2, and 3a land (Best and Most Versatile, or BMV).
- **Scope:** England and Wales only. Scotland uses a different system (Land Capability for Agriculture).
- **Licence:** Natural England publishes provisional ALC grades under OGL. The detailed post-1988 survey data is also available via the Geoportal.
- **Format/API friction:** Available as WFS/WMS from Natural England's Open Data Geoportal, or as Shapefile/GeoJSON download. Relatively small dataset.
- **Caveats:** The provisional map is coarse (1:250,000) and only distinguishes Grades 1-5 without the 3a/3b split that planning decisions actually hinge on. The detailed survey data has the 3a/3b split but covers only ~60% of England. This is a genuine gap — many planning refusals cite BMV land, but the open data to check it pre-application is incomplete.
- **MVP?** Yes for UK screening. This is a hard planning constraint in England. Even the provisional data is better than nothing.
- **URL:** https://naturalengland-defra.opendata.arcgis.com/

---

## 3. Environmental & Planning Constraints

### 3a. Natura 2000 / EU Protected Areas

- **What it gives us:** Boundaries of Special Areas of Conservation (SACs) and Special Protection Areas (SPAs) under the EU Habitats and Birds Directives. Development within these zones requires Habitats Regulations Assessment and is often blocked for large-scale solar.
- **Scope:** All EU/EEA member states. UK retained these designations post-Brexit (now called "national site network" in England).
- **Licence:** European Environment Agency (EEA) publishes under a free-use licence. Attribution required.
- **Format/API friction:** Downloadable as GeoPackage, Shapefile, or via WMS/WFS from the EEA. The UK sites are available separately from Natural England, NatureScot, Natural Resources Wales, and DAERA (Northern Ireland).
- **Caveats:** Boundaries are definitive but the practical constraint depends on the specific qualifying features and proximity effects. Being inside a Natura 2000 site does not automatically block development, but it massively increases risk and cost. For screening purposes, treat as a hard exclusion.
- **MVP?** Yes. Hard exclusion layer.

### 3b. Sites of Special Scientific Interest (SSSIs) — UK

- **What it gives us:** Boundaries of SSSIs, the primary UK nature conservation designation. Development on or affecting an SSSI faces strong legal protection under the Wildlife and Countryside Act 1981.
- **Scope:** England (Natural England), Scotland (NatureScot), Wales (NRW). Northern Ireland has ASSIs (Areas of Special Scientific Interest) from DAERA.
- **Licence:** OGL for English SSSIs via Natural England Geoportal. Scottish and Welsh equivalents also open.
- **Format/API friction:** WFS/WMS or Shapefile download from each country's geoportal. Small-to-medium file sizes.
- **Caveats:** Some overlap with Natura 2000 sites. For MVP, combining SSSIs + Natura 2000 into a single "protected areas" exclusion layer is pragmatic.
- **MVP?** Yes for UK. Merge with Natura 2000 into one exclusion layer.
- **URL:** https://naturalengland-defra.opendata.arcgis.com/

### 3c. UK Flood Map for Planning (Environment Agency)

- **What it gives us:** Flood zones 2 and 3 for England. Zone 3 is high probability (>1% annual chance of river flooding or >0.5% for sea flooding). Zone 2 is medium probability. Planning policy (NPPF) discourages development in Flood Zone 3 without passing the Sequential Test.
- **Scope:** England only. SEPA publishes Scottish flood maps separately. NRW covers Wales.
- **Licence:** OGL. Free for all use with attribution.
- **Format/API friction:** Available via WMS/WFS from the Environment Agency's Data Services Platform, or as GeoJSON/Shapefile download. Well-maintained and regularly updated.
- **Caveats:** Solar PV and BESS are classified as "essential infrastructure" or "less vulnerable" in flood risk terms, so they are not automatically excluded from Flood Zone 3, but they do need a Flood Risk Assessment. For screening, flag as elevated risk rather than hard exclusion.
- **MVP?** Yes for UK. Soft constraint (risk flag, not hard exclusion).
- **URL:** https://environment.data.gov.uk/dataset/04532375-a198-476e-985e-0579a0a11b47

### 3d. Green Belt (England)

- **What it gives us:** Green Belt boundaries. Planning policy very strongly resists "inappropriate development" in the Green Belt, which includes most solar farms unless very special circumstances are demonstrated.
- **Scope:** England only. Scotland, Wales, and NI have different green space policies.
- **Licence:** Published by individual local planning authorities. No single national open dataset exists with a clean licence. MHCLG publishes a statistical boundary but not an authoritative planning-grade vector.
- **Format/API friction:** Fragmented across ~200+ local authorities. Some publish via their own GIS portals; many do not. The only practical national compilation is from OS (Ordnance Survey) data products which may have restrictive licences.
- **Caveats:** This is a significant data gap. Green Belt is a critical planning constraint in England, but there is no single, free, authoritative national dataset. For MVP, we either skip it (with a documented caveat) or use approximate boundaries.
- **MVP?** No for MVP — too fragmented to include reliably. Document as a known gap.

---

## 4. Terrain & Topography

### 4a. Copernicus DEM (EU-DEM / GLO-30)

- **What it gives us:** Digital elevation model at 30 m resolution (GLO-30) or 25 m (EU-DEM v1.1). Derived slope and aspect are critical for solar: steep north-facing slopes are poor for PV; flat or gentle south-facing slopes are ideal.
- **Scope:** Global (GLO-30) or EU/EEA (EU-DEM). Full UK coverage.
- **Licence:** Copernicus licence — free for all use including commercial. Attribution required.
- **Format/API friction:** GeoTIFF tiles downloadable from Copernicus. EU-DEM is a single ~12 GB file for all of Europe. GLO-30 is tiled. No API — download and process locally with GDAL or similar.
- **Caveats:** 30 m resolution is adequate for screening but not for detailed site design. Slope/aspect derived from DEM need post-processing. Large raster files need clipping to area of interest before serving via MCP.
- **MVP?** Yes. Slope/aspect screening is essential for PV siting. Pre-compute slope classes for the UK and serve as a lookup, not raw raster.

### 4b. OS Terrain 50 (Ordnance Survey)

- **What it gives us:** UK DTM at 50 m grid. Lower resolution than Copernicus GLO-30 but authoritative for UK.
- **Scope:** UK only.
- **Licence:** OGL via OS OpenData. Free for commercial use.
- **Format/API friction:** ASCII grid or GeoPackage download. ~2 GB for all UK tiles.
- **Caveats:** 50 m is coarser than Copernicus 30 m. For MVP, Copernicus GLO-30 is preferred as it covers both UK and EU.
- **MVP?** No. Copernicus GLO-30 is better resolution and covers both geographies.

---

## 5. Grid Infrastructure & Proximity

### 5a. OpenStreetMap / Open Infrastructure Map

- **What it gives us:** Locations of HV transmission lines (132 kV, 275 kV, 400 kV), substations, and power stations. Grid proximity is a key economics driver for PV/BESS — connection costs scale roughly with distance to the nearest suitable substation.
- **Scope:** Global, but coverage quality varies. UK and western EU are well-mapped. Eastern EU is patchier.
- **Licence:** ODbL (Open Database Licence). Free for all use including commercial. Attribution required. Share-alike applies to derived databases (but not to "produced works" like maps or analysis outputs).
- **Format/API friction:** Overpass API for live queries. Open Infrastructure Map renders the power data nicely. For bulk extraction, use Geofabrik PBF extracts processed with osmium or ogr2ogr. Rate limits on Overpass are meaningful — don't hammer it.
- **Caveats:** OSM is crowd-sourced. Completeness and accuracy are not guaranteed. Voltage ratings and substation types may be missing or wrong. For UK, National Grid publishes some infrastructure data separately, but not as open data with permissive licensing. OSM is the best free option.
- **MVP?** Yes. Grid proximity is a top-3 factor in site economics. OSM power data, despite its imperfections, is the only free option with EU-wide coverage.
- **URL:** https://openinframap.org/about

### 5b. Open Power System Data (OPSD)

- **What it gives us:** Database of European power plants with capacity, fuel type, location, commissioning year. Already used by Luminus for `get_power_plants`.
- **Scope:** EU-wide. Variable completeness by country.
- **Licence:** MIT licence for the processed data packages. Attribution required.
- **Format/API friction:** CSV/SQLite downloads. Small files, easy to work with.
- **Caveats:** Last comprehensive update was 2020. Some countries have gaps. Useful as a supplementary layer (e.g. proximity to existing solar farms) but not a substitute for substation data.
- **MVP?** No as a GIS layer. Already in Luminus for a different purpose.

---

## 6. Additional EU-Wide Sources

### 6a. EU Cadastral / INSPIRE Parcels

- **What it gives us:** In theory, parcel-level land boundaries across Europe under the INSPIRE Directive. In practice, availability and openness vary wildly by member state.
- **Scope:** EU member states (in principle).
- **Licence:** Ranges from fully open (Netherlands PDOK, France cadastre.gouv.fr) to restricted or paid (Germany varies by Bundesland, Italy is partially open). UK Land Registry title boundaries are not open data.
- **Format/API friction:** WFS/WMS where available. No uniform API. Each country's INSPIRE implementation is different.
- **Caveats:** This is the single biggest gap in open European GIS data for prospecting. Knowing parcel boundaries, ownership, and area is essential for real development but the data is fragmented and often not free. For an MCP tool, we cannot promise parcel-level analysis.
- **MVP?** No. Too fragmented and inconsistent for a multi-country MVP.

### 6b. EU Transmission Grid (ENTSO-E Grid Map)

- **What it gives us:** ENTSO-E publishes a grid map of the European transmission network. However, the underlying data is not available as open geodata — it is a static PDF/image map.
- **Scope:** Pan-European transmission grid (220 kV+).
- **Licence:** Not available as open geodata.
- **Format/API friction:** N/A — no API or downloadable vector data.
- **Caveats:** OSM/Open Infrastructure Map remains the only viable free source for grid geometry.
- **MVP?** No.

---

## 7. Source Summary Table

| # | Source | What | Scope | Licence | Format | MVP? |
|---|--------|------|-------|---------|--------|------|
| 1 | PVGIS | Solar irradiance & yield | EU/Global | EC free use | REST JSON | **Yes** |
| 2 | CORINE Land Cover | Land use/land cover | EU + UK | Copernicus open | GeoTIFF/WMS | **Yes** |
| 3 | Natural England ALC | Agricultural land grade | England/Wales | OGL | WFS/Shapefile | **Yes** (UK) |
| 4 | Natura 2000 | Protected habitats | EU + UK | EEA free use | GeoPackage/WMS | **Yes** |
| 5 | SSSIs | Nature conservation | UK | OGL | WFS/Shapefile | **Yes** (UK) |
| 6 | EA Flood Map | Flood zones | England | OGL | WFS/GeoJSON | **Yes** (UK) |
| 7 | Copernicus DEM | Elevation/slope/aspect | EU/Global | Copernicus open | GeoTIFF | **Yes** |
| 8 | OSM / OpenInfraMap | Grid infrastructure | EU/Global | ODbL | Overpass/PBF | **Yes** |
| 9 | UKCEH Land Cover | Detailed UK land cover | UK | OGL | GeoTIFF | No (nice-to-have) |
| 10 | Green Belt | Planning constraint | England | Fragmented | Varies | No (data gap) |
| 11 | ERA5 | Historical weather | Global | Copernicus open | NetCDF/JSON | No (already in Luminus) |
| 12 | OS Terrain 50 | UK elevation | UK | OGL | ASCII/GeoPackage | No (Copernicus is better) |
| 13 | OPSD | Power plant database | EU | MIT | CSV | No (already in Luminus) |
| 14 | INSPIRE Parcels | Land parcels | EU (patchy) | Varies by country | WFS (varies) | No (too fragmented) |

---

## 8. Key Licensing Risks

1. **ODbL share-alike (OSM):** Derived *databases* must be shared under ODbL. Derived *analysis outputs* (e.g. "nearest substation distance for this point") are "produced works" and not subject to share-alike. For an MCP tool that returns analysis results, this is fine. If we redistribute an extracted OSM database, we must keep it under ODbL.

2. **Copernicus attribution:** All Copernicus-derived outputs must credit "Copernicus Land Monitoring Service" or equivalent. This is a documentation requirement, not a usage restriction.

3. **Natural England / OGL:** Requires attribution to the data provider. No other restrictions.

4. **PVGIS:** No formal licence document. The JRC states data is freely available. For commercial use, the lack of an explicit licence is a minor legal grey area, but the JRC has never restricted use and the REST API is designed for programmatic access.

5. **Green Belt data gap:** No single authoritative national dataset exists under a permissive licence. This is an operational risk for UK screening — users may assume our tool covers this constraint when it does not.

6. **CORINE vintage:** The current dataset reflects 2018 imagery. Land use changes (new housing developments, rewilding, new solar farms) since 2018 are not captured. Users must understand this is a screening tool, not a substitute for site visits.
