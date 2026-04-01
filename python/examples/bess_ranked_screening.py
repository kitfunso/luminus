# %%
from luminus import Luminus

# Start with the GIS profile for screening and ranking candidate sites.
lum = Luminus(profile="gis")

# %%
comparison = lum.compare_sites(
    country="GB",
    sites=[
        {"label": "A", "lat": 52.12, "lon": 0.18},
        {"label": "B", "lat": 52.08, "lon": 0.22},
        {"label": "C", "lat": 52.05, "lon": 0.16},
    ],
)

rankings = comparison.to_pandas(data_key="rankings")
rankings

# %%
# GeoJSON is handy even without GeoPandas.
comparison.to_geojson(data_key="rankings")

# %%
# Switch to the BESS profile for storage economics on shortlisted sites.
bess = Luminus(profile="bess")
revenue = bess.estimate_site_revenue(lat=52.12, lon=0.18, zone="GB", technology="bess")
revenue.to_dict()

# %%
lum.close()
bess.close()
