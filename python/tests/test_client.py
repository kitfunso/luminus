from pathlib import Path

import pytest

from luminus import Luminus


ROOT = Path(__file__).resolve().parents[2]
FAKE_SERVER = ROOT / "python" / "tests" / "fake_mcp_server.py"
REAL_SERVER = ROOT / "dist" / "index.js"


def test_list_tools_from_fake_server():
    client = Luminus(command=["python", str(FAKE_SERVER)])
    try:
        tools = client.list_tools()
        assert "get_day_ahead_prices" in tools
        assert "screen_site" in tools
    finally:
        client.close()


def test_convenience_methods_and_dataframe_helpers():
    client = Luminus(command=["python", str(FAKE_SERVER)])
    try:
        prices = client.get_day_ahead_prices(zone="DE")
        df = prices.to_pandas()
        assert list(df.columns) == ["zone", "hour", "price_eur_mwh"]
        assert df["zone"].tolist() == ["DE", "DE"]

        generation = client.get_generation_mix(zone="DE")
        gen_df = generation.to_pandas()
        assert "fuel_type" in gen_df.columns
        assert gen_df["mw"].sum() == 2000

        site = client.screen_site(lat=52.0, lon=0.1, country="GB")
        assert site.to_dict()["verdict"]["overall"] == "pass"
    finally:
        client.close()


def test_real_luminus_server_smoke():
    if not REAL_SERVER.exists():
        pytest.skip("dist/index.js not built")

    client = Luminus(command=["node", str(REAL_SERVER)], cwd=ROOT)
    try:
        tools = client.list_tools()
        assert "get_generation_mix" in tools
        assert len(tools) >= 50
    finally:
        client.close()
