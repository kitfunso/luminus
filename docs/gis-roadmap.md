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
- [x] **Sprint 13**: GB connection-intelligence layer — canonical connections schema (`CanonicalConnectionEntry`) + normalisers for TEC / NGED / DNO headroom rows, new `get_site_connection_report` composite tool, and rules-based `get_gate2_readiness_check` with public reference URLs per rule
- [x] **Sprint 14**: Scotland coverage for screening tools — NatureScot protected areas (SSSI / SAC / SPA / Ramsar / NNR / MPA) in `get_land_constraints`; SEPA Flood Risk Management Maps (river / coastal / surface-water at high / medium / low likelihoods) in `get_flood_risk` with runtime layer-ID discovery; James Hutton Institute Land Capability for Agriculture (1:50k detailed + 1:250k broad with fallback) in `get_agricultural_land`. New `ClassificationBasis` values `lca_detailed` and `lca_broad`. Scottish and English upstreams run in parallel for border-region coordinates, results union'd.

## Deliberate non-goals

This tranche explicitly does NOT add:
- A predictive Gate 2 likelihood model, score, or probability
- A GB-wide "queue oracle" or machine-learning overlay on the public data
- A workflow SaaS, hosted layer, persistence, or auth
- A demand-centre siting or portfolio ranker

The rationale is honest evidence: we do not have the training data to justify a predictive Gate 2 model, and shipping one would burn credibility with the network operators we depend on for upstream data. `get_gate2_readiness_check` is a transparent rules checklist, not a prediction.

## Current active tranche

- [x] First real GB connection-intelligence slice shipped
- [x] Conservative spatial bridge between site coordinates and public connection-register geography
  shipped: `get_grid_connection_intelligence` uses official NESO GSP polygons when available, falls back to nearest-point matching when needed, then adds TEC register, nearby substation, SSEN distribution headroom where public SSEN data resolves, and NGED public queue and TD-limit context where the matched GSP is covered
- [x] Ranked GB BESS shortlist flow shipped: `shortlist_bess_sites` combines `compare_sites`, screening-level BESS revenue, GB transmission queue intelligence, and SSEN DNO headroom where public SSEN data resolves into one transparent shortlist response
- [x] Public DNO headroom coverage shipped for multiple operators
  shipped: `get_distribution_headroom` uses SSEN's public headroom dashboard data for SSEN licence areas and Northern Powergrid's public heat-map substation data for NPG licence areas, with nearby GSP/BSP/primary-site headroom, constraint, and reinforcement context
- [x] Second public operator-specific connection signal shipped
  shipped: `get_nged_connection_signal` resolves a GB site to a NESO GSP, then returns NGED's public per-GSP connection queue and TD-limit records where that GSP is covered
- [x] Wider DNO coverage shipped
  shipped: UKPN (DFES Counterfactual scenario) and SPEN (BV scenario) added to `get_distribution_headroom`; both require free OpenDataSoft API keys. New composite tools: `get_embedded_capacity_register` (UKPN + SPEN), `get_flexibility_market` (UKPN + SPEN), `get_constraint_breaches` (UKPN), `get_spen_grid_intelligence`, `get_ukpn_grid_overview`

## Prioritised next actions

1. [x] Spatial bridge to NESO/GSP geography
   shipped: polygon-first GSP lookup via official NESO boundaries + CSV fallback, TEC register name match, and OSM substations
2. [x] Evaluate a reduced EU `screen_site` mode
   shipped: EU countries use terrain + solar + grid + Natura 2000 + CORINE, with GB-only layers explicitly omitted and `layers_available`/`layers_unavailable` in the response
3. [x] Harden shared Overpass querying
   shipped: rate limiter (2 concurrent / 10 per minute), exponential backoff, AbortController timeout, query-too-expensive detection
4. [x] Build a ranked BESS site-screening flow that combines `screen_site` / `compare_sites` with storage-specific economics and queue signals for shortlist generation
   shipped: `shortlist_bess_sites` reuses `compare_sites`, `estimate_site_revenue`, `get_grid_connection_intelligence`, and `get_distribution_headroom` for a GB-only shortlist with transparent scoring and optional SSEN DNO context
5. [ ] Revisit `compare_sites` scoring weights after real usage feedback
   partial: weights are now flagged inline as judgment-based heuristics (not calibrated against realised outcomes); actual reweighting waits for real usage evidence
6. [ ] Decide where larger pre-processed GIS assets should live if spatial indexing becomes necessary
7. [x] Upgrade GSP lookup from nearest-point to polygon containment
   shipped: runtime fetch of NESO's WGS84 boundary GeoJSON from the official ZIP, polygon containment first, nearest-point fallback for unresolved matches
8. [x] Explore DNO-level open data (UKPN, NGED, SSEN, NPG) for distribution-level capacity signals
   shipped: SSEN (public, no key), Northern Powergrid (public, no key), UKPN DFES (free key), and SPEN NSHR (free key) all wired into `get_distribution_headroom`; NGED public per-GSP queue and TD-limit datasets wired into `get_nged_connection_signal`; UKPN and SPEN portals require free registration for API access
9. [x] Surface stale upstream schemas through `verify_gis_sources`
   shipped: health checks now cover all 5 GB DNO headroom portals, NESO GSP CSV lookup, NESO GSP boundary ZIP package, NGED queue, NGED TD-limits, UKPN/SPEN flex dispatch, and ENWL ECR (21 sources total)

## Key constraints and caveats

- `screen_site` and `compare_sites` now support **GB + EU**. EU mode uses fewer layers and does not include agricultural land or flood risk.
- `shortlist_bess_sites` is **GB-only** because it depends on the current GB transmission queue-intelligence path.
- `get_land_cover` is **not GB-capable** because CORINE 2018 does not cover Great Britain. GB `screen_site` documents this gap and notes that `agricultural_land` provides partial land-use context for England; a real UK source such as UKCEH Land Cover Map via WMS remains a future option.
- `get_grid_proximity` is **distance/infrastructure only**, not capacity.
- `get_grid_connection_queue` is **NESO transmission-register only**, not a GB-wide DNO headroom map.
- `get_distribution_headroom` supports **all 5 GB DNOs with public data: SSEN, NPG, UKPN, SPEN, and ENWL**. SSEN and NPG are fully public; UKPN, SPEN, and ENWL require free portal registration. SPEN has no substation coordinates (returns alphabetically).
- `get_nged_connection_signal` is **NGED-only** today. It returns public per-GSP queue and TD-limit signals, not DNO headroom or a connection offer.
- `get_site_connection_report` is **GB-only** because every upstream (NESO GSP polygons, TEC register, DNO headroom, NGED queue, Natural England constraints, Environment Agency flood map) is GB-only. Coordinates outside the GB bounding box are rejected with a pointer to `screen_site` for EU sites. An EU equivalent would need TYNDP project data and equivalent constraint layers integrated first.
- `compare_sites` scoring weights are judgment-based heuristics and are **not calibrated against realised project outcomes**. Treat rankings as a first-pass sort, not an investment signal.
- `get_land_constraints`, `get_flood_risk`, and `get_agricultural_land` now cover **England + Scotland** (since v0.6.0). Scotland upstreams: NatureScot (protected areas), SEPA (flood extents), James Hutton Institute (LCA). Wales (NRW) and Northern Ireland are not yet integrated. James Hutton 1:50k LCA only covers improved agricultural land patches; 1:250k has its own gaps (for example Shetland), so basis `none` is a legitimate outcome rather than a bug for some rural Scottish coordinates.
- `get_embedded_capacity_register`, `get_flexibility_market`, `get_constraint_breaches`, `get_spen_grid_intelligence`, and `get_ukpn_grid_overview` all require **free API keys** from their respective OpenDataSoft portals.
- Public GIS services can change field names, service structure, or uptime without warning.
- Queue or contracted-capacity signals are **not** the same as a guaranteed connection offer.

## Rule for future tranches

Only ship a "capacity" or "connection readiness" claim when it comes from a real public upstream. Do not infer it from voltage, line distance, or generic heuristics alone.
