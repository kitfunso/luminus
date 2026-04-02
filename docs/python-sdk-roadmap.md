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
- [x] Analyst-ready notebook demos for trader workflow, GIS siting workflow, and BESS shortlist workflow
- [x] More opinionated notebook helpers for outages, cross-border flows, grid proximity, grid connection queue, and site revenue
- [x] CI coverage for Python tests and packaging checks on push / PR
- [x] Clearer Python-side error translation for startup failures, missing API keys, and upstream tool errors
- [x] Lightweight typed result models for common GIS and site-revenue flows
- [x] Python packaging metadata, buildable wheel/sdist, and local packaging checks

## Current status

- [x] Publish `luminus-py` to PyPI via GitHub Trusted Publishing (`v0.3.0`)
- [ ] Revisit async execution or smarter client/process pooling if heavy notebook fan-out becomes a bottleneck

## Prioritised next actions

1. [ ] Revisit async execution or smarter client/process pooling if heavy notebook fan-out becomes a bottleneck

## Guardrails

- Keep the Python SDK notebook-first: DataFrames, GeoJSON, GeoDataFrames, and simple methods beat exposing raw MCP details
- Do not fork business logic into a full Python reimplementation unless there is a strong reason to stop reusing the Node MCP server
- Prefer a thin wrapper over the live MCP surface before adding heavyweight notebook UI integrations
