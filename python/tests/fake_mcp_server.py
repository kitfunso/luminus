import json
import sys

TOOLS = [
    {"name": "get_day_ahead_prices", "description": "fake day-ahead prices", "inputSchema": {}},
    {"name": "get_generation_mix", "description": "fake generation mix", "inputSchema": {}},
    {"name": "get_cross_border_flows", "description": "fake flows", "inputSchema": {}},
    {"name": "get_outages", "description": "fake outages", "inputSchema": {}},
    {"name": "get_grid_proximity", "description": "fake grid proximity", "inputSchema": {}},
    {"name": "get_grid_connection_queue", "description": "fake grid connection queue", "inputSchema": {}},
    {"name": "estimate_site_revenue", "description": "fake site revenue", "inputSchema": {}},
    {"name": "compare_sites", "description": "fake site comparison", "inputSchema": {}},
    {"name": "screen_site", "description": "fake site screen", "inputSchema": {}},
    {"name": "get_server_status", "description": "fake server status", "inputSchema": {}},
]


def send(message):
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


def send_tool_result(message_id, payload, *, is_error=False):
    send(
        {
            "jsonrpc": "2.0",
            "id": message_id,
            "result": {"content": [{"type": "text", "text": json.dumps(payload)}], "isError": is_error},
        }
    )


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
            if args.get("from_zone") == "KEYERR":
                send_tool_result(
                    message["id"],
                    "Configuration error. Add the required API key to your MCP env or .env file, then retry.",
                    is_error=True,
                )
                continue
            payload = {
                "from_zone": args.get("from_zone", "DE"),
                "to_zone": args.get("to_zone", "NL"),
                "date": args.get("date", "2026-04-02"),
                "flows": [
                    {"hour": 0, "mw": 1200},
                    {"hour": 1, "mw": 1150},
                ],
                "stats": {"min": 1150, "max": 1200, "mean": 1175, "net_mwh": 2350},
            }
        elif name == "get_outages":
            if args.get("zone") == "UPSTREAM_FAIL":
                send_tool_result(
                    message["id"],
                    "Upstream source returned an error. The request was valid, but the data provider rejected or failed it.",
                    is_error=True,
                )
                continue
            payload = {
                "zone": args.get("zone", "DE"),
                "type": args.get("type", "generation"),
                "outages": [
                    {
                        "unit_name": "Plant A",
                        "fuel_type": "Gas",
                        "available_mw": 500,
                        "unavailable_mw": 200,
                        "nominal_mw": 700,
                        "start_date": "2026-04-02",
                        "end_date": "2026-04-05",
                        "reason": "Maintenance",
                        "outage_type": "planned",
                    },
                    {
                        "unit_name": "Plant B",
                        "fuel_type": "Nuclear",
                        "available_mw": 900,
                        "unavailable_mw": 300,
                        "nominal_mw": 1200,
                        "start_date": "2026-04-03",
                        "end_date": "2026-04-07",
                        "reason": "Inspection",
                        "outage_type": "forced",
                    },
                ],
                "total_unavailable_mw": 500,
                "count": 2,
            }
        elif name == "get_grid_proximity":
            payload = {
                "lat": args.get("lat", 52.0),
                "lon": args.get("lon", 0.1),
                "radius_km": args.get("radius_km", 5),
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
                "lines": [
                    {
                        "voltage_kv": 275,
                        "operator": "NGET",
                        "distance_km": 0.8,
                        "cables": 2,
                    }
                ],
                "summary": {
                    "nearest_substation_km": 1.2,
                    "nearest_line_km": 0.8,
                    "max_nearby_voltage_kv": 275,
                },
                "source_metadata": {"source": "fake-overpass"},
            }
        elif name == "get_grid_connection_queue":
            payload = {
                "filters": {
                    "connection_site_query": args.get("connection_site_query", "berks"),
                    "project_name_query": None,
                    "host_to": None,
                    "plant_type": args.get("plant_type"),
                    "project_status": None,
                    "agreement_type": None,
                },
                "summary": {
                    "matched_projects": 2,
                    "returned_projects": 2,
                    "total_connected_mw": 300.0,
                    "total_net_change_mw": 180.0,
                    "total_cumulative_capacity_mw": 480.0,
                    "earliest_effective_from": "2027-01-01",
                    "latest_effective_from": "2028-06-01",
                },
                "connection_sites": [
                    {
                        "connection_site": "Berkswell",
                        "project_count": 2,
                        "total_net_change_mw": 180.0,
                        "total_connected_mw": 300.0,
                        "total_cumulative_capacity_mw": 480.0,
                        "plant_types": ["Energy Storage System", "Solar"],
                        "project_statuses": ["Awaiting Consents", "Scoping"],
                        "earliest_effective_from": "2027-01-01",
                    }
                ],
                "projects": [
                    {
                        "project_name": "Battery One",
                        "customer_name": "GridCo",
                        "connection_site": "Berkswell",
                        "stage": 1,
                        "mw_connected": 100.0,
                        "mw_increase_decrease": 100.0,
                        "cumulative_total_capacity_mw": 100.0,
                        "mw_effective_from": "2027-01-01",
                        "project_status": "Scoping",
                        "agreement_type": "Embedded",
                        "host_to": "NGET",
                        "plant_type": "Energy Storage System",
                        "project_id": "P1",
                        "project_number": "001",
                        "gate": 2,
                    },
                    {
                        "project_name": "Solar Two",
                        "customer_name": "SolarCo",
                        "connection_site": "Berkswell",
                        "stage": 2,
                        "mw_connected": 200.0,
                        "mw_increase_decrease": 80.0,
                        "cumulative_total_capacity_mw": 380.0,
                        "mw_effective_from": "2028-06-01",
                        "project_status": "Awaiting Consents",
                        "agreement_type": "Directly Connected",
                        "host_to": "NGET",
                        "plant_type": "Solar",
                        "project_id": "P2",
                        "project_number": "002",
                        "gate": 1,
                    },
                ],
                "source_metadata": {"source": "fake-neso"},
                "disclaimer": "Transmission signal only.",
            }
        elif name == "estimate_site_revenue":
            payload = {
                "lat": args.get("lat", 52.0),
                "lon": args.get("lon", 0.1),
                "zone": args.get("zone", "GB"),
                "technology": args.get("technology", "bess"),
                "capacity_mw": args.get("capacity_mw", 10),
                "terrain": {
                    "elevation_m": 110,
                    "slope_deg": 2.4,
                    "aspect_cardinal": "S",
                },
                "revenue": {
                    "daily_spread_eur_mwh": 72.5,
                    "daily_revenue_eur": 1450.0,
                    "arb_signal": "charge 02:00-05:00, discharge 17:00-20:00",
                    "estimated_annual_revenue_eur": 529250.0,
                },
                "price_snapshot": {
                    "date": args.get("date", "2026-04-02"),
                    "peak_eur_mwh": 130.0,
                    "off_peak_eur_mwh": 35.0,
                    "mean_eur_mwh": 82.5,
                },
                "caveats": ["Single-day estimate only"],
                "disclaimer": "Screening estimate only.",
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

        send_tool_result(message["id"], payload)
