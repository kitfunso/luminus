import json
import sys

TOOLS = [
    {"name": "get_day_ahead_prices", "description": "fake day-ahead prices", "inputSchema": {}},
    {"name": "get_generation_mix", "description": "fake generation mix", "inputSchema": {}},
    {"name": "get_cross_border_flows", "description": "fake flows", "inputSchema": {}},
    {"name": "get_outages", "description": "fake outages", "inputSchema": {}},
    {"name": "get_grid_proximity", "description": "fake grid proximity", "inputSchema": {}},
    {"name": "get_grid_connection_queue", "description": "fake grid connection queue", "inputSchema": {}},
    {"name": "get_distribution_headroom", "description": "fake distribution headroom", "inputSchema": {}},
    {
        "name": "get_grid_connection_intelligence",
        "description": "fake grid connection intelligence",
        "inputSchema": {},
    },
    {"name": "estimate_site_revenue", "description": "fake site revenue", "inputSchema": {}},
    {"name": "compare_sites", "description": "fake site comparison", "inputSchema": {}},
    {"name": "screen_site", "description": "fake site screen", "inputSchema": {}},
    {"name": "get_server_status", "description": "fake server status", "inputSchema": {}},
    {"name": "get_embedded_capacity_register", "description": "fake ECR", "inputSchema": {}},
    {"name": "get_flexibility_market", "description": "fake flex market", "inputSchema": {}},
    {"name": "get_constraint_breaches", "description": "fake constraint breaches", "inputSchema": {}},
    {"name": "get_spen_grid_intelligence", "description": "fake SPEN grid", "inputSchema": {}},
    {"name": "get_ukpn_grid_overview", "description": "fake UKPN grid", "inputSchema": {}},
    {"name": "get_balancing_prices", "description": "fake balancing prices", "inputSchema": {}},
    {"name": "get_intraday_prices", "description": "fake intraday prices", "inputSchema": {}},
    {"name": "get_imbalance_prices", "description": "fake imbalance prices", "inputSchema": {}},
    {"name": "get_price_spread_analysis", "description": "fake spread analysis", "inputSchema": {}},
    {"name": "get_ancillary_prices", "description": "fake ancillary prices", "inputSchema": {}},
    {"name": "get_nged_connection_signal", "description": "fake NGED signal", "inputSchema": {}},
    {"name": "get_terrain_analysis", "description": "fake terrain", "inputSchema": {}},
    {"name": "get_land_constraints", "description": "fake land constraints", "inputSchema": {}},
    {"name": "shortlist_bess_sites", "description": "fake BESS shortlist", "inputSchema": {}},
    {"name": "verify_gis_sources", "description": "fake GIS sources", "inputSchema": {}},
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
        elif name == "get_distribution_headroom":
            payload = {
                "lat": args.get("lat", 50.84),
                "lon": args.get("lon", -1.08),
                "operator": args.get("operator", "SSEN"),
                "radius_km": args.get("radius_km", 25),
                "nearest_site": {
                    "asset_id": "SSEN-001",
                    "licence_area": "Southern",
                    "substation": "Portsmouth",
                    "substation_type": "Primary",
                    "voltage_kv": "33",
                    "upstream_gsp": "Lovedean",
                    "upstream_bsp": "Portsmouth BSP",
                    "distance_km": 2.1,
                    "estimated_demand_headroom_mva": 9.0,
                    "demand_rag_status": "Amber",
                    "demand_constraint": "Local demand constraint",
                    "connected_generation_mw": 24.0,
                    "contracted_generation_mw": 31.0,
                    "estimated_generation_headroom_mw": 18.5,
                    "generation_rag_status": "Green",
                    "generation_constraint": None,
                    "upstream_reinforcement_works": "Lovedean upgrade",
                    "upstream_reinforcement_completion_date": "2028-03-31",
                    "substation_reinforcement_works": None,
                    "substation_reinforcement_completion_date": None,
                },
                "matches": [
                    {
                        "asset_id": "SSEN-001",
                        "licence_area": "Southern",
                        "substation": "Portsmouth",
                        "substation_type": "Primary",
                        "voltage_kv": "33",
                        "upstream_gsp": "Lovedean",
                        "upstream_bsp": "Portsmouth BSP",
                        "distance_km": 2.1,
                        "estimated_demand_headroom_mva": 9.0,
                        "demand_rag_status": "Amber",
                        "demand_constraint": "Local demand constraint",
                        "connected_generation_mw": 24.0,
                        "contracted_generation_mw": 31.0,
                        "estimated_generation_headroom_mw": 18.5,
                        "generation_rag_status": "Green",
                        "generation_constraint": None,
                        "upstream_reinforcement_works": "Lovedean upgrade",
                        "upstream_reinforcement_completion_date": "2028-03-31",
                        "substation_reinforcement_works": None,
                        "substation_reinforcement_completion_date": None,
                    },
                    {
                        "asset_id": "SSEN-002",
                        "licence_area": "Southern",
                        "substation": "Havant",
                        "substation_type": "Primary",
                        "voltage_kv": "33",
                        "upstream_gsp": "Lovedean",
                        "upstream_bsp": "Havant BSP",
                        "distance_km": 7.4,
                        "estimated_demand_headroom_mva": 4.0,
                        "demand_rag_status": "Red",
                        "demand_constraint": "Demand-led reinforcement needed",
                        "connected_generation_mw": 15.0,
                        "contracted_generation_mw": 19.0,
                        "estimated_generation_headroom_mw": 3.5,
                        "generation_rag_status": "Amber",
                        "generation_constraint": "Generation export constrained",
                        "upstream_reinforcement_works": "BSP transformer replacement",
                        "upstream_reinforcement_completion_date": "2029-09-30",
                        "substation_reinforcement_works": "Feeder uprate",
                        "substation_reinforcement_completion_date": "2028-12-31",
                    },
                ],
                "confidence_notes": [
                    "Uses SSEN public headroom dashboard data only",
                    "Headroom values are planning signals only",
                ],
                "source_metadata": {"source": "fake-ssen"},
                "disclaimer": "Distribution signal only.",
            }
        elif name == "get_grid_connection_intelligence":
            payload = {
                "lat": args.get("lat", 50.84),
                "lon": args.get("lon", -1.08),
                "country": args.get("country", "GB"),
                "nearest_gsp": {
                    "gsp_id": "GSP-01",
                    "gsp_name": "LOVE_1",
                    "distance_km": 6.3,
                    "region_id": "R-01",
                    "region_name": "Lovedean",
                },
                "connection_queue": {
                    "search_term": "Lovedean",
                    "total_mw_queued": 320.0,
                    "projects": [
                        {
                            "project_name": "Battery South",
                            "connection_site": "Lovedean GSP",
                            "mw_connected": 150.0,
                        }
                    ],
                },
                "nearby_substations": [
                    {"name": "Lovedean 132kV", "voltage_kv": 132, "distance_km": 1.1},
                    {"name": "Farlington", "voltage_kv": 33, "distance_km": 3.9},
                ],
                "distribution_headroom": {
                    "operator": "SSEN",
                    "substation": "Portsmouth",
                    "substation_type": "Primary",
                    "distance_km": 2.1,
                    "estimated_generation_headroom_mw": 18.5,
                    "estimated_demand_headroom_mva": 9.0,
                    "generation_rag_status": "Green",
                    "demand_rag_status": "Amber",
                    "generation_constraint": None,
                    "demand_constraint": "Local demand constraint",
                    "upstream_reinforcement_works": "Lovedean upgrade",
                    "upstream_reinforcement_completion_date": "2028-03-31",
                },
                "nged_connection_signal": {
                    "queue_signal": {
                        "resource_name": "Lovedean",
                        "summary": {
                            "matched_projects": 2,
                            "returned_projects": 2,
                            "total_site_export_capacity_mw": 41.8,
                            "total_site_import_capacity_mw": 2.5,
                            "status_breakdown": {
                                "Accepted": 1,
                                "Recently Connected": 1,
                            },
                            "fuel_type_breakdown": {
                                "Battery": 1,
                                "Solar": 1,
                            },
                        },
                        "projects": [
                            {
                                "licence_area": "South West",
                                "gsp": "LOVEDEAN 132kV",
                                "tanm": True,
                                "danm": False,
                                "status": "Accepted",
                                "bus_number": 11023,
                                "bus_name": "LOVE_MAIN1",
                                "site_id": 101,
                                "application_id": 7,
                                "site_export_capacity_mw": 20.0,
                                "site_import_capacity_mw": 1.5,
                                "machine_export_capacity_mw": 20.0,
                                "machine_import_capacity_mw": 1.0,
                                "fuel_type": "Battery",
                                "machine_id": "BAT-1",
                                "position": 3,
                            }
                        ],
                    },
                    "td_limits": {
                        "resource_name": "Lovedean Td Limits",
                        "summary": {
                            "matched_rows": 2,
                            "seasons": ["Summer", "Winter"],
                            "min_import_tl_mw": -302.6,
                            "max_export_tl_mw": 63.9,
                        },
                        "rows": [
                            {
                                "gsp_name": "Lovedean",
                                "from_bus_number": 419700,
                                "to_bus_number": 320538,
                                "tertiary_bus_number": 32170,
                                "from_bus_name": "LOVE2_H10",
                                "to_bus_name": "LOVE1_SGT1",
                                "tertiary_bus_name": "LOVE8G1",
                                "circuit_id": "S1",
                                "season": "Winter",
                                "import_tl_mw": -302.6,
                                "export_tl_mw": 63.9,
                                "import_cafpl_mva": None,
                                "export_carpl_mva": 240.0,
                            }
                        ],
                    },
                },
                "confidence_notes": [
                    "GSP lookup uses polygon containment when available",
                    "Distribution headroom uses SSEN public data only",
                ],
                "source_metadata": {
                    "gsp_lookup": {"source": "fake-neso-gsp"},
                    "tec_register": {"source": "fake-neso-tec"},
                    "grid_proximity": {"source": "fake-overpass"},
                    "distribution_headroom": {"source": "fake-ssen"},
                    "nged_queue_signal": {"source": "fake-nged-queue"},
                    "nged_td_limits": {"source": "fake-nged-limits"},
                },
                "disclaimer": "Planning signal only.",
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
        elif name == "get_embedded_capacity_register":
            payload = {
                "total_matched": 3,
                "total_export_mw": 45.5,
                "total_import_mw": 12.0,
                "total_storage_mwh": 80.0,
                "energy_source_breakdown": {"Solar": 2, "Battery": 1},
                "status_breakdown": {"Accepted": 2, "Connected": 1},
                "entries": [
                    {
                        "site_name": "Solar Farm Alpha",
                        "operator": args.get("operator", "UKPN"),
                        "export_mw": 20.0,
                        "import_mw": 5.0,
                        "storage_mwh": 0.0,
                        "energy_source": "Solar",
                        "status": "Accepted",
                    },
                    {
                        "site_name": "Battery Beta",
                        "operator": args.get("operator", "UKPN"),
                        "export_mw": 15.5,
                        "import_mw": 7.0,
                        "storage_mwh": 80.0,
                        "energy_source": "Battery",
                        "status": "Connected",
                    },
                    {
                        "site_name": "Solar Gamma",
                        "operator": args.get("operator", "UKPN"),
                        "export_mw": 10.0,
                        "import_mw": 0.0,
                        "storage_mwh": 0.0,
                        "energy_source": "Solar",
                        "status": "Accepted",
                    },
                ],
            }
        elif name == "get_flexibility_market":
            payload = {
                "total_dispatches": 2,
                "total_mwh": 18.5,
                "avg_utilisation_price": 125.0,
                "zone_breakdown": {"East": 1, "South": 1},
                "dispatches": [
                    {
                        "dispatch_id": "D001",
                        "zone": "East",
                        "mwh": 10.0,
                        "utilisation_price": 130.0,
                        "date": "2026-03-20",
                    },
                    {
                        "dispatch_id": "D002",
                        "zone": "South",
                        "mwh": 8.5,
                        "utilisation_price": 120.0,
                        "date": "2026-03-21",
                    },
                ],
            }
        elif name == "get_constraint_breaches":
            payload = {
                "total_breaches": 2,
                "total_curtailment_kwh": 5500.0,
                "total_curtailment_hours": 14.0,
                "scheme_breakdown": {"ANM": 1, "Intertrip": 1},
                "breaches": [
                    {
                        "breach_id": "B001",
                        "scheme": "ANM",
                        "curtailment_kwh": 3000.0,
                        "curtailment_hours": 8.0,
                        "date": "2026-02-15",
                    },
                    {
                        "breach_id": "B002",
                        "scheme": "Intertrip",
                        "curtailment_kwh": 2500.0,
                        "curtailment_hours": 6.0,
                        "date": "2026-02-20",
                    },
                ],
            }
        elif name == "get_spen_grid_intelligence":
            payload = {
                "queue": {
                    "total_projects": 2,
                    "total_mw": 85.0,
                    "projects": [
                        {"name": "Wind North", "mw": 50.0, "status": "Accepted"},
                        {"name": "Solar South", "mw": 35.0, "status": "Scoping"},
                    ],
                },
                "dg_capacity": {
                    "total_substations": 2,
                    "entries": [
                        {"substation": "SPEN Sub A", "headroom_mw": 12.0},
                        {"substation": "SPEN Sub B", "headroom_mw": 8.5},
                    ],
                },
                "curtailment": {
                    "total_events": 2,
                    "total_curtailed_mwh": 320.0,
                    "events": [
                        {"event_id": "C01", "curtailed_mwh": 200.0, "date": "2026-01-10"},
                        {"event_id": "C02", "curtailed_mwh": 120.0, "date": "2026-01-15"},
                    ],
                },
            }
        elif name == "get_ukpn_grid_overview":
            payload = {
                "gsps": [
                    {"gsp_name": "Sellindge", "region": "South East", "capacity_mw": 400.0},
                    {"gsp_name": "Bolney", "region": "South East", "capacity_mw": 350.0},
                ],
                "flex_zones": [
                    {"zone_name": "Kent Flex", "status": "Active", "enrolled_mw": 22.0},
                ],
                "live_faults": [
                    {"fault_id": "F001", "area": "Bromley", "status": "In Progress"},
                ],
            }
        elif name == "get_balancing_prices":
            payload = {
                "zone": args.get("zone", "GB"),
                "prices": [
                    {"settlement_period": 1, "price_gbp_mwh": 55.0},
                    {"settlement_period": 2, "price_gbp_mwh": 62.0},
                ],
            }
        elif name == "get_intraday_prices":
            payload = {
                "zone": args.get("zone", "GB"),
                "prices": [
                    {"hour": 0, "price_eur_mwh": 48.0},
                    {"hour": 1, "price_eur_mwh": 51.0},
                ],
            }
        elif name == "get_imbalance_prices":
            payload = {
                "zone": args.get("zone", "GB"),
                "prices": [
                    {"settlement_period": 1, "buy_price": 70.0, "sell_price": 45.0},
                    {"settlement_period": 2, "buy_price": 75.0, "sell_price": 50.0},
                ],
            }
        elif name == "get_price_spread_analysis":
            payload = {
                "zone": args.get("zone", "GB"),
                "peak_mean": 120.0,
                "off_peak_mean": 42.0,
                "spread": 78.0,
                "periods_analysed": 48,
            }
        elif name == "get_ancillary_prices":
            payload = {
                "zone": args.get("zone", "GB"),
                "prices": [
                    {"service": "DCL", "price_gbp_mw_h": 8.5, "date": "2026-04-02"},
                    {"service": "DCH", "price_gbp_mw_h": 12.0, "date": "2026-04-02"},
                ],
            }
        elif name == "get_nged_connection_signal":
            payload = {
                "resource_name": "Test GSP",
                "summary": {
                    "matched_projects": 2,
                    "total_export_mw": 30.0,
                },
                "queue": [
                    {"project_name": "NGED Proj A", "status": "Accepted", "export_mw": 20.0},
                    {"project_name": "NGED Proj B", "status": "Scoping", "export_mw": 10.0},
                ],
            }
        elif name == "get_terrain_analysis":
            payload = {
                "lat": args.get("lat", 51.5),
                "lon": args.get("lon", -0.1),
                "elevation_m": 85.0,
                "slope_deg": 3.2,
                "aspect_cardinal": "SW",
                "land_cover": "Grassland",
                "flood_risk": "Low",
            }
        elif name == "get_land_constraints":
            payload = {
                "lat": args.get("lat", 51.5),
                "lon": args.get("lon", -0.1),
                "constraints": [
                    {"type": "SSSI", "name": "Epping Forest", "distance_km": 1.2, "severity": "High"},
                    {"type": "Flood Zone 3", "name": "Thames Flood Plain", "distance_km": 0.3, "severity": "Medium"},
                ],
            }
        elif name == "shortlist_bess_sites":
            payload = {
                "total_candidates": 10,
                "total_shortlisted": 2,
                "shortlist": [
                    {"site_name": "Grid Park Alpha", "score": 0.92, "lat": 51.5, "lon": -0.1, "headroom_mw": 20.0},
                    {"site_name": "Industrial Zone B", "score": 0.85, "lat": 51.6, "lon": -0.2, "headroom_mw": 15.0},
                ],
            }
        elif name == "verify_gis_sources":
            payload = {
                "sources": [
                    {"source_name": "OS Open Data", "status": "OK", "last_updated": "2026-03-30"},
                    {"source_name": "LIDAR DTM", "status": "OK", "last_updated": "2026-03-28"},
                    {"source_name": "EA Flood Map", "status": "Degraded", "last_updated": "2026-03-15"},
                ],
            }
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
