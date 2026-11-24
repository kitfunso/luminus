# %%
from luminus import Luminus

lum = Luminus(profile="trader")

# %%
prices = lum.call_many_to_pandas(
    "get_day_ahead_prices",
    [
        {"zone": "DE"},
        {"zone": "FR"},
        {"zone": "NL"},
    ],
    parallel=True,
)
prices.head()

# %%
lum.close()
