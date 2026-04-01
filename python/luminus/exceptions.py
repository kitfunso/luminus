class LuminusError(Exception):
    """Base exception for luminus-py."""


class LuminusTransportError(LuminusError):
    """Process, pipe, or timeout failure while talking to luminus-mcp."""


class LuminusProtocolError(LuminusError):
    """The server returned an MCP/JSON-RPC level error."""
