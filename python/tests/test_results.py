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
