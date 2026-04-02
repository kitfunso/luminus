from luminus.models import GridProximitySnapshot
from luminus.result import LuminusResult


def test_to_pandas_flattens_single_list_field_with_metadata():
    result = LuminusResult(
        tool_name="get_day_ahead_prices",
        raw={
            "zone": "DE",
            "prices": [
                {"hour": 0, "price_eur_mwh": 42.0},
                {"hour": 1, "price_eur_mwh": 43.5},
            ],
        },
    )

    df = result.to_pandas()

    assert list(df.columns) == ["zone", "hour", "price_eur_mwh"]
    assert df["zone"].tolist() == ["DE", "DE"]


def test_to_pandas_wraps_scalar_dicts_as_single_row_frame():
    result = LuminusResult(tool_name="get_server_status", raw={"activeProfile": "full", "registeredTools": 56})
    df = result.to_pandas()

    assert df.iloc[0]["activeProfile"] == "full"
    assert df.iloc[0]["registeredTools"] == 56


def test_to_model_builds_typed_snapshot():
    result = LuminusResult(
        tool_name="get_grid_proximity",
        raw={
            "lat": 52.0,
            "lon": 0.1,
            "radius_km": 5,
            "substations": [
                {
                    "name": "Alpha Grid",
                    "voltage_kv": 132,
                    "operator": "NGET",
                    "distance_km": 1.2,
                    "lat": 52.101,
                    "lon": 0.201,
                }
            ],
            "lines": [{"voltage_kv": 275, "operator": "NGET", "distance_km": 0.8, "cables": 2}],
            "summary": {
                "nearest_substation_km": 1.2,
                "nearest_line_km": 0.8,
                "max_nearby_voltage_kv": 275,
            },
            "source_metadata": {"source": "fake-overpass"},
        },
    )

    snapshot = result.to_model(GridProximitySnapshot)

    assert snapshot.summary.max_nearby_voltage_kv == 275
    assert snapshot.substations[0].name == "Alpha Grid"
