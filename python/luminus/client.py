from __future__ import annotations

import json
import os
import queue
import shutil
import subprocess
import threading
import time
from itertools import count
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from .exceptions import LuminusError, LuminusProtocolError, LuminusTransportError
from .result import LuminusResult

DEFAULT_PROTOCOL_VERSION = "2025-03-26"
DEFAULT_CLIENT_NAME = "luminus-py"
DEFAULT_CLIENT_VERSION = "0.2.0"


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
        merged_env = os.environ.copy()
        merged_env.setdefault("DOTENV_CONFIG_QUIET", "true")
        if env:
            merged_env.update({key: str(value) for key, value in env.items()})

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
            raise LuminusTransportError(
                "Could not start luminus-mcp. Install it on PATH or pass an explicit command=[...]."
            ) from exc

        if self._process.stdin is None or self._process.stdout is None or self._process.stderr is None:
            raise LuminusTransportError("Failed to open stdio pipes to luminus-mcp.")

        self._stdout_pump = _PipePump(self._process.stdout, self._stdout_queue)
        self._stderr_pump = _PipePump(self._process.stderr, self._stderr_queue)
        self._stdout_pump.start()
        self._stderr_pump.start()

        init_result = self._request(
            "initialize",
            {
                "protocolVersion": DEFAULT_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": DEFAULT_CLIENT_NAME, "version": DEFAULT_CLIENT_VERSION},
            },
            timeout=startup_timeout,
        )
        self.protocol_version = init_result.get("protocolVersion", DEFAULT_PROTOCOL_VERSION)
        self.server_info = init_result.get("serverInfo", {})
        self._send({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

    def __enter__(self) -> "Luminus":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True

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
        return LuminusResult(tool_name=name, raw=parsed, raw_response=result)

    def get_day_ahead_prices(self, **arguments: Any) -> LuminusResult:
        return self.call_tool("get_day_ahead_prices", arguments)

    def get_generation_mix(self, **arguments: Any) -> LuminusResult:
        return self.call_tool("get_generation_mix", arguments)

    def screen_site(self, **arguments: Any) -> LuminusResult:
        return self.call_tool("screen_site", arguments)

    def get_server_status(self) -> LuminusResult:
        return self.call_tool("get_server_status", {})

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
    ) -> list[LuminusResult]:
        return [self.call_tool(name, arguments) for arguments in argument_sets]

    def call_many_to_pandas(
        self,
        name: str,
        argument_sets: Iterable[Mapping[str, Any]],
        *,
        data_key: str | None = None,
        include_request_args: bool = True,
        request_prefix: str = "request_",
    ):
        try:
            import pandas as pd
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "pandas is not installed. Install luminus-py[notebook] or add pandas manually."
            ) from exc

        frames = []
        for arguments in argument_sets:
            args = dict(arguments)
            result = self.call_tool(name, args)
            frame = result.to_pandas(data_key=data_key)
            if include_request_args:
                for key, value in args.items():
                    frame[f"{request_prefix}{key}"] = value
            frames.append(frame)

        if not frames:
            return pd.DataFrame()
        return pd.concat(frames, ignore_index=True)

    def get_day_ahead_prices_many(self, zones: Iterable[str], **arguments: Any):
        return self.call_many_to_pandas(
            "get_day_ahead_prices",
            [{**arguments, "zone": zone} for zone in zones],
            request_prefix="request_",
        )

    def get_generation_mix_many(self, zones: Iterable[str], **arguments: Any):
        return self.call_many_to_pandas(
            "get_generation_mix",
            [{**arguments, "zone": zone} for zone in zones],
            data_key="generation",
            request_prefix="request_",
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

    def _resolve_command(self, command: Sequence[str] | str | None, profile: str) -> list[str]:
        if command is None:
            executable = shutil.which("luminus-mcp")
            if executable is None:
                raise LuminusError(
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
