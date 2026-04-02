from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Protocol, TypeVar


T = TypeVar("T")


class SupportsFromDict(Protocol[T]):
    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> T: ...


@dataclass(slots=True)
class LuminusResult:
    tool_name: str
    raw: Any
    raw_response: Mapping[str, Any] | None = field(default=None)

    @property
    def data(self) -> Any:
        return self.raw

    def to_dict(self) -> Any:
        return self.raw

    def _resolve_value(self, data_key: str | None = None) -> Any:
        value = self.raw
        if data_key is not None:
            if not isinstance(value, dict) or data_key not in value:
                raise KeyError(f"{data_key!r} not found in {self.tool_name} result")
            value = value[data_key]
        return value

    def _frame_rows(self, data_key: str | None = None) -> list[dict[str, Any]]:
        value = self._resolve_value(data_key=data_key)

        if isinstance(value, list):
            if all(isinstance(item, dict) for item in value):
                return value
            return [{"value": item} for item in value]

        if isinstance(value, dict):
            list_keys = [key for key, item in value.items() if isinstance(item, list)]
            if len(list_keys) == 1:
                list_key = list_keys[0]
                rows = value[list_key]
                meta = {
                    key: item
                    for key, item in value.items()
                    if key != list_key and not isinstance(item, (dict, list))
                }
                if all(isinstance(item, dict) for item in rows):
                    return [{**meta, **row} for row in rows]
                return [{**meta, "value": item} for item in rows]
            return [value]

        return [{"value": value}]

    def _extract_lon_lat(self, row: Mapping[str, Any]) -> tuple[float, float] | None:
        if "lon" in row and "lat" in row:
            lon = row.get("lon")
            lat = row.get("lat")
            if isinstance(lon, (int, float)) and isinstance(lat, (int, float)):
                return float(lon), float(lat)

        if "longitude" in row and "latitude" in row:
            lon = row.get("longitude")
            lat = row.get("latitude")
            if isinstance(lon, (int, float)) and isinstance(lat, (int, float)):
                return float(lon), float(lat)

        coords = row.get("coordinates")
        if isinstance(coords, (list, tuple)) and len(coords) >= 2:
            lon, lat = coords[0], coords[1]
            if isinstance(lon, (int, float)) and isinstance(lat, (int, float)):
                return float(lon), float(lat)

        return None

    def to_pandas(self, data_key: str | None = None):
        try:
            import pandas as pd
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "pandas is not installed. Install luminus-py[notebook] or add pandas manually."
            ) from exc

        return pd.DataFrame(self._frame_rows(data_key=data_key))

    def to_flat_pandas(self, data_key: str | None = None, *, sep: str = "."):
        try:
            import pandas as pd
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "pandas is not installed. Install luminus-py[notebook] or add pandas manually."
            ) from exc

        value = self._resolve_value(data_key=data_key)
        if isinstance(value, list):
            return pd.json_normalize(value, sep=sep)
        return pd.json_normalize(value, sep=sep)

    def to_model(self, model_type: type[SupportsFromDict[T]], data_key: str | None = None) -> T:
        value = self._resolve_value(data_key=data_key)
        if not isinstance(value, Mapping):
            raise TypeError(f"{self.tool_name} result is not a mapping and cannot be converted to {model_type.__name__}")
        return model_type.from_dict(value)

    def to_geojson(self, data_key: str | None = None) -> dict[str, Any]:
        features: list[dict[str, Any]] = []
        for row in self._frame_rows(data_key=data_key):
            lon_lat = self._extract_lon_lat(row)
            if lon_lat is None:
                continue
            lon, lat = lon_lat
            properties = {
                key: value
                for key, value in row.items()
                if key not in {"lon", "lat", "longitude", "latitude", "coordinates"}
            }
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": properties,
                }
            )

        if not features:
            raise ValueError(
                f"{self.tool_name} does not contain any rows with lat/lon-style coordinates. "
                "Pass data_key=... if the geospatial rows live under a nested list."
            )

        return {"type": "FeatureCollection", "features": features}

    def to_geodataframe(self, data_key: str | None = None, *, crs: str = "EPSG:4326"):
        try:
            import geopandas as gpd
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "geopandas is not installed. Install luminus-py[gis] or luminus-py[all]."
            ) from exc

        rows: list[dict[str, Any]] = []
        for row in self._frame_rows(data_key=data_key):
            lon_lat = self._extract_lon_lat(row)
            if lon_lat is None:
                continue
            lon, lat = lon_lat
            cleaned = {
                key: value
                for key, value in row.items()
                if key not in {"lon", "lat", "longitude", "latitude", "coordinates"}
            }
            cleaned["lon"] = lon
            cleaned["lat"] = lat
            rows.append(cleaned)

        if not rows:
            raise ValueError(
                f"{self.tool_name} does not contain any rows with lat/lon-style coordinates. "
                "Pass data_key=... if the geospatial rows live under a nested list."
            )

        frame = gpd.GeoDataFrame(rows)
        frame["geometry"] = gpd.points_from_xy(frame["lon"], frame["lat"])
        frame.set_crs(crs, inplace=True)
        return frame
