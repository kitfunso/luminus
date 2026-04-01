from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping


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

    def _frame_rows(self, data_key: str | None = None) -> list[dict[str, Any]]:
        value = self.raw
        if data_key is not None:
            if not isinstance(value, dict) or data_key not in value:
                raise KeyError(f"{data_key!r} not found in {self.tool_name} result")
            value = value[data_key]

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

    def to_pandas(self, data_key: str | None = None):
        try:
            import pandas as pd
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "pandas is not installed. Install luminus-py[notebook] or add pandas manually."
            ) from exc

        return pd.DataFrame(self._frame_rows(data_key=data_key))
