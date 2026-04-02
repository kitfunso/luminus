from pathlib import Path

import pytest

from luminus import (
    GridConnectionQueueSnapshot,
    GridProximitySnapshot,
    Luminus,
    LuminusConfigurationError,
    LuminusStartupError,
    LuminusUpstreamError,
    SiteRevenueEstimate,
)


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


def test_dynamic_tool_binding_and_metadata():
    client = Luminus(command=["python", str(FAKE_SERVER)])
    try:
        assert "get_cross_border_flows" in client.list_tools()
        assert "compare_sites" in dir(client)

        spec = client.describe_tool("get_cross_border_flows")
        assert spec["description"] == "fake flows"

        flows = client.get_cross_border_flows(from_zone="DE", to_zone="NL")
        flow_df = flows.to_pandas()
        assert list(flow_df.columns) == ["from_zone", "to_zone", "date", "hour", "mw"]
        assert flow_df["from_zone"].tolist() == ["DE", "DE"]

        comparison = client.compare_sites(country="GB")
        assert comparison.to_pandas(data_key="rankings")["rank"].tolist() == [1, 2]

        geojson = client.call_tool_to_geojson("compare_sites", {"country": "GB"}, data_key="rankings")
        assert geojson["features"][0]["geometry"]["coordinates"] == [0.2, 52.1]

        prices_df = client.call_tool_to_pandas("get_day_ahead_prices", {"zone": "DE"})
        assert prices_df["zone"].tolist() == ["DE", "DE"]
    finally:
        client.close()


def test_batch_helpers():
    client = Luminus(command=["python", str(FAKE_SERVER)])
    try:
        results = client.call_many(
            "get_day_ahead_prices",
            [{"zone": "DE"}, {"zone": "FR"}],
        )
        assert [result.to_dict()["zone"] for result in results] == ["DE", "FR"]

        frame = client.call_many_to_pandas(
            "get_day_ahead_prices",
            [{"zone": "DE"}, {"zone": "FR"}],
        )
        assert frame["request_zone"].tolist() == ["DE", "DE", "FR", "FR"]
        assert frame["zone"].tolist() == ["DE", "DE", "FR", "FR"]

        prices_many = client.get_day_ahead_prices_many(["DE", "FR"])
        assert prices_many["zone"].tolist() == ["DE", "DE", "FR", "FR"]

        parallel_prices = client.get_day_ahead_prices_many(["DE", "FR"], parallel=True, max_workers=2)
        assert parallel_prices["request_zone"].tolist() == ["DE", "DE", "FR", "FR"]

        generation_many = client.get_generation_mix_many(["DE", "FR"])
        assert generation_many["request_zone"].tolist() == ["DE", "DE", "FR", "FR"]
        assert generation_many["mw"].sum() == 4000

        parallel_generation = client.get_generation_mix_many(["DE", "FR"], parallel=True, max_workers=2)
        assert parallel_generation["mw"].sum() == 4000

        rankings = client.compare_sites_rankings(country="GB")
        assert rankings["rank"].tolist() == [1, 2]

        rankings_geojson = client.compare_sites_rankings_geojson(country="GB")
        assert rankings_geojson["features"][1]["properties"]["rank"] == 2
    finally:
        client.close()


def test_notebook_friendly_helper_methods():
    client = Luminus(command=["python", str(FAKE_SERVER)])
    try:
        outages = client.get_outages_frame(zone="DE", type="generation")
        assert outages["unit_name"].tolist() == ["Plant A", "Plant B"]
        assert outages["unavailable_mw"].sum() == 500

        flows = client.get_cross_border_flows_many([("DE", "NL"), ("FR", "DE")], date="2026-04-02")
        assert flows["request_from_zone"].tolist() == ["DE", "DE", "FR", "FR"]
        assert flows["mw"].sum() == 4700

        substations = client.get_grid_proximity_substations(lat=52.0, lon=0.1)
        assert substations.iloc[0]["name"] == "Alpha Grid"
        assert substations.iloc[0]["voltage_kv"] == 132

        lines = client.get_grid_proximity_lines(lat=52.0, lon=0.1)
        assert lines.iloc[0]["distance_km"] == 0.8

        projects = client.get_grid_connection_queue_projects(connection_site_query="berks")
        assert projects["project_name"].tolist() == ["Battery One", "Solar Two"]

        sites = client.get_grid_connection_queue_sites(connection_site_query="berks")
        assert sites.iloc[0]["connection_site"] == "Berkswell"

        revenue = client.estimate_site_revenue_frame(
            lat=52.0,
            lon=0.1,
            zone="GB",
            technology="bess",
            capacity_mw=20,
        )
        assert revenue.iloc[0]["technology"] == "bess"
        assert revenue.iloc[0]["revenue.estimated_annual_revenue_eur"] == 529250.0
    finally:
        client.close()


def test_typed_models_remain_opt_in():
    client = Luminus(command=["python", str(FAKE_SERVER)])
    try:
        proximity = client.get_grid_proximity_snapshot(lat=52.0, lon=0.1)
        assert isinstance(proximity, GridProximitySnapshot)
        assert proximity.summary.nearest_substation_km == 1.2
        assert proximity.substations[0].name == "Alpha Grid"

        queue = client.get_grid_connection_queue_snapshot(connection_site_query="berks")
        assert isinstance(queue, GridConnectionQueueSnapshot)
        assert queue.summary.matched_projects == 2
        assert queue.projects[0].project_name == "Battery One"

        revenue = client.estimate_site_revenue_estimate(
            lat=52.0,
            lon=0.1,
            zone="GB",
            technology="bess",
        )
        assert isinstance(revenue, SiteRevenueEstimate)
        assert revenue.revenue.estimated_annual_revenue_eur == 529250.0
        assert revenue.price_snapshot.mean_eur_mwh == 82.5
    finally:
        client.close()


def test_python_side_error_translation():
    client = Luminus(command=["python", str(FAKE_SERVER)])
    try:
        with pytest.raises(LuminusConfigurationError):
            client.get_cross_border_flows(from_zone="KEYERR", to_zone="NL")

        with pytest.raises(LuminusUpstreamError):
            client.get_outages(zone="UPSTREAM_FAIL", type="generation")
    finally:
        client.close()


def test_startup_failures_raise_startup_error():
    with pytest.raises(LuminusStartupError):
        Luminus(command=["python", "-c", "import sys; sys.exit(2)"])


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
