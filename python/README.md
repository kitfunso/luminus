# luminus-py

A notebook-friendly Python client for `luminus-mcp`.

This package starts the existing Node MCP server under the hood, calls tools over stdio, and returns Python-native result objects with optional pandas helpers.

## Quick start

```python
from luminus import Luminus

lum = Luminus(profile="trader")
prices = lum.get_day_ahead_prices(zone="DE")
df = prices.to_pandas()
```

## Notes

- Requires `luminus-mcp` to be available on `PATH`, unless you pass an explicit command.
- By default the client starts `luminus-mcp --profile <profile>`.
- For local repo development you can point it at the built server directly:

```python
lum = Luminus(command=["node", r"C:\Users\skf_s\luminus\dist\index.js"], profile="gis")
```
