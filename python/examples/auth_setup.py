# %%
from luminus import Luminus

# Long-lived keys are best kept in ~/.luminus/keys.json.
# For one-off notebook overrides, pass env={...}.
with Luminus(profile="trader", env={"ENTSOE_API_KEY": "your-token-here"}) as lum:
    status = lum.get_server_status().to_dict()
    status
