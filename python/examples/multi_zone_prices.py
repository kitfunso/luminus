# %%
from luminus import Luminus

lum = Luminus(profile="trader")

# %%
# Pull the same tool across several zones and combine the result into one DataFrame.
prices = lum.call_many_to_pandas(
    "get_day_ahead_prices",
    [
        {"zone": "DE"},
        {"zone": "FR"},
        {"zone": "NL"},
    ],
)
prices.head()

# %%
lum.close()
