# GIS Prospecting Roadmap

_Last updated: 2026-03-31_

## Status
Shipped through **Sprint 10**. Luminus now has a strong UK-first screening stack plus partial EU coverage.

## Shipped baseline
- [x] **Sprint 1**: `get_terrain_analysis`, `get_grid_proximity`
- [x] **Sprint 2**: `get_land_constraints` for GB via Natural England
- [x] **Sprint 3**: `screen_site` composite screening for GB
- [x] **Sprint 4**: source provenance + `verify_gis_sources`
- [x] **Sprint 5**: `compare_sites`
- [x] **Sprint 6**: `get_agricultural_land` via Natural England ALC
- [x] **Sprint 7**: `get_flood_risk` via Environment Agency Flood Map for Planning
- [x] **Sprint 8**: EU extension of `get_land_constraints` via EEA Natura 2000
- [x] **Sprint 9**: `get_land_cover` via CORINE 2018
- [x] **Sprint 10**: `get_grid_connection_queue` via the NESO TEC register

## Current toolkit boundary
- **GB has the fullest screening coverage**: terrain, grid proximity, protected areas, agricultural land, flood risk, site comparison.
- **EU has partial but useful coverage**: terrain, solar, Natura 2000 constraints, CORINE land cover.
- `screen_site` and `compare_sites` are still **GB-only** for now.
- `get_grid_connection_queue` is currently a **standalone GB intelligence tool**, not part of `screen_site`, because there is not yet a trustworthy public spatial join from arbitrary site coordinates to NESO connection-site rows.
- This toolkit is for **prospecting and screening**, not legal planning determinations or guaranteed connection offers.

## Priority to-do list

### High priority
- [ ] **Add a reduced EU `screen_site` mode**
  - Use the layers that are actually available: terrain + solar + grid + Natura 2000 + CORINE.
  - Call out missing GB-only layers explicitly instead of pretending parity.

- [ ] **Improve the NESO queue join**
  - Find an honest way to connect site coordinates to NESO connection-site intelligence.
  - Do not fake this with nearest-line or nearest-substation heuristics alone.

- [ ] **Harden Overpass usage**
  - Coordinate rate limits and fallback behaviour across `get_grid_proximity` and any related grid tools.
  - Decide whether to extract a shared `overpass-client.ts`.

### Medium priority
- [ ] **Fill the UK land-cover gap**
  - CORINE 2018 does not cover Great Britain.
  - Keep the explicit GB non-coverage note until a real UK source is added.

- [ ] **Broaden EU planning / exclusion coverage**
  - Natura 2000 is useful, but it is not the full national planning-constraints stack for each EU country.

- [ ] **Tune `compare_sites` weights**
  - Current scoring is a sensible first cut, not final truth.

### Lower priority / platform hardening
- [ ] **Add better upstream schema-drift guards**
  - Natural England
  - Environment Agency flood services
  - EEA Natura 2000
  - CORINE / DiscoMap
  - NESO TEC register

- [ ] **Clean or ignore temporary proof artifacts**
  - `tmp-compare-sites-status.txt`
  - `tmp-land-constraints-status.txt`
  - `tmp-verify-gis-sources.json`
  - `tmp-verify-gis-summary.txt`

- [ ] **Decide spatial data storage / indexing strategy**
  - SpatiaLite vs GeoPackage vs in-memory R-tree
  - repo-local vs `~/.luminus/gis/`

## What success looks like next
1. An honest **reduced EU composite screen**
2. A real **site-to-queue intelligence bridge** for GB
3. More robust **grid and planning coverage** without overclaiming
