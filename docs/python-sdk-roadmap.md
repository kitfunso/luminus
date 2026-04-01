# Python SDK roadmap

Status tracker for the notebook-friendly Python client that wraps `luminus-mcp`.

## Shipped baseline

- [x] Initial `luminus-py` package scaffold under `python/`
- [x] Stdio client that starts `luminus-mcp` and speaks MCP over subprocess pipes
- [x] Dynamic tool binding so any live MCP tool can be called as a Python method
- [x] `to_pandas()` result export
- [x] `to_geojson()` and `to_geodataframe()` helpers for GIS workflows
- [x] Batch helpers: `call_many()` and `call_many_to_pandas()`
- [x] Parallel batch fan-out via multiple MCP subprocesses
- [x] Higher-level notebook helpers for common flows like multi-zone prices, generation mix, and ranked site comparison
- [x] Notebook examples for quickstart, GIS screening, BESS ranked screening, map exports, multi-zone prices, and auth setup
- [x] Python packaging metadata, buildable wheel/sdist, and local packaging checks

## Current status

- [ ] Publish `luminus-py` to PyPI — blocked only by missing PyPI API token on the current machine

## Prioritised next actions

1. [ ] Publish `luminus-py` to PyPI once a PyPI API token is configured
2. [ ] Add more opinionated notebook methods for the highest-usage flows:
   - outages
   - cross-border flows
   - grid proximity
   - grid connection queue
   - site revenue
3. [ ] Add CI for the Python package so tests and packaging checks run on push / PR
4. [ ] Add 2-3 polished analyst-ready notebook demos:
   - trader workflow
   - GIS siting workflow
   - BESS shortlist workflow
5. [ ] Improve error translation for missing API keys, startup failures, and upstream tool errors so notebook users get clearer exceptions
6. [ ] Add richer typed result models where they help, without losing the dynamic whole-surface access
7. [ ] Revisit async execution or smarter client/process pooling if heavy notebook fan-out becomes a bottleneck

## Guardrails

- Keep the Python SDK notebook-first: DataFrames, GeoJSON, GeoDataFrames, and simple methods beat exposing raw MCP details
- Do not fork business logic into a full Python reimplementation unless there is a strong reason to stop reusing the Node MCP server
- Prefer a thin wrapper over the live MCP surface before adding heavyweight notebook UI integrations
