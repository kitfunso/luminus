# Changelog

## 0.4.0 - 2026-04-05

Full GB DNO coverage, BESS-specific scoring, and major Python SDK expansion.

### Added
- ENWL (Electricity North West) added to `get_distribution_headroom` — all 5 GB DNOs with public data now covered (SSEN, NPG, UKPN, SPEN, ENWL)
- ENWL added to `get_embedded_capacity_register` alongside UKPN and SPEN
- ENWL added to `get_grid_connection_intelligence` parallel headroom queries
- `technology` parameter on `compare_sites` — BESS-specific scoring weights (grid proximity 45%, verdict 25%, terrain 25%, solar 5%) vs solar defaults
- `shortlist_bess_sites` now queries SSEN, NPG, and UKPN headroom in parallel instead of SSEN-only
- 24 new Python SDK typed helpers covering ECR, flex market, constraint breaches, SPEN/UKPN grid intelligence, trading prices, GIS tools, and BESS shortlisting
- 9 new Python snapshot models with `from_dict()` classmethods

### Changed
- bumped `luminus-mcp` to `0.4.0`
- bumped `luminus-py` to `0.4.0`

### Verification
- 327 JS tests passed across 33 test files
- 29 Python tests passed
- TypeScript build passed
- Python build passed

For the fuller narrative, see [`docs/releases/0.4.0.md`](docs/releases/0.4.0.md).

## 0.3.1 - 2026-04-03

Unified npm and Python patch release for the Northern Powergrid headroom tranche and stale package-surface cleanup.

### Added
- `get_distribution_headroom` support for Northern Powergrid's public heat-map substation dataset alongside SSEN
- Northern Powergrid source metadata and health checks in `verify_gis_sources`

### Changed
- bumped `luminus-mcp` to `0.3.1`
- bumped `luminus-py` to `0.3.1`
- updated npm package metadata and README text so the published package surface reflects the current 62-tool catalog
- aligned top-level and Python README version references with the current published state

### Verification
- targeted GIS and docs drift tests passed
- TypeScript build passed
- Python tests passed
- Python wheel and sdist built successfully

For the fuller narrative, see [`docs/releases/0.3.1.md`](docs/releases/0.3.1.md).

## 0.3.0 - 2026-04-02

Unified npm and Python SDK release for the GIS shortlist and connection-intelligence tranche.

### Added
- `shortlist_bess_sites` for ranked GB BESS screening that combines GIS scoring, screening-level BESS revenue, transmission queue context, and SSEN DNO headroom where public SSEN data resolves
- `get_distribution_headroom` for SSEN public DNO headroom, constraint, and reinforcement signals
- polygon-first NESO GSP lookup with nearest-point fallback in grid connection intelligence
- Python SDK helpers and typed snapshots for distribution headroom and grid connection intelligence
- upgraded GIS siting and BESS shortlist notebooks to use the new helper surface

### Changed
- bumped `luminus-mcp` to `0.3.0`
- bumped `luminus-py` to `0.3.0`
- aligned release docs so npm and PyPI version references match the current published state
- tightened Python packaging checks in the release workflow with `twine check` and wheel smoke tests

### Verification
- JS test suite passed
- TypeScript build passed
- npm audit reported 0 vulnerabilities
- Python tests passed
- Python wheel and sdist built successfully
- Python wheel smoke install passed

For the fuller narrative, see [`docs/releases/0.3.0.md`](docs/releases/0.3.0.md).

## 0.2.2 - 2026-04-02

Python SDK republish to verify the tightened PyPI Trusted Publisher binding.

This was a Python SDK release only. The npm MCP package remained `luminus-mcp@0.2.0`.

### Changed
- bumped `luminus-py` to `0.2.2`
- republished through the GitHub Trusted Publisher restricted to the `pypi` environment
- updated release references to point at the latest Python package release

### Verification
- Python tests passed
- Python wheel and sdist built successfully
- GitHub Trusted Publishing release workflow passed
- PyPI provenance verified `environment: "pypi"`

For the fuller narrative, see [`docs/releases/0.2.2.md`](docs/releases/0.2.2.md).

## 0.2.1 - 2026-04-02

Python SDK follow-up release focused on publishing, notebook ergonomics, and packaging automation.

This was a Python SDK release only. The npm MCP package remained `luminus-mcp@0.2.0`.

### Added
- Trusted Publishing workflow for `luminus-py` on PyPI
- notebook-first Python helpers for outages, cross-border flows, grid proximity, grid connection queue, and site revenue
- typed Python models for common GIS and site-revenue result shapes
- analyst-ready notebooks for trader, GIS siting, and BESS shortlist workflows

### Changed
- improved Python-side error translation for startup, configuration, and upstream failures
- extended CI to run Python tests and packaging validation
- updated Python docs and roadmap to match the shipped SDK surface

### Verification
- 15 Python tests passed
- Python wheel and sdist built successfully
- GitHub Trusted Publishing release workflow passed

For the fuller narrative, see [`docs/releases/0.2.1.md`](docs/releases/0.2.1.md).

## 0.2.0 - 2026-04-01

Luminus MCP grew from a power-data MCP into a stronger GIS-aware screening and notebook-friendly platform.

### Added
- UK/EU GIS screening stack for PV and BESS workflows, including terrain, grid proximity, GB connection queue signals, land constraints, land cover, agricultural land, flood risk, site screening, and multi-site comparison
- MCP profiles for lower context-window cost, including focused `trader`, `grid`, `regional`, `bess`, `weather`, and `gis` modes
- First Python SDK scaffold under `python/`, including a notebook-friendly `Luminus` client, pandas helpers, dynamic MCP tool binding, GeoJSON / GeoDataFrame helpers, and example notebooks
- GB grid-connection intelligence via NESO GSP lookup + TEC queue + OSM substations

### Fixed
- GIS math and screening issues, including terrain latitude scaling, GB plant coverage, PV revenue calculation, and Overpass queue deadlock handling
- Backend auth, cache, and pagination issues across ENTSO-E, GIE, EIA, Fingrid, ESIOS, and Stormglass integrations
- CLI profile parsing edge case for `--profile`

### Changed
- Hardened auth and key loading so `~/.luminus/keys.json` works consistently at runtime
- Improved rate-limit, caching, and fallback behaviour across GIS and market-data paths
- Updated docs and scope descriptions to match the current tool surface and profile structure

### Removed
- Retired EMBER integration from the live tool surface and docs because the public API path is no longer a dependable source

### Verification
- 238 JS tests passed
- Python SDK test suite passed
- TypeScript build passed
- npm audit reported 0 vulnerabilities

For the fuller narrative, see [`docs/releases/0.2.0.md`](docs/releases/0.2.0.md).
