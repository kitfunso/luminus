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

## Current active tranche

- [x] First real GB connection-intelligence slice shipped
- [ ] Conservative spatial bridge between site coordinates and public connection-register geography
- [ ] Stronger DNO-level capacity or queue signal, if a public source proves clean enough

## Prioritised next actions

1. [ ] Decide the next honest grid-capacity tranche: spatial bridge to NESO/GSP geography, or a DNO-level public source
2. [x] ~~Evaluate a reduced EU `screen_site` mode~~ — shipped: EU countries use terrain + solar + grid + Natura 2000 + CORINE, with GB-only layers explicitly omitted and `layers_available`/`layers_unavailable` in the response
3. [x] ~~Harden shared Overpass querying~~ — shipped: rate limiter (2 concurrent / 10 per minute), exponential backoff, AbortController timeout, query-too-expensive detection
4. [ ] Revisit `compare_sites` scoring weights after real usage feedback
5. [ ] Decide where larger pre-processed GIS assets should live if spatial indexing becomes necessary

## Key constraints and caveats

- `screen_site` and `compare_sites` now support **GB + EU** — EU mode uses fewer layers (no agricultural land or flood risk)
- `get_land_cover` is **not GB-capable** because CORINE 2018 does not cover Great Britain
- `get_grid_proximity` is **distance/infrastructure only**, not capacity
- `get_grid_connection_queue` is **NESO transmission-register only**, not a GB-wide DNO headroom map
- Public GIS services can change field names, service structure, or uptime without warning
- Queue or contracted-capacity signals are **not** the same as a guaranteed connection offer

## Rule for future tranches

Only ship a "capacity" or "connection readiness" claim when it comes from a real public upstream. Do not infer it from voltage, line distance, or generic heuristics alone.
