# Luminus

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/luminus-mcp)](https://www.npmjs.com/package/luminus-mcp)

Real-time European & UK electricity grid data via MCP. 31 tools, all free.

## Tools

### Generation & Prices

| Tool | Source | Description |
|------|--------|-------------|
| `get_generation_mix` | ENTSO-E | Real-time generation by fuel type (wind, solar, gas, nuclear, etc.) |
| `get_day_ahead_prices` | ENTSO-E | Hourly spot prices (EUR/MWh) by bidding zone |
| `get_balancing_prices` | ENTSO-E | Imbalance/settlement prices per period |
| `get_carbon_intensity` | ENTSO-E | CO2 intensity (gCO2/kWh) from generation mix |
| `get_hydro_reservoir` | ENTSO-E | Reservoir filling levels (MWh) for hydro countries |

### Intraday & Balancing

| Tool | Source | Description |
|------|--------|-------------|
| `get_intraday_prices` | ENTSO-E | Continuous intraday market prices per bidding zone |
| `get_imbalance_prices` | ENTSO-E | Real-time settlement/imbalance prices |
| `get_intraday_da_spread` | Computed | Intraday minus day-ahead spread with directional signal |
| `get_realtime_generation` | ENTSO-E / BMRS | Actual generation by fuel type (MW), 5-15 min resolution |
| `get_balancing_actions` | ENTSO-E / BMRS | Activated balancing energy (up/down regulation volumes) |

### Forecasts

| Tool | Source | Description |
|------|--------|-------------|
| `get_renewable_forecast` | ENTSO-E | Day-ahead wind & solar generation forecast (MW) |
| `get_demand_forecast` | ENTSO-E | Day-ahead total load/demand forecast (MW) |

### Gas & LNG

| Tool | Source | Description |
|------|--------|-------------|
| `get_gas_storage` | GIE AGSI+ | European gas storage levels, fill %, injection/withdrawal |
| `get_lng_terminals` | GIE ALSI | LNG terminal inventory, send-out rates, capacity |
| `get_us_gas_data` | EIA | US gas storage (Bcf) and Henry Hub prices (USD/MMBtu) |
| `get_eu_gas_price` | Yahoo Finance | TTF/NBP gas prices in EUR/MWh for spark spread calculations |

### BESS & Ancillary

| Tool | Source | Description |
|------|--------|-------------|
| `get_ancillary_prices` | ENTSO-E | FCR/aFRR/mFRR reserve procurement prices (EUR/MW) |
| `get_remit_messages` | ENTSO-E | REMIT urgent market messages (forced outages, capacity reductions) |
| `get_price_spread_analysis` | Computed | BESS arbitrage schedule with optimal charge/discharge windows |

### Grid Infrastructure

| Tool | Source | Description |
|------|--------|-------------|
| `get_cross_border_flows` | ENTSO-E | Physical electricity flows between zones (MW) |
| `get_net_positions` | ENTSO-E | Net import/export position by zone |
| `get_transfer_capacities` | ENTSO-E | Net transfer capacity (NTC) between zones |
| `get_outages` | ENTSO-E | Generation & transmission outages with reasons |
| `get_power_plants` | Open Power System Data | Plant database: capacity, fuel, location, year |
| `get_auction_results` | JAO | Cross-border capacity auction prices & allocation |
| `get_transmission_lines` | OpenStreetMap | HV transmission line routes (220kV+) |
| `get_eu_frequency` | mainsfrequency.com | Real-time grid frequency (Hz) and deviation |

### UK Specific

| Tool | Source | Description |
|------|--------|-------------|
| `get_uk_carbon_intensity` | National Grid ESO | UK carbon intensity, index, and fuel mix |
| `get_uk_grid_demand` | National Grid ESO | UK demand (MW) and grid frequency (Hz) |

### Weather & Climate

| Tool | Source | Description |
|------|--------|-------------|
| `get_weather_forecast` | Open-Meteo | Temperature, wind speed, solar radiation by location |
| `get_solar_irradiance` | PVGIS | Monthly irradiance, optimal angle, annual PV yield |

## Quick Start

```bash
npm install luminus-mcp
```

Create a `.env` file:

```bash
ENTSOE_API_KEY=your-key-here    # Required for most tools
GIE_API_KEY=your-key-here       # Optional: gas storage & LNG
EIA_API_KEY=your-key-here       # Optional: US gas data
```

### Get API Keys

- **ENTSO-E** (free): Register at [transparency.entsoe.eu](https://transparency.entsoe.eu/), then email transparency@entsoe.eu to request API access
- **GIE** (free): Register at [agsi.gie.eu](https://agsi.gie.eu/)
- **EIA** (free): Register at [eia.gov/opendata](https://www.eia.gov/opendata/)

### Claude Code

```bash
claude mcp add luminus -- npx luminus-mcp
```

### MCP Config (Claude Desktop / OpenClaw)

```json
{
  "mcpServers": {
    "luminus": {
      "command": "npx",
      "args": ["luminus-mcp"],
      "env": {
        "ENTSOE_API_KEY": "your-key-here"
      }
    }
  }
}
```

## Example Queries

Ask your AI agent:

- "What's powering Germany's grid right now?"
- "Compare day-ahead prices across France, Spain, and Italy"
- "How full are Europe's gas storage facilities?"
- "Show me wind generation forecast for tomorrow in Denmark"
- "What's the carbon intensity in the UK right now?"
- "Are there any nuclear outages in France?"
- "What's the net transfer capacity between Norway and Germany?"

## Data Sources

| Source | Link | Coverage |
|--------|------|----------|
| ENTSO-E Transparency Platform | [transparency.entsoe.eu](https://transparency.entsoe.eu/) | 30+ European countries |
| National Grid ESO | [carbonintensity.org.uk](https://carbonintensity.org.uk/) | UK |
| GIE AGSI+ / ALSI | [agsi.gie.eu](https://agsi.gie.eu/) | European gas & LNG |
| EIA | [eia.gov](https://www.eia.gov/) | US natural gas |
| Open-Meteo | [open-meteo.com](https://open-meteo.com/) | Global weather |
| PVGIS | [re.jrc.ec.europa.eu](https://re.jrc.ec.europa.eu/pvg_tools/) | Global solar irradiance |
| Open Power System Data | [open-power-system-data.org](https://open-power-system-data.org/) | European power plants |
| JAO | [jao.eu](https://www.jao.eu/) | Cross-border auctions |
| OpenStreetMap | [openstreetmap.org](https://www.openstreetmap.org/) | Transmission lines |

## Licence

MIT. See [LICENSE](LICENSE).
