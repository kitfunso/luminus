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
# Pull live generation mix for the same zone.
generation = lum.get_generation_mix(zone="DE")
generation_df = generation.to_pandas()
generation_df.head()

# %%
# Inspect the live tool surface available for the chosen profile.
lum.list_tools()[:10]

# %%
# Always close the subprocess when you're done in a long-running notebook.
lum.close()
