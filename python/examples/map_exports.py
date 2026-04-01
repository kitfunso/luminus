# %%
from luminus import Luminus

lum = Luminus(profile="gis")

# %%
# Get ranked comparison output as GeoJSON for quick mapping libraries.
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
# If GeoPandas is installed, use GeoDataFrames directly.
# rankings_gdf = lum.call_tool_to_geodataframe(...)

# %%
lum.close()
