# %%
from luminus import Luminus

with Luminus(profile="trader", env={"ENTSOE_API_KEY": "your-token-here"}) as lum:
    status = lum.get_server_status().to_dict()
    status
