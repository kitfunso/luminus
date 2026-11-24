# %%
from luminus import Luminus

lum = Luminus(profile="gis")

# %%
rankings_geojson = lum.call_tool_to_geojson(
    "compare_sites",
    {
        "country": "GB",
        "sites": [
            {"label": "A", "lat": 52.12, "lon": 0.18},
            {"label": "B", "lat": 52.08, "lon": 0.22},
        ],
    },
    data_key="rankings",
)
rankings_geojson

# %%
# %%
lum.close()
