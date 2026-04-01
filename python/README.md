# luminus-py

A notebook-friendly Python client for `luminus-mcp`.

This package starts the existing Node MCP server under the hood, calls tools over stdio, and returns Python-native result objects with optional pandas helpers.

Any MCP tool exposed by `luminus-mcp` is callable directly as a Python method, so the SDK does not need a hand-written wrapper for every tool.

The SDK also includes geospatial helpers for notebook workflows: `to_geojson()` for lightweight mapping and `to_geodataframe()` for GeoPandas users.

## Quick start

```python
from luminus import Luminus

lum = Luminus(profile="trader")
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

## Notes

- Use `lum.list_tools()` to see the live tool surface for the active profile.
- Use `lum.describe_tool("tool_name")` to inspect the MCP description/schema metadata.
- Use `lum.call_many()` / `lum.call_many_to_pandas()` for multi-zone or multi-site notebook pulls.
- Notebook-style examples live in [`examples/`](examples/).
- Use `to_geojson()` for lightweight mapping and `to_geodataframe()` when GeoPandas is installed.

- Requires `luminus-mcp` to be available on `PATH`, unless you pass an explicit command.
- By default the client starts `luminus-mcp --profile <profile>`.
- For local repo development you can point it at the built server directly:

```python
lum = Luminus(command=["node", r"C:\Users\skf_s\luminus\dist\index.js"], profile="gis")
```
