# Luminus

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/luminus-mcp)](https://www.npmjs.com/package/luminus-mcp)

Real-time European & UK electricity grid data via MCP. 48 tools, all free.

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
| `get_entsog_data` | ENTSOG | Gas pipeline flows, nominations, interruptions, and capacities |

### BESS & Ancillary

| Tool | Source | Description |
|------|--------|-------------|
| `get_ancillary_prices` | ENTSO-E | FCR/aFRR/mFRR reserve procurement prices (EUR/MW) |
| `get_remit_messages` | ENTSO-E | REMIT urgent market messages (forced outages, capacity reductions) |
| `get_price_spread_analysis` | Computed | BESS arbitrage schedule with optimal charge/discharge windows |
| `get_regelleistung` | Regelleistung.net | FCR/aFRR/mFRR tender results and procurement prices (DE + EU) |
| `get_acer_remit` | ACER REMIT | Centralized UMMs and outage events from Inside Information Platforms |

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
| `get_elexon_bmrs` | Elexon BMRS | GB imbalance prices, generation by fuel, balancing bids, system warnings |

### Commodities

| Tool | Source | Description |
|------|--------|-------------|
| `get_commodity_prices` | Yahoo Finance | EUA carbon, Brent crude, TTF gas prices with 5-day history |

### Regional Specialists

| Tool | Source | Description |
|------|--------|-------------|
| `get_energy_charts` | energy-charts.info | European electricity prices, generation, and flows (no API key) |
| `get_nordpool_prices` | Nordpool | Nordic and Baltic day-ahead prices at 15-min resolution |
| `get_smard_data` | SMARD (Bundesnetzagentur) | High-resolution German generation, consumption, and market data |
| `get_ember_data` | EMBER Climate | Yearly power sector generation, capacity, emissions, and demand |
| `get_rte_france` | RTE France (ODRE) | French generation (nuclear, wind, solar), consumption, and exchanges |
| `get_energi_data` | Energi Data Service | Danish real-time CO2, production, prices, and electricity balance |
| `get_fingrid_data` | Fingrid | Finnish grid data at 3-min resolution (generation, imports, frequency) |
| `get_terna_data` | Terna | Italian generation, demand, exchanges, and zonal market prices |
| `get_ree_esios` | REE ESIOS | Spanish prices, demand, generation mix, wind/solar forecast vs actual |

### Hydropower

| Tool | Source | Description |
|------|--------|-------------|
| `get_hydro_inflows` | ERA5-Land (Open-Meteo) | Hydro inflow proxy for 10 European basins (precipitation, snowmelt) |

### Weather & Climate

| Tool | Source | Description |
|------|--------|-------------|
| `get_weather_forecast` | Open-Meteo | Temperature, wind speed, solar radiation by location |
| `get_solar_irradiance` | PVGIS | Monthly irradiance, optimal angle, annual PV yield |
| `get_era5_weather` | ERA5 (Copernicus/ECMWF) | Historical reanalysis: wind at hub height, solar radiation, temperature |
| `get_stormglass` | Storm Glass | Offshore marine weather: wind, waves, swell, sea temperature (10 req/day) |

## Quick Start

```bash
npm install luminus-mcp
```

Create a `.env` file:

```bash
ENTSOE_API_KEY=your-key-here        # Required for most ENTSO-E tools
GIE_API_KEY=your-key-here           # Optional: gas storage & LNG
EIA_API_KEY=your-key-here           # Optional: US gas data
FINGRID_API_KEY=your-key-here       # Optional: Finnish grid data
ESIOS_API_TOKEN=your-token-here     # Optional: Spanish market data
STORMGLASS_API_KEY=your-key-here    # Optional: offshore marine weather
```

### Get API Keys

All keys are free:

- **ENTSO-E**: Register at [transparency.entsoe.eu](https://transparency.entsoe.eu/), then email transparency@entsoe.eu
- **GIE**: Register at [agsi.gie.eu](https://agsi.gie.eu/)
- **EIA**: Register at [eia.gov/opendata](https://www.eia.gov/opendata/)
- **Fingrid**: Register at [data.fingrid.fi](https://data.fingrid.fi/)
- **ESIOS**: Email consultasios@ree.es to request a token
- **Storm Glass**: Register at [stormglass.io](https://stormglass.io/)

Many tools work without any API key: energy-charts.info, ENTSOG, Elexon BMRS, RTE France, Energi Data Service, ERA5 weather, hydro inflows, Nordpool, SMARD, EMBER, and more.

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
- "Show me gas pipeline flows through the Netherlands"
- "What are GB imbalance prices doing today?"
- "Get historical wind speeds at 100m for a North Sea offshore site"
- "What did FCR tender prices look like this week?"
- "How much is France exporting to Spain right now?"
- "What's the Danish CO2 intensity in DK1?"
- "Show Finnish wind production over the last 24 hours"
- "What are the hydro inflow conditions in Norway?"
- "Get offshore weather forecast for the Dogger Bank wind farm"
- "What's the Spanish day-ahead price curve today?"

## Data Sources

| Source | Link | Coverage |
|--------|------|----------|
| ENTSO-E Transparency Platform | [transparency.entsoe.eu](https://transparency.entsoe.eu/) | 30+ European countries |
| ENTSOG Transparency Platform | [transparency.entsog.eu](https://transparency.entsog.eu/) | European gas pipelines |
| National Grid ESO | [carbonintensity.org.uk](https://carbonintensity.org.uk/) | UK |
| Elexon BMRS | [bmrs.elexon.co.uk](https://bmrs.elexon.co.uk/) | GB balancing mechanism |
| GIE AGSI+ / ALSI | [agsi.gie.eu](https://agsi.gie.eu/) | European gas & LNG |
| EIA | [eia.gov](https://www.eia.gov/) | US natural gas |
| energy-charts.info | [energy-charts.info](https://energy-charts.info/) | EU electricity (Fraunhofer ISE) |
| Nordpool | [nordpoolgroup.com](https://www.nordpoolgroup.com/) | Nordic & Baltic markets |
| SMARD | [smard.de](https://www.smard.de/) | German electricity |
| Regelleistung.net | [regelleistung.net](https://www.regelleistung.net/) | EU balancing reserves (FCR/aFRR/mFRR) |
| RTE France (ODRE) | [odre.opendatasoft.com](https://odre.opendatasoft.com/) | French electricity |
| Energi Data Service | [energidataservice.dk](https://www.energidataservice.dk/) | Danish electricity |
| Fingrid | [data.fingrid.fi](https://data.fingrid.fi/) | Finnish grid (3-min) |
| Terna | [developer.terna.it](https://developer.terna.it/) | Italian electricity |
| REE ESIOS | [esios.ree.es](https://www.esios.ree.es/) | Spanish electricity |
| ACER REMIT | [acer-remit.eu](https://www.acer-remit.eu/) | EU market transparency |
| EMBER Climate | [ember-climate.org](https://ember-climate.org/) | Global power sector data |
| Yahoo Finance | [finance.yahoo.com](https://finance.yahoo.com/) | Energy commodities |
| Open-Meteo / ERA5 | [open-meteo.com](https://open-meteo.com/) | Weather forecast + ERA5 reanalysis |
| PVGIS | [re.jrc.ec.europa.eu](https://re.jrc.ec.europa.eu/pvg_tools/) | Global solar irradiance |
| Storm Glass | [stormglass.io](https://stormglass.io/) | Marine/offshore weather |
| Open Power System Data | [open-power-system-data.org](https://open-power-system-data.org/) | European power plants |
| JAO | [jao.eu](https://www.jao.eu/) | Cross-border auctions |
| OpenStreetMap | [openstreetmap.org](https://www.openstreetmap.org/) | Transmission lines |
| mainsfrequency.com | [mainsfrequency.com](https://www.mainsfrequency.com/) | European grid frequency |

## Licence

MIT. See [LICENSE](LICENSE).
