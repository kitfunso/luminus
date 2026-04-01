# %%
from luminus import Luminus

# GIS profile keeps the server focused on siting tools.
lum = Luminus(profile="gis")

# %%
site = lum.screen_site(lat=52.12, lon=0.18, country="GB")
site.to_dict()

# %%
comparison = lum.compare_sites(
    country="GB",
    sites=[
        {"name": "A", "lat": 52.12, "lon": 0.18},
        {"name": "B", "lat": 52.08, "lon": 0.22},
    ],
)
comparison.to_pandas(data_key="rankings")

# %%
rankings = lum.compare_sites_rankings(
    country="GB",
    sites=[
        {"name": "A", "lat": 52.12, "lon": 0.18},
        {"name": "B", "lat": 52.08, "lon": 0.22},
    ],
)
rankings

# %%
lum.close()
