from __future__ import annotations

import atexit
import json
import os
import queue
import shutil
import subprocess
import threading
import time
import weakref
from concurrent.futures import ThreadPoolExecutor
from itertools import count
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from .exceptions import (
    LuminusConfigurationError,
    LuminusError,
    LuminusProtocolError,
    LuminusStartupError,
    LuminusToolError,
    LuminusTransportError,
    LuminusUpstreamError,
)
from .models import (
    BessSiteShortlistSnapshot,
    ConstraintBreachesSnapshot,
    DistributionHeadroomSnapshot,
    EcrSnapshot,
    FlexMarketSnapshot,
    GridConnectionIntelligenceSnapshot,
    GridConnectionQueueSnapshot,
    GridProximitySnapshot,
    NgedConnectionSignalSnapshot,
    SiteRevenueEstimate,
    SpenGridSnapshot,
    TerrainSnapshot,
    UkpnGridSnapshot,
)
from .result import LuminusResult

DEFAULT_PROTOCOL_VERSION = "2025-03-26"
DEFAULT_CLIENT_NAME = "luminus-py"
DEFAULT_CLIENT_VERSION = "0.4.0"

_ACTIVE_CLIENTS: "weakref.WeakSet[Luminus]" = weakref.WeakSet()


def _close_active_clients() -> None:  # pragma: no cover - process-exit behaviour
    for client in list(_ACTIVE_CLIENTS):
        try:
            client.close()
        except Exception:
            pass


atexit.register(_close_active_clients)


class _PipePump(threading.Thread):
    def __init__(self, pipe, sink: "queue.Queue[str]"):
        super().__init__(daemon=True)
        self._pipe = pipe
        self._sink = sink

    def run(self) -> None:  # pragma: no cover - exercised indirectly
        try:
            for line in self._pipe:
                self._sink.put(line.rstrip("\r\n"))
        finally:
            self._sink.put("")


class Luminus:
    def __init__(
        self,
        command: Sequence[str] | str | None = None,
        *,
        profile: str = "full",
        cwd: str | Path | None = None,
        env: Mapping[str, str] | None = None,
        request_timeout: float = 30.0,
        startup_timeout: float = 10.0,
    ) -> None:
        self.profile = profile
        self.cwd = str(cwd) if cwd is not None else None
        self.request_timeout = request_timeout
        self._request_ids = count(1)
        self._stdout_queue: queue.Queue[str] = queue.Queue()
        self._stderr_queue: queue.Queue[str] = queue.Queue()
        self._noise_lines: list[str] = []
        self._lock = threading.Lock()
        self._closed = False
        self._tool_cache: dict[str, dict[str, Any]] = {}

        resolved_command = self._resolve_command(command, profile)
        self._spawn_command = list(resolved_command)
        self._user_env = {key: str(value) for key, value in (env or {}).items()}
        self._startup_timeout = startup_timeout

        merged_env = os.environ.copy()
        merged_env.setdefault("DOTENV_CONFIG_QUIET", "true")
        if self._user_env:
            merged_env.update(self._user_env)

        try:
            self._process = subprocess.Popen(
                resolved_command,
                cwd=self.cwd,
                env=merged_env,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                bufsize=1,
            )
        except FileNotFoundError as exc:
            raise LuminusStartupError(
                "Could not start luminus-mcp. Install it on PATH or pass an explicit command=[...]."
            ) from exc

        if self._process.stdin is None or self._process.stdout is None or self._process.stderr is None:
            raise LuminusStartupError("Failed to open stdio pipes to luminus-mcp.")

        self._stdout_pump = _PipePump(self._process.stdout, self._stdout_queue)
        self._stderr_pump = _PipePump(self._process.stderr, self._stderr_queue)
        self._stdout_pump.start()
        self._stderr_pump.start()

        try:
            init_result = self._request(
                "initialize",
                {
                    "protocolVersion": DEFAULT_PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": {"name": DEFAULT_CLIENT_NAME, "version": DEFAULT_CLIENT_VERSION},
                },
                timeout=startup_timeout,
            )
        except LuminusTransportError as exc:
            self.close()
            raise LuminusStartupError(str(exc)) from exc
        self.protocol_version = init_result.get("protocolVersion", DEFAULT_PROTOCOL_VERSION)
        self.server_info = init_result.get("serverInfo", {})
        self._send({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})
        _ACTIVE_CLIENTS.add(self)

    def __enter__(self) -> "Luminus":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def __del__(self) -> None:  # pragma: no cover - best-effort cleanup
        try:
            self.close()
        except Exception:
            pass

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        _ACTIVE_CLIENTS.discard(self)

        if self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:  # pragma: no cover
                self._process.kill()
                self._process.wait(timeout=5)

    def refresh_tools(self) -> dict[str, dict[str, Any]]:
        result = self._request("tools/list", {})
        self._tool_cache = {
            tool["name"]: tool
            for tool in result.get("tools", [])
            if isinstance(tool, dict) and "name" in tool
        }
        return dict(self._tool_cache)

    def list_tools(self) -> list[str]:
        return list(self.refresh_tools().keys())

    def tool_specs(self) -> dict[str, dict[str, Any]]:
        if not self._tool_cache:
            self.refresh_tools()
        return dict(self._tool_cache)

    def describe_tool(self, name: str) -> dict[str, Any]:
        specs = self.tool_specs()
        if name not in specs:
            raise KeyError(f"Tool {name!r} is not available from this Luminus server")
        return dict(specs[name])

    def call_tool(self, name: str, arguments: Mapping[str, Any] | None = None) -> LuminusResult:
        result = self._request(
            "tools/call",
            {"name": name, "arguments": dict(arguments or {})},
            timeout=self.request_timeout,
        )
        parsed = self._parse_tool_result(result)
        if result.get("isError"):
            self._raise_tool_error(name, parsed)
        return LuminusResult(tool_name=name, raw=parsed, raw_response=result)

    def get_day_ahead_prices(self, **arguments: Any) -> LuminusResult:
        return self.call_tool("get_day_ahead_prices", arguments)

    def get_generation_mix(self, **arguments: Any) -> LuminusResult:
        return self.call_tool("get_generation_mix", arguments)

    def get_outages_frame(self, **arguments: Any):
        return self.call_tool_to_pandas("get_outages", arguments, data_key="outages")

    def screen_site(self, **arguments: Any) -> LuminusResult:
        return self.call_tool("screen_site", arguments)

    def get_server_status(self) -> LuminusResult:
        return self.call_tool("get_server_status", {})

    def get_cross_border_flows_many(
        self,
        corridors: Iterable[tuple[str, str]],
        *,
        parallel: bool = False,
        max_workers: int | None = None,
        **arguments: Any,
    ):
        return self.call_many_to_pandas(
            "get_cross_border_flows",
            [
                {**arguments, "from_zone": from_zone, "to_zone": to_zone}
                for from_zone, to_zone in corridors
            ],
            data_key="flows",
            request_prefix="request_",
            parallel=parallel,
            max_workers=max_workers,
        )

    def get_grid_proximity_substations(self, **arguments: Any):
        return self.call_tool_to_pandas("get_grid_proximity", arguments, data_key="substations")

    def get_grid_proximity_lines(self, **arguments: Any):
        return self.call_tool_to_pandas("get_grid_proximity", arguments, data_key="lines")

    def get_grid_proximity_snapshot(self, **arguments: Any) -> GridProximitySnapshot:
        return self.call_tool("get_grid_proximity", arguments).to_model(GridProximitySnapshot)

    def get_grid_connection_queue_projects(self, **arguments: Any):
        return self.call_tool_to_pandas("get_grid_connection_queue", arguments, data_key="projects")

    def get_grid_connection_queue_sites(self, **arguments: Any):
        return self.call_tool_to_pandas("get_grid_connection_queue", arguments, data_key="connection_sites")

    def get_grid_connection_queue_snapshot(self, **arguments: Any) -> GridConnectionQueueSnapshot:
        return self.call_tool("get_grid_connection_queue", arguments).to_model(GridConnectionQueueSnapshot)

    def get_distribution_headroom_matches(self, **arguments: Any):
        return self.call_tool_to_pandas("get_distribution_headroom", arguments, data_key="matches")

    def get_distribution_headroom_snapshot(self, **arguments: Any) -> DistributionHeadroomSnapshot:
        return self.call_tool("get_distribution_headroom", arguments).to_model(DistributionHeadroomSnapshot)

    def get_grid_connection_intelligence_snapshot(self, **arguments: Any) -> GridConnectionIntelligenceSnapshot:
        return self.call_tool("get_grid_connection_intelligence", arguments).to_model(
            GridConnectionIntelligenceSnapshot
        )

    def estimate_site_revenue_frame(self, **arguments: Any):
        return self.call_tool("estimate_site_revenue", arguments).to_flat_pandas()

    def estimate_site_revenue_estimate(self, **arguments: Any) -> SiteRevenueEstimate:
        return self.call_tool("estimate_site_revenue", arguments).to_model(SiteRevenueEstimate)

    # ------------------------------------------------------------------
    # ECR (Embedded Capacity Register)
    # ------------------------------------------------------------------

    def get_ecr_entries(self, **arguments: Any):
        return self.call_tool_to_pandas("get_embedded_capacity_register", arguments, data_key="entries")

    def get_ecr_snapshot(self, **arguments: Any) -> EcrSnapshot:
        return self.call_tool("get_embedded_capacity_register", arguments).to_model(EcrSnapshot)

    # ------------------------------------------------------------------
    # Flexibility Market
    # ------------------------------------------------------------------

    def get_flex_dispatches(self, **arguments: Any):
        return self.call_tool_to_pandas("get_flexibility_market", arguments, data_key="dispatches")

    def get_flex_market_snapshot(self, **arguments: Any) -> FlexMarketSnapshot:
        return self.call_tool("get_flexibility_market", arguments).to_model(FlexMarketSnapshot)

    # ------------------------------------------------------------------
    # Constraint Breaches
    # ------------------------------------------------------------------

    def get_constraint_breaches_frame(self, **arguments: Any):
        return self.call_tool_to_pandas("get_constraint_breaches", arguments, data_key="breaches")

    def get_constraint_breaches_snapshot(self, **arguments: Any) -> ConstraintBreachesSnapshot:
        return self.call_tool("get_constraint_breaches", arguments).to_model(ConstraintBreachesSnapshot)

    # ------------------------------------------------------------------
    # SPEN Grid Intelligence
    # ------------------------------------------------------------------

    def get_spen_grid_snapshot(self, **arguments: Any) -> SpenGridSnapshot:
        return self.call_tool("get_spen_grid_intelligence", arguments).to_model(SpenGridSnapshot)

    def get_spen_queue_frame(self, **arguments: Any):
        result = self.call_tool("get_spen_grid_intelligence", arguments)
        data = result.to_dict()
        try:
            import pandas as pd
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "pandas is not installed. Install luminus-py[notebook] or add pandas manually."
            ) from exc
        return pd.DataFrame(data.get("queue", {}).get("projects", []))

    def get_spen_dg_capacity_frame(self, **arguments: Any):
        result = self.call_tool("get_spen_grid_intelligence", arguments)
        data = result.to_dict()
        try:
            import pandas as pd
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "pandas is not installed. Install luminus-py[notebook] or add pandas manually."
            ) from exc
        return pd.DataFrame(data.get("dg_capacity", {}).get("entries", []))

    def get_spen_curtailment_frame(self, **arguments: Any):
        result = self.call_tool("get_spen_grid_intelligence", arguments)
        data = result.to_dict()
        try:
            import pandas as pd
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "pandas is not installed. Install luminus-py[notebook] or add pandas manually."
            ) from exc
        return pd.DataFrame(data.get("curtailment", {}).get("events", []))

    # ------------------------------------------------------------------
    # UKPN Grid Overview
    # ------------------------------------------------------------------

    def get_ukpn_grid_snapshot(self, **arguments: Any) -> UkpnGridSnapshot:
        return self.call_tool("get_ukpn_grid_overview", arguments).to_model(UkpnGridSnapshot)

    def get_ukpn_gsps_frame(self, **arguments: Any):
        return self.call_tool_to_pandas("get_ukpn_grid_overview", arguments, data_key="gsps")

    def get_ukpn_flex_zones_frame(self, **arguments: Any):
        return self.call_tool_to_pandas("get_ukpn_grid_overview", arguments, data_key="flex_zones")

    def get_ukpn_faults_frame(self, **arguments: Any):
        return self.call_tool_to_pandas("get_ukpn_grid_overview", arguments, data_key="live_faults")

    # ------------------------------------------------------------------
    # Core trading: balancing, intraday, imbalance, spread, ancillary
    # ------------------------------------------------------------------

    def get_balancing_prices_frame(self, **arguments: Any):
        return self.call_tool_to_pandas("get_balancing_prices", arguments, data_key="prices")

    def get_intraday_prices_frame(self, **arguments: Any):
        return self.call_tool_to_pandas("get_intraday_prices", arguments, data_key="prices")

    def get_imbalance_prices_frame(self, **arguments: Any):
        return self.call_tool_to_pandas("get_imbalance_prices", arguments, data_key="prices")

    def get_spread_analysis_frame(self, **arguments: Any):
        return self.call_tool("get_price_spread_analysis", arguments).to_flat_pandas()

    def get_ancillary_prices_frame(self, **arguments: Any):
        return self.call_tool_to_pandas("get_ancillary_prices", arguments, data_key="prices")

    # ------------------------------------------------------------------
    # NGED Connection Signal
    # ------------------------------------------------------------------

    def get_nged_signal_snapshot(self, **arguments: Any) -> NgedConnectionSignalSnapshot:
        return self.call_tool("get_nged_connection_signal", arguments).to_model(NgedConnectionSignalSnapshot)

    def get_nged_queue_frame(self, **arguments: Any):
        return self.call_tool_to_pandas("get_nged_connection_signal", arguments, data_key="queue")

    # ------------------------------------------------------------------
    # Terrain Analysis
    # ------------------------------------------------------------------

    def get_terrain_snapshot(self, **arguments: Any) -> TerrainSnapshot:
        return self.call_tool("get_terrain_analysis", arguments).to_model(TerrainSnapshot)

    # ------------------------------------------------------------------
    # Land Constraints
    # ------------------------------------------------------------------

    def get_land_constraints_frame(self, **arguments: Any):
        return self.call_tool_to_pandas("get_land_constraints", arguments, data_key="constraints")

    # ------------------------------------------------------------------
    # BESS Site Shortlist
    # ------------------------------------------------------------------

    def shortlist_bess_frame(self, **arguments: Any):
        return self.call_tool_to_pandas("shortlist_bess_sites", arguments, data_key="shortlist")

    def shortlist_bess_snapshot(self, **arguments: Any) -> BessSiteShortlistSnapshot:
        return self.call_tool("shortlist_bess_sites", arguments).to_model(BessSiteShortlistSnapshot)

    # ------------------------------------------------------------------
    # GIS Source Verification
    # ------------------------------------------------------------------

    def verify_gis_sources_frame(self, **arguments: Any):
        return self.call_tool_to_pandas("verify_gis_sources", arguments, data_key="sources")

    def call_tool_to_pandas(
        self,
        name: str,
        arguments: Mapping[str, Any] | None = None,
        *,
        data_key: str | None = None,
    ):
        return self.call_tool(name, arguments).to_pandas(data_key=data_key)

    def call_tool_to_geojson(
        self,
        name: str,
        arguments: Mapping[str, Any] | None = None,
        *,
        data_key: str | None = None,
    ) -> dict[str, Any]:
        return self.call_tool(name, arguments).to_geojson(data_key=data_key)

    def call_tool_to_geodataframe(
        self,
        name: str,
        arguments: Mapping[str, Any] | None = None,
        *,
        data_key: str | None = None,
        crs: str = "EPSG:4326",
    ):
        return self.call_tool(name, arguments).to_geodataframe(data_key=data_key, crs=crs)

    def call_many(
        self,
        name: str,
        argument_sets: Iterable[Mapping[str, Any]],
        *,
        parallel: bool = False,
        max_workers: int | None = None,
    ) -> list[LuminusResult]:
        jobs = [dict(arguments) for arguments in argument_sets]
        if not parallel or len(jobs) <= 1:
            return [self.call_tool(name, arguments) for arguments in jobs]

        worker_count = max_workers or min(4, len(jobs))

        def _run(arguments: Mapping[str, Any]) -> LuminusResult:
            child = self._spawn_child_client()
            try:
                return child.call_tool(name, arguments)
            finally:
                child.close()

        with ThreadPoolExecutor(max_workers=worker_count) as executor:
            return list(executor.map(_run, jobs))

    def call_many_to_pandas(
        self,
        name: str,
        argument_sets: Iterable[Mapping[str, Any]],
        *,
        data_key: str | None = None,
        include_request_args: bool = True,
        request_prefix: str = "request_",
        parallel: bool = False,
        max_workers: int | None = None,
    ):
        try:
            import pandas as pd
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "pandas is not installed. Install luminus-py[notebook] or add pandas manually."
            ) from exc

        frames = []
        jobs = [dict(arguments) for arguments in argument_sets]
        results = self.call_many(name, jobs, parallel=parallel, max_workers=max_workers)
        for args, result in zip(jobs, results, strict=False):
            frame = result.to_pandas(data_key=data_key)
            if include_request_args:
                for key, value in args.items():
                    frame[f"{request_prefix}{key}"] = value
            frames.append(frame)

        if not frames:
            return pd.DataFrame()
        return pd.concat(frames, ignore_index=True)

    def get_day_ahead_prices_many(
        self,
        zones: Iterable[str],
        *,
        parallel: bool = False,
        max_workers: int | None = None,
        **arguments: Any,
    ):
        return self.call_many_to_pandas(
            "get_day_ahead_prices",
            [{**arguments, "zone": zone} for zone in zones],
            request_prefix="request_",
            parallel=parallel,
            max_workers=max_workers,
        )

    def get_generation_mix_many(
        self,
        zones: Iterable[str],
        *,
        parallel: bool = False,
        max_workers: int | None = None,
        **arguments: Any,
    ):
        return self.call_many_to_pandas(
            "get_generation_mix",
            [{**arguments, "zone": zone} for zone in zones],
            data_key="generation",
            request_prefix="request_",
            parallel=parallel,
            max_workers=max_workers,
        )

    def compare_sites_rankings(self, **arguments: Any):
        return self.call_tool_to_pandas("compare_sites", arguments, data_key="rankings")

    def compare_sites_rankings_geojson(self, **arguments: Any) -> dict[str, Any]:
        return self.call_tool_to_geojson("compare_sites", arguments, data_key="rankings")

    def compare_sites_rankings_geodataframe(self, **arguments: Any):
        return self.call_tool_to_geodataframe("compare_sites", arguments, data_key="rankings")

    def __getattr__(self, name: str):
        if name.startswith("_"):
            raise AttributeError(name)

        try:
            tool = self.describe_tool(name)
        except (KeyError, LuminusError) as exc:
            raise AttributeError(name) from exc

        def _dynamic_tool(**arguments: Any) -> LuminusResult:
            return self.call_tool(name, arguments)

        _dynamic_tool.__name__ = name
        _dynamic_tool.__qualname__ = f"{self.__class__.__name__}.{name}"
        _dynamic_tool.__doc__ = tool.get("description") or f"Call the {name} MCP tool."
        return _dynamic_tool

    def __dir__(self) -> list[str]:
        names = set(super().__dir__())
        try:
            names.update(self.tool_specs().keys())
        except LuminusError:
            pass
        return sorted(names)

    def _spawn_child_client(self) -> "Luminus":
        return Luminus(
            command=list(self._spawn_command),
            profile=self.profile,
            cwd=self.cwd,
            env=self._user_env,
            request_timeout=self.request_timeout,
            startup_timeout=self._startup_timeout,
        )

    def _resolve_command(self, command: Sequence[str] | str | None, profile: str) -> list[str]:
        if command is None:
            executable = shutil.which("luminus-mcp")
            if executable is None:
                raise LuminusStartupError(
                    "luminus-mcp was not found on PATH. Install it first or pass command=[...]."
                )
            return [executable, "--profile", profile]

        parts = [command] if isinstance(command, str) else list(command)
        if "--profile" not in parts:
            parts.extend(["--profile", profile])
        return [str(part) for part in parts]

    def _send(self, message: Mapping[str, Any]) -> None:
        if self._process.poll() is not None:
            raise LuminusTransportError(self._crash_message("luminus-mcp exited before the request completed."))
        assert self._process.stdin is not None
        self._process.stdin.write(json.dumps(message) + "\n")
        self._process.stdin.flush()

    def _request(self, method: str, params: Mapping[str, Any], timeout: float | None = None) -> dict[str, Any]:
        with self._lock:
            request_id = next(self._request_ids)
            self._send({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params})
            return self._wait_for_response(request_id, timeout or self.request_timeout)

    def _wait_for_response(self, request_id: int, timeout: float) -> dict[str, Any]:
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise LuminusTransportError(
                    self._crash_message(f"Timed out waiting for response to request {request_id}.")
                )

            if self._process.poll() is not None and self._stdout_queue.empty():
                raise LuminusTransportError(self._crash_message("luminus-mcp exited unexpectedly."))

            try:
                line = self._stdout_queue.get(timeout=remaining)
            except queue.Empty as exc:
                raise LuminusTransportError(
                    self._crash_message(f"Timed out waiting for response to request {request_id}.")
                ) from exc

            if not line:
                continue
            if not line.startswith("{"):
                self._noise_lines.append(line)
                continue

            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                self._noise_lines.append(line)
                continue

            if "id" not in message:
                continue
            if message.get("id") != request_id:
                continue
            if "error" in message:
                error = message["error"]
                raise LuminusProtocolError(f"{error.get('message', 'Unknown MCP error')} (code={error.get('code')})")
            return message.get("result", {})

    def _parse_tool_result(self, result: Mapping[str, Any]) -> Any:
        content = result.get("content", [])
        if len(content) == 1 and isinstance(content[0], dict) and content[0].get("type") == "text":
            text = content[0].get("text", "")
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return text
        return dict(result)

    def _raise_tool_error(self, tool_name: str, payload: Any) -> None:
        message = payload if isinstance(payload, str) else json.dumps(payload)
        lower = message.lower()
        if "configuration error" in lower or "api key" in lower:
            raise LuminusConfigurationError(f"{tool_name} failed: {message}")
        if "upstream" in lower or "timed out" in lower or "no data" in lower:
            raise LuminusUpstreamError(f"{tool_name} failed: {message}")
        raise LuminusToolError(f"{tool_name} failed: {message}")

    def _crash_message(self, prefix: str) -> str:
        stderr_lines: list[str] = []
        while not self._stderr_queue.empty():
            line = self._stderr_queue.get_nowait()
            if line:
                stderr_lines.append(line)

        details = stderr_lines[-5:] or self._noise_lines[-5:]
        if not details:
            return prefix
        return prefix + " Last output: " + " | ".join(details)
