from luminus.result import LuminusResult


def test_to_geojson_builds_feature_collection_from_scalar_point_result():
    result = LuminusResult(
        tool_name="screen_site",
        raw={
            "lat": 52.1,
            "lon": 0.2,
            "country": "GB",
            "verdict": {"overall": "pass", "flags": []},
        },
    )

    geojson = result.to_geojson()

    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) == 1
    assert geojson["features"][0]["geometry"]["coordinates"] == [0.2, 52.1]
    assert geojson["features"][0]["properties"]["country"] == "GB"


def test_to_geojson_supports_nested_rankings_via_data_key():
    result = LuminusResult(
        tool_name="compare_sites",
        raw={
            "site_count": 2,
            "rankings": [
                {"label": "A", "lat": 52.1, "lon": 0.2, "rank": 1},
                {"label": "B", "lat": 52.2, "lon": 0.3, "rank": 2},
            ],
            "failed_sites": [],
        },
    )

    geojson = result.to_geojson(data_key="rankings")

    assert len(geojson["features"]) == 2
    assert geojson["features"][1]["properties"]["rank"] == 2


def test_to_geojson_raises_cleanly_when_no_coordinates_exist():
    result = LuminusResult(tool_name="get_server_status", raw={"activeProfile": "full"})

    try:
        result.to_geojson()
        assert False, "Expected ValueError"
    except ValueError as exc:
        assert "lat/lon-style coordinates" in str(exc)
