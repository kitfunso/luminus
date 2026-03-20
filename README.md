# GridPulse

Real-time European & UK electricity grid data via MCP (Model Context Protocol).

Give any AI agent instant access to power generation, prices, cross-border flows, and grid status across 30+ European countries.

## What is this?

GridPulse wraps the ENTSO-E Transparency Platform and Elexon BMRS APIs into a clean MCP server. Instead of fighting with SOAP/XML APIs and country codes, just ask:

- "What's the current generation mix in Germany?"
- "Show me day-ahead prices across all EU bidding zones"
- "Which interconnectors are at capacity right now?"

## Data Sources

| Source | Coverage | Data |
|--------|----------|------|
| ENTSO-E Transparency | 30+ EU countries | Generation, prices, flows, capacity, outages |
| Elexon BMRS | UK | Balancing, settlement, generation by fuel |
| National Grid ESO | UK | Demand forecasts, carbon intensity, wind/solar |

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_generation_mix` | Real-time generation by fuel type for any country |
| `get_day_ahead_prices` | Spot prices across bidding zones |
| `get_cross_border_flows` | Interconnector flows between countries |
| `get_installed_capacity` | Capacity by technology and country |
| `get_outages` | Planned and unplanned outages |
| `get_carbon_intensity` | Real-time carbon intensity by zone |
| `get_demand_forecast` | Load forecasts |
| `get_wind_solar_forecast` | Renewable generation forecasts |

## Quick Start

```bash
npm install
cp .env.example .env
# Add your ENTSO-E API key (free: https://transparency.entsoe.eu/)
```

### With Claude Code
```bash
# Add to your MCP config
claude mcp add gridpulse node src/index.js
```

### With OpenClaw
```bash
# Add as an MCP server in openclaw.json
```

## API Key

Get a free ENTSO-E API key:
1. Register at https://transparency.entsoe.eu/
2. Email transparency@entsoe.eu requesting API access
3. Key arrives within 1-2 business days

## Roadmap

- [ ] Phase 1: MCP server with core ENTSO-E tools
- [ ] Phase 2: Interactive deck.gl map frontend
- [ ] Phase 3: Real-time alerts and anomaly detection
- [ ] Phase 4: Historical analysis and backtesting tools

## Licence

MIT
