# luminus-py

A notebook-friendly Python client for `luminus-mcp`.

This package starts the existing Node MCP server under the hood, calls tools over stdio, and returns Python-native result objects with optional pandas helpers.

Any MCP tool exposed by `luminus-mcp` is callable directly as a Python method, so the SDK does not need a hand-written wrapper for every tool.

The SDK also includes geospatial helpers for notebook workflows: `to_geojson()` for lightweight mapping and `to_geodataframe()` for GeoPandas users.

Roadmap: see [`../docs/python-sdk-roadmap.md`](../docs/python-sdk-roadmap.md).

## Install

```bash
pip install luminus-py[notebook]
```

For GIS notebook work:

```bash
pip install luminus-py[all]
```

You also need `luminus-mcp` itself available on your machine, because the Python SDK starts the existing Node MCP server under the hood.

```bash
npm install -g luminus-mcp@0.2.0
```

## API keys

Keyed tools use the same auth model as the Node server. Resolution order is:
1. environment variables like `ENTSOE_API_KEY`
2. `~/.luminus/keys.json`

Example `~/.luminus/keys.json`:

```json
{
  "ENTSOE_API_KEY": "...",
  "GIE_API_KEY": "...",
  "FINGRID_API_KEY": "..."
}
```

Per-notebook overrides are also supported:

```python
lum = Luminus(profile="trader", env={"ENTSOE_API_KEY": "..."})
```

## Quick start

```python
from luminus import Luminus

with Luminus(profile="trader") as lum:
    prices = lum.get_day_ahead_prices(zone="DE")
    df = prices.to_pandas()

    # Any MCP tool can be called directly
    flows = lum.get_cross_border_flows(from_zone="DE", to_zone="NL")
    site = lum.compare_sites(sites=[
        {"name": "A", "lat": 52.1, "lon": 0.1},
        {"name": "B", "lat": 52.2, "lon": 0.2},
    ], country="GB")

    # GIS-friendly exports
    geojson = site.to_geojson(data_key="rankings")

    # Batch several calls into one DataFrame
    multi_zone = lum.call_many_to_pandas(
        "get_day_ahead_prices",
        [{"zone": "DE"}, {"zone": "FR"}, {"zone": "NL"}],
        parallel=True,
    )

    # One-shot export helpers
    prices_df = lum.call_tool_to_pandas("get_day_ahead_prices", {"zone": "DE"})
    rankings_geojson = lum.call_tool_to_geojson("compare_sites", {
        "country": "GB",
        "sites": [
            {"label": "A", "lat": 52.1, "lon": 0.1},
            {"label": "B", "lat": 52.2, "lon": 0.2},
        ],
    }, data_key="rankings")
```

## Notebook demos

Polished notebook demos live in [`examples/`](examples/):

- [Trader workflow](examples/trader_workflow.ipynb)
- [GIS siting workflow](examples/gis_siting_workflow.ipynb)
- [BESS shortlist workflow](examples/bess_shortlist_workflow.ipynb)

## Notebook-first helpers

The Python SDK now ships a few opinionated helpers for high-usage analyst flows:

- `lum.get_outages_frame(...)`
- `lum.get_cross_border_flows_many([...])`
- `lum.get_grid_proximity_substations(...)`
- `lum.get_grid_proximity_lines(...)`
- `lum.get_grid_proximity_snapshot(...)`
- `lum.get_grid_connection_queue_projects(...)`
- `lum.get_grid_connection_queue_sites(...)`
- `lum.get_grid_connection_queue_snapshot(...)`
- `lum.get_distribution_headroom_matches(...)`
- `lum.get_distribution_headroom_snapshot(...)`
- `lum.get_grid_connection_intelligence_snapshot(...)`
- `lum.estimate_site_revenue_frame(...)`
- `lum.estimate_site_revenue_estimate(...)`

Example:

```python
from luminus import (
    DistributionHeadroomSnapshot,
    GridConnectionIntelligenceSnapshot,
    GridProximitySnapshot,
    Luminus,
    SiteRevenueEstimate,
)

with Luminus(profile="gis") as lum:
    outages = lum.get_outages_frame(zone="DE", type="generation")
    flows = lum.get_cross_border_flows_many([("DE", "NL"), ("FR", "DE")])
    substations = lum.get_grid_proximity_substations(lat=52.0, lon=0.1)
    queue = lum.get_grid_connection_queue_projects(connection_site_query="Berkswell")
    headroom = lum.get_distribution_headroom_matches(lat=50.84, lon=-1.08, operator="SSEN")
    revenue = lum.estimate_site_revenue_frame(
        lat=52.0,
        lon=0.1,
        zone="GB",
        technology="bess",
        capacity_mw=20,
    )

    proximity: GridProximitySnapshot = lum.get_grid_proximity_snapshot(lat=52.0, lon=0.1)
    headroom_snapshot: DistributionHeadroomSnapshot = lum.get_distribution_headroom_snapshot(
        lat=50.84,
        lon=-1.08,
        operator="SSEN",
    )
    intelligence: GridConnectionIntelligenceSnapshot = lum.get_grid_connection_intelligence_snapshot(
        lat=50.84,
        lon=-1.08,
        country="GB",
    )
    estimate: SiteRevenueEstimate = lum.estimate_site_revenue_estimate(
        lat=52.0,
        lon=0.1,
        zone="GB",
        technology="bess",
    )
```

## Errors and typed models

- Startup failures now raise `LuminusStartupError`.
- Tool-side configuration failures raise `LuminusConfigurationError`.
- Tool-side upstream/data-source failures raise `LuminusUpstreamError`.
- Dynamic whole-surface access still works through `LuminusResult`, and common GIS/revenue flows also expose opt-in typed models.

## Notes

- Use `lum.list_tools()` to see the live tool surface for the active profile.
- Use `lum.describe_tool("tool_name")` to inspect the MCP description/schema metadata.
- Use `lum.call_many()` / `lum.call_many_to_pandas()` for generic multi-zone or multi-site notebook pulls.
- Use `parallel=True` on batch helpers when you want the SDK to fan out across multiple MCP subprocesses.
- Use `lum.get_day_ahead_prices_many()` and `lum.get_generation_mix_many()` for common analyst workflows.
- Use `lum.compare_sites_rankings()` together with `lum.compare_sites_rankings_geojson()` and `lum.compare_sites_rankings_geodataframe()` for ranked siting output.
- Use the typed snapshots only when they help notebook readability; the raw dynamic MCP surface is still available.
- Notebook demos live in [`examples/`](examples/).
- Use `to_geojson()` for lightweight mapping and `to_geodataframe()` when GeoPandas is installed.

- Requires `luminus-mcp` to be available on `PATH`, unless you pass an explicit command.
- By default the client starts `luminus-mcp --profile <profile>`.
- For local repo development you can point it at the built server directly:

```python
lum = Luminus(command=["node", r"C:\Users\skf_s\luminus\dist\index.js"], profile="gis")
```
