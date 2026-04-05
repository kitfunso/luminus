from pathlib import Path

import pytest

from luminus import (
    BessSiteShortlistSnapshot,
    ConstraintBreachesSnapshot,
    DistributionHeadroomSnapshot,
    EcrSnapshot,
    FlexMarketSnapshot,
    GridConnectionIntelligenceSnapshot,
    GridConnectionQueueSnapshot,
    GridProximitySnapshot,
    Luminus,
    LuminusConfigurationError,
    LuminusStartupError,
    LuminusUpstreamError,
    NgedConnectionSignalSnapshot,
    SiteRevenueEstimate,
    SpenGridSnapshot,
    TerrainSnapshot,
    UkpnGridSnapshot,
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

        headroom = client.get_distribution_headroom_matches(lat=50.84, lon=-1.08, operator="SSEN")
        assert headroom.iloc[0]["substation"] == "Portsmouth"
        assert headroom.iloc[0]["estimated_generation_headroom_mw"] == 18.5
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

        headroom = client.get_distribution_headroom_snapshot(lat=50.84, lon=-1.08, operator="SSEN")
        assert isinstance(headroom, DistributionHeadroomSnapshot)
        assert headroom.nearest_site is not None
        assert headroom.nearest_site.substation == "Portsmouth"
        assert headroom.matches[0].generation_rag_status == "Green"

        intelligence = client.get_grid_connection_intelligence_snapshot(
            lat=50.84,
            lon=-1.08,
            country="GB",
        )
        assert isinstance(intelligence, GridConnectionIntelligenceSnapshot)
        assert intelligence.nearest_gsp is not None
        assert intelligence.nearest_gsp.region_name == "Lovedean"
        assert intelligence.connection_queue is not None
        assert intelligence.connection_queue.total_mw_queued == 320.0
        assert intelligence.distribution_headroom is not None
        assert intelligence.distribution_headroom.substation == "Portsmouth"
        assert intelligence.nged_connection_signal is not None
        assert intelligence.nged_connection_signal.queue_signal is not None
        assert intelligence.nged_connection_signal.queue_signal.summary.matched_projects == 2
        assert intelligence.nged_connection_signal.queue_signal.projects[0].fuel_type == "Battery"
        assert intelligence.nged_connection_signal.td_limits is not None
        assert intelligence.nged_connection_signal.td_limits.summary.max_export_tl_mw == 63.9
        assert intelligence.nged_connection_signal.td_limits.rows[0].season == "Winter"
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


def test_ecr_helpers():
    client = Luminus(command=["python", str(FAKE_SERVER)])
    try:
        entries = client.get_ecr_entries(operator="UKPN")
        assert len(entries) == 3
        assert entries["site_name"].tolist() == ["Solar Farm Alpha", "Battery Beta", "Solar Gamma"]
        assert entries["export_mw"].sum() == 45.5

        snapshot = client.get_ecr_snapshot(operator="UKPN")
        assert isinstance(snapshot, EcrSnapshot)
        assert snapshot.total_matched == 3
        assert snapshot.total_export_mw == 45.5
        assert snapshot.total_import_mw == 12.0
        assert snapshot.total_storage_mwh == 80.0
        assert snapshot.energy_source_breakdown == {"Solar": 2, "Battery": 1}
        assert snapshot.status_breakdown == {"Accepted": 2, "Connected": 1}
        assert len(snapshot.entries) == 3
    finally:
        client.close()


def test_flex_market_helpers():
    client = Luminus(command=["python", str(FAKE_SERVER)])
    try:
        dispatches = client.get_flex_dispatches(operator="UKPN", days=30)
        assert len(dispatches) == 2
        assert dispatches["mwh"].sum() == 18.5

        snapshot = client.get_flex_market_snapshot(operator="UKPN")
        assert isinstance(snapshot, FlexMarketSnapshot)
        assert snapshot.total_dispatches == 2
        assert snapshot.total_mwh == 18.5
        assert snapshot.avg_utilisation_price == 125.0
        assert snapshot.zone_breakdown == {"East": 1, "South": 1}
    finally:
        client.close()


def test_constraint_breaches_helpers():
    client = Luminus(command=["python", str(FAKE_SERVER)])
    try:
        breaches = client.get_constraint_breaches_frame(days=90)
        assert len(breaches) == 2
        assert breaches["curtailment_kwh"].sum() == 5500.0

        snapshot = client.get_constraint_breaches_snapshot(days=90)
        assert isinstance(snapshot, ConstraintBreachesSnapshot)
        assert snapshot.total_breaches == 2
        assert snapshot.total_curtailment_kwh == 5500.0
        assert snapshot.total_curtailment_hours == 14.0
        assert snapshot.scheme_breakdown == {"ANM": 1, "Intertrip": 1}
    finally:
        client.close()


def test_spen_grid_helpers():
    client = Luminus(command=["python", str(FAKE_SERVER)])
    try:
        snapshot = client.get_spen_grid_snapshot()
        assert isinstance(snapshot, SpenGridSnapshot)
        assert snapshot.queue.total_projects == 2
        assert snapshot.queue.total_mw == 85.0
        assert snapshot.dg_capacity.total_substations == 2
        assert snapshot.curtailment.total_events == 2
        assert snapshot.curtailment.total_curtailed_mwh == 320.0

        queue_df = client.get_spen_queue_frame()
        assert len(queue_df) == 2
        assert queue_df["name"].tolist() == ["Wind North", "Solar South"]

        dg_df = client.get_spen_dg_capacity_frame()
        assert len(dg_df) == 2
        assert dg_df["headroom_mw"].sum() == 20.5

        curtail_df = client.get_spen_curtailment_frame()
        assert len(curtail_df) == 2
        assert curtail_df["curtailed_mwh"].sum() == 320.0
    finally:
        client.close()


def test_ukpn_grid_helpers():
    client = Luminus(command=["python", str(FAKE_SERVER)])
    try:
        snapshot = client.get_ukpn_grid_snapshot()
        assert isinstance(snapshot, UkpnGridSnapshot)
        assert len(snapshot.gsps) == 2
        assert len(snapshot.flex_zones) == 1
        assert len(snapshot.live_faults) == 1

        gsps = client.get_ukpn_gsps_frame()
        assert gsps["gsp_name"].tolist() == ["Sellindge", "Bolney"]

        flex = client.get_ukpn_flex_zones_frame()
        assert flex.iloc[0]["zone_name"] == "Kent Flex"

        faults = client.get_ukpn_faults_frame()
        assert faults.iloc[0]["fault_id"] == "F001"
    finally:
        client.close()


def test_trading_price_helpers():
    client = Luminus(command=["python", str(FAKE_SERVER)])
    try:
        balancing = client.get_balancing_prices_frame(zone="GB")
        assert len(balancing) == 2
        assert balancing["price_gbp_mwh"].tolist() == [55.0, 62.0]

        intraday = client.get_intraday_prices_frame(zone="GB")
        assert len(intraday) == 2
        assert intraday["price_eur_mwh"].tolist() == [48.0, 51.0]

        imbalance = client.get_imbalance_prices_frame(zone="GB")
        assert len(imbalance) == 2
        assert imbalance["buy_price"].tolist() == [70.0, 75.0]

        spread = client.get_spread_analysis_frame(zone="GB")
        assert spread.iloc[0]["spread"] == 78.0
        assert spread.iloc[0]["periods_analysed"] == 48

        ancillary = client.get_ancillary_prices_frame(zone="GB")
        assert len(ancillary) == 2
        assert ancillary["service"].tolist() == ["DCL", "DCH"]
    finally:
        client.close()


def test_nged_connection_signal_helpers():
    client = Luminus(command=["python", str(FAKE_SERVER)])
    try:
        snapshot = client.get_nged_signal_snapshot()
        assert isinstance(snapshot, NgedConnectionSignalSnapshot)
        assert snapshot.resource_name == "Test GSP"
        assert snapshot.summary["matched_projects"] == 2
        assert len(snapshot.queue) == 2

        queue_df = client.get_nged_queue_frame()
        assert len(queue_df) == 2
        assert queue_df["project_name"].tolist() == ["NGED Proj A", "NGED Proj B"]
    finally:
        client.close()


def test_terrain_analysis_helper():
    client = Luminus(command=["python", str(FAKE_SERVER)])
    try:
        terrain = client.get_terrain_snapshot(lat=51.5, lon=-0.1)
        assert isinstance(terrain, TerrainSnapshot)
        assert terrain.elevation_m == 85.0
        assert terrain.slope_deg == 3.2
        assert terrain.aspect_cardinal == "SW"
        assert terrain.land_cover == "Grassland"
        assert terrain.flood_risk == "Low"
    finally:
        client.close()


def test_land_constraints_helper():
    client = Luminus(command=["python", str(FAKE_SERVER)])
    try:
        constraints = client.get_land_constraints_frame(lat=51.5, lon=-0.1)
        assert len(constraints) == 2
        assert constraints["type"].tolist() == ["SSSI", "Flood Zone 3"]
        assert constraints["severity"].tolist() == ["High", "Medium"]
    finally:
        client.close()


def test_bess_shortlist_helpers():
    client = Luminus(command=["python", str(FAKE_SERVER)])
    try:
        shortlist = client.shortlist_bess_frame()
        assert len(shortlist) == 2
        assert shortlist["site_name"].tolist() == ["Grid Park Alpha", "Industrial Zone B"]
        assert shortlist["score"].tolist() == [0.92, 0.85]

        snapshot = client.shortlist_bess_snapshot()
        assert isinstance(snapshot, BessSiteShortlistSnapshot)
        assert snapshot.total_candidates == 10
        assert snapshot.total_shortlisted == 2
        assert len(snapshot.shortlist) == 2
    finally:
        client.close()


def test_verify_gis_sources_helper():
    client = Luminus(command=["python", str(FAKE_SERVER)])
    try:
        sources = client.verify_gis_sources_frame()
        assert len(sources) == 3
        assert sources["source_name"].tolist() == ["OS Open Data", "LIDAR DTM", "EA Flood Map"]
        assert sources["status"].tolist() == ["OK", "OK", "Degraded"]
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
        assert "get_grid_connection_intelligence" in tools
        assert "luminus_status" in tools
        assert len(tools) >= 30
    finally:
        client.close()
