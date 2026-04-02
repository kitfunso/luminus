# GIS roadmap

Lightweight status tracker for the UK/EU GIS prospecting tranche inside Luminus.

## Shipped baseline by sprint

- [x] **Sprint 1**: `get_terrain_analysis`, `get_grid_proximity`, GIS profile
- [x] **Sprint 2**: `get_land_constraints` for GB protected-area screening
- [x] **Sprint 3**: `screen_site` composite GB screening flow
- [x] **Sprint 4**: provenance cleanup and GIS source verification foundations
- [x] **Sprint 5**: `compare_sites` heuristic ranking for GB candidate sites
- [x] **Sprint 6**: `get_agricultural_land` with detailed + provisional ALC fallback
- [x] **Sprint 7**: `get_flood_risk` using Environment Agency Flood Map for Planning
- [x] **Sprint 8**: EU extension for `get_land_constraints` via EEA Natura 2000
- [x] **Sprint 9**: `get_land_cover` via CORINE Land Cover 2018, with explicit GB non-coverage note
- [x] **Sprint 10**: `get_grid_connection_queue` via NESO public TEC register, plus NESO GIS health check
- [x] **Sprint 11**: EU `screen_site` mode, Overpass hardening, schema-drift guards, NESO GSP spatial bridge
- [x] **Sprint 12**: `shortlist_bess_sites` for ranked GB BESS shortlist generation

## Current active tranche

- [x] First real GB connection-intelligence slice shipped
- [x] Conservative spatial bridge between site coordinates and public connection-register geography
  shipped: `get_grid_connection_intelligence` uses official NESO GSP polygons when available, falls back to nearest-point matching when needed, then queries the TEC register by GSP region
- [x] Ranked GB BESS shortlist flow shipped: `shortlist_bess_sites` combines `compare_sites`, screening-level BESS revenue, and GB transmission queue intelligence into one transparent shortlist response
- [x] First public DNO capacity slice shipped
  shipped: `get_distribution_headroom` uses SSEN's public headroom dashboard data for SSEN licence areas, with nearby GSP/BSP/primary-site headroom, constraint, and reinforcement context
- [ ] Wider DNO coverage still depends on cleaner public access from UKPN and NGED

## Prioritised next actions

1. [x] Spatial bridge to NESO/GSP geography
   shipped: polygon-first GSP lookup via official NESO boundaries + CSV fallback, TEC register name match, and OSM substations
2. [x] Evaluate a reduced EU `screen_site` mode
   shipped: EU countries use terrain + solar + grid + Natura 2000 + CORINE, with GB-only layers explicitly omitted and `layers_available`/`layers_unavailable` in the response
3. [x] Harden shared Overpass querying
   shipped: rate limiter (2 concurrent / 10 per minute), exponential backoff, AbortController timeout, query-too-expensive detection
4. [x] Build a ranked BESS site-screening flow that combines `screen_site` / `compare_sites` with storage-specific economics and queue signals for shortlist generation
   shipped: `shortlist_bess_sites` reuses `compare_sites`, `estimate_site_revenue`, and `get_grid_connection_intelligence` for a GB-only shortlist with transparent scoring
5. [ ] Revisit `compare_sites` scoring weights after real usage feedback
6. [ ] Decide where larger pre-processed GIS assets should live if spatial indexing becomes necessary
7. [x] Upgrade GSP lookup from nearest-point to polygon containment
   shipped: runtime fetch of NESO's WGS84 boundary GeoJSON from the official ZIP, polygon containment first, nearest-point fallback for unresolved matches
8. [x] Explore DNO-level open data (UKPN, NGED, SSEN) for distribution-level capacity signals
   shipped: SSEN's public headroom CSV is clean enough to wire into `get_distribution_headroom`; UKPN and NGED still appear portal-gated or shared-access for the useful datasets

## Key constraints and caveats

- `screen_site` and `compare_sites` now support **GB + EU**. EU mode uses fewer layers and does not include agricultural land or flood risk.
- `shortlist_bess_sites` is **GB-only** because it depends on the current GB transmission queue-intelligence path.
- `get_land_cover` is **not GB-capable** because CORINE 2018 does not cover Great Britain. GB `screen_site` documents this gap and notes that `agricultural_land` provides partial land-use context for England; a real UK source such as UKCEH Land Cover Map via WMS remains a future option.
- `get_grid_proximity` is **distance/infrastructure only**, not capacity.
- `get_grid_connection_queue` is **NESO transmission-register only**, not a GB-wide DNO headroom map.
- `get_distribution_headroom` is **SSEN-only** today. It does not infer UKPN or NGED coverage and should not be treated as a GB-wide DNO map.
- Public GIS services can change field names, service structure, or uptime without warning.
- Queue or contracted-capacity signals are **not** the same as a guaranteed connection offer.

## Rule for future tranches

Only ship a "capacity" or "connection readiness" claim when it comes from a real public upstream. Do not infer it from voltage, line distance, or generic heuristics alone.
