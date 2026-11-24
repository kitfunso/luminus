# %%
from luminus import Luminus

lum = Luminus(profile="trader")

# %%
prices = lum.get_day_ahead_prices(zone="DE")
prices_df = prices.to_pandas()
prices_df.head()

# %%
multi_zone_prices = lum.get_day_ahead_prices_many(["DE", "FR", "NL"])
multi_zone_prices.head()

# %%
generation_df = lum.get_generation_mix_many(["DE", "FR"])
generation_df.head()

# %%
lum.list_tools()[:10]

# %%
lum.close()
