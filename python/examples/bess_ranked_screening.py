# %%
from luminus import Luminus

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
comparison.to_geojson(data_key="rankings")

# %%
bess = Luminus(profile="bess")
revenue = bess.estimate_site_revenue(lat=52.12, lon=0.18, zone="GB", technology="bess")
revenue.to_dict()

# %%
lum.close()
bess.close()
