# %%
from luminus import Luminus

# Start the MCP with the trader profile for lower context/tool overhead.
lum = Luminus(profile="trader")

# %%
# Pull day-ahead prices into a pandas DataFrame.
prices = lum.get_day_ahead_prices(zone="DE")
prices_df = prices.to_pandas()
prices_df.head()

# %%
# Pull the same dataset across several zones in one shot.
multi_zone_prices = lum.get_day_ahead_prices_many(["DE", "FR", "NL"])
multi_zone_prices.head()

# %%
# Pull live generation mix for the same zones.
generation_df = lum.get_generation_mix_many(["DE", "FR"])
generation_df.head()

# %%
# Inspect the live tool surface available for the chosen profile.
lum.list_tools()[:10]

# %%
# Always close the subprocess when you're done in a long-running notebook.
lum.close()
