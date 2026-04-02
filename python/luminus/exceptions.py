class LuminusError(Exception):
    """Base exception for luminus-py."""


class LuminusTransportError(LuminusError):
    """Process, pipe, or timeout failure while talking to luminus-mcp."""


class LuminusStartupError(LuminusTransportError):
    """The luminus-mcp subprocess could not be started or initialized."""


class LuminusProtocolError(LuminusError):
    """The server returned an MCP/JSON-RPC level error."""


class LuminusToolError(LuminusError):
    """The MCP server returned a tool-level error payload."""


class LuminusConfigurationError(LuminusToolError):
    """The requested tool failed because required configuration is missing."""


class LuminusUpstreamError(LuminusToolError):
    """The requested tool failed because an upstream source errored or timed out."""
