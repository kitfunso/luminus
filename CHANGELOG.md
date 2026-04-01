# Changelog

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
