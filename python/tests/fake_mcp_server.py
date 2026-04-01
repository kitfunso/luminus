import json
import sys

TOOLS = [
    {"name": "get_day_ahead_prices", "description": "fake day-ahead prices", "inputSchema": {}},
    {"name": "get_generation_mix", "description": "fake generation mix", "inputSchema": {}},
    {"name": "get_cross_border_flows", "description": "fake flows", "inputSchema": {}},
    {"name": "compare_sites", "description": "fake site comparison", "inputSchema": {}},
    {"name": "screen_site", "description": "fake site screen", "inputSchema": {}},
    {"name": "get_server_status", "description": "fake server status", "inputSchema": {}},
]


def send(message):
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue

    message = json.loads(line)
    method = message.get("method")

    if method == "initialize":
        send(
            {
                "jsonrpc": "2.0",
                "id": message["id"],
                "result": {
                    "protocolVersion": message["params"]["protocolVersion"],
                    "capabilities": {"tools": {"listChanged": True}},
                    "serverInfo": {"name": "fake-luminus", "version": "0.0.1"},
                },
            }
        )
    elif method == "notifications/initialized":
        continue
    elif method == "tools/list":
        send({"jsonrpc": "2.0", "id": message["id"], "result": {"tools": TOOLS}})
    elif method == "tools/call":
        name = message["params"]["name"]
        args = message["params"].get("arguments", {})

        if name == "get_day_ahead_prices":
            payload = {
                "zone": args.get("zone", "DE"),
                "prices": [
                    {"hour": 0, "price_eur_mwh": 45.1},
                    {"hour": 1, "price_eur_mwh": 47.2},
                ],
                "stats": {"min": 45.1, "max": 47.2, "mean": 46.15},
            }
        elif name == "get_generation_mix":
            payload = {
                "zone": args.get("zone", "DE"),
                "generation": [
                    {"fuel_type": "Wind Onshore", "psr_code": "B19", "mw": 1200},
                    {"fuel_type": "Solar", "psr_code": "B16", "mw": 800},
                ],
                "total_mw": 2000,
            }
        elif name == "get_cross_border_flows":
            payload = {
                "from_zone": args.get("from_zone", "DE"),
                "to_zone": args.get("to_zone", "NL"),
                "flows": [
                    {"hour": 0, "flow_mw": 1200},
                    {"hour": 1, "flow_mw": 1150},
                ],
            }
        elif name == "compare_sites":
            payload = {
                "country": args.get("country", "GB"),
                "rankings": [
                    {"label": "A", "lat": 52.10, "lon": 0.20, "rank": 1, "overall": "pass"},
                    {"label": "B", "lat": 52.20, "lon": 0.30, "rank": 2, "overall": "warn"},
                ],
                "failed_sites": [],
            }
        elif name == "screen_site":
            payload = {
                "lat": args.get("lat", 52.0),
                "lon": args.get("lon", 0.1),
                "country": args.get("country", "GB"),
                "verdict": {"overall": "pass", "flags": []},
            }
        elif name == "get_server_status":
            payload = {"activeProfile": "full", "registeredTools": len(TOOLS)}
        else:
            send(
                {
                    "jsonrpc": "2.0",
                    "id": message["id"],
                    "error": {"code": -32601, "message": f"Unknown tool: {name}"},
                }
            )
            continue

        send(
            {
                "jsonrpc": "2.0",
                "id": message["id"],
                "result": {"content": [{"type": "text", "text": json.dumps(payload)}]},
            }
        )
