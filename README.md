# Luminus

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/luminus-mcp)](https://www.npmjs.com/package/luminus-mcp)

Latest release: [v0.2.2 release notes](docs/releases/0.2.2.md) · [Changelog](CHANGELOG.md)

Real-time European & UK electricity grid data via MCP. 56 tools, all free.

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
| `get_grid_connection_queue` | NESO TEC Register | GB transmission connection-register signal: queued/contracted projects, MW, status, and dates by connection site |
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
| `get_rte_france` | RTE France (ODRE) | French generation (nuclear, wind, solar), consumption, and exchanges |
| `get_energi_data` | Energi Data Service | Danish real-time CO2, production, prices, and electricity balance |
| `get_fingrid_data` | Fingrid | Finnish grid data at 3-min resolution (generation, imports, frequency) |
| `get_terna_data` | Terna | Italian generation, demand, exchanges, and zonal market prices |
| `get_ree_esios` | REE ESIOS | Spanish prices, demand, generation mix, wind/solar forecast vs actual |

### Hydropower

| Tool | Source | Description |
|------|--------|-------------|
| `get_hydro_inflows` | ERA5-Land (Open-Meteo) | Hydro inflow proxy for 10 European basins (precipitation, snowmelt) |

### GIS Site Prospecting

| Tool | Source | Description |
|------|--------|-------------|
| `get_terrain_analysis` | Open-Meteo Elevation | Elevation, slope, aspect, and flatness score for a location |
| `get_grid_proximity` | OpenStreetMap | Nearest substations and HV lines within a radius, with distances |
| `get_grid_connection_queue` | NESO TEC Register | GB transmission TEC register search by connection site, host TO, technology, status, and agreement type |
| `get_grid_connection_intelligence` | NESO GSP + TEC + OSM | GB grid connection intelligence: nearest GSP lookup, TEC register queue at that GSP, and nearby substations |
| `get_land_constraints` | Natural England / EEA Natura 2000 | GB protected areas via Natural England, plus EU Natura 2000 protected sites within a radius |
| `get_land_cover` | CORINE Land Cover 2018 | Point land-cover classification for EU27 + EEA/EFTA sites, with conservative planning-exclusion flags for wetlands, water bodies, and woodland. GB not covered |
| `get_agricultural_land` | Natural England ALC | Best and Most Versatile agricultural land screening. Prefers detailed post-1988 surveys, falls back to provisional ALC |
| `get_flood_risk` | Environment Agency | Flood-planning screen using Flood Zone 2, Flood Zone 3, and flood storage areas |
| `screen_site` | Composite | PV/BESS site screening: terrain + grid + solar + constraints + agricultural land + flood risk in one pass/warn/fail verdict (GB + EU) |
| `compare_sites` | Composite | Compare and rank 2-10 candidate PV/BESS sites by verdict, solar resource, grid proximity, and terrain (GB + EU) |
| `estimate_site_revenue` | PVGIS + ENTSO-E | Estimate annual PV generation revenue or BESS arbitrage revenue for a candidate site. Requires ENTSO-E key. |
| `shortlist_bess_sites` | Composite | GB-only BESS shortlist: combines `compare_sites`, screening-level revenue estimates, and GB transmission queue intelligence into a ranked shortlist. Requires ENTSO-E key. |
| `verify_gis_sources` | All GIS providers | Health check for upstream GIS data sources. Reports status, response time, and provenance metadata |

Roadmap: see [`docs/gis-roadmap.md`](docs/gis-roadmap.md).

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

## Python SDK Preview

A notebook-friendly Python client now lives under [`python/`](python/README.md).
It wraps `luminus-mcp` over stdio and exposes plain Python methods like `get_day_ahead_prices()`, `get_generation_mix()`, and `screen_site()`.
The package name is `luminus-py`.
Roadmap: see [`docs/python-sdk-roadmap.md`](docs/python-sdk-roadmap.md).

```python
from luminus import Luminus

lum = Luminus(profile="trader")
prices = lum.get_day_ahead_prices(zone="DE")
df = prices.to_pandas()
```

### API Keys

Set keys via environment variables or `~/.luminus/keys.json`:

```bash
# Option 1: .env file
ENTSOE_API_KEY=your-key-here        # Required for most ENTSO-E tools
GIE_API_KEY=your-key-here           # Optional: gas storage & LNG
EIA_API_KEY=your-key-here           # Optional: US gas data
FINGRID_API_KEY=your-key-here       # Optional: Finnish grid data
ESIOS_API_TOKEN=your-token-here     # Optional: Spanish market data
STORMGLASS_API_KEY=your-key-here    # Optional: offshore marine weather
```

```json
// Option 2: ~/.luminus/keys.json (alternative to env vars)
{
  "ENTSOE_API_KEY": "your-key-here",
  "GIE_API_KEY": "your-key-here"
}
```

Key resolution order: environment variable first, then `~/.luminus/keys.json`. Tools with missing keys are automatically skipped at startup (they never appear in the tool list).

All keys are free:

- **ENTSO-E**: Register at [transparency.entsoe.eu](https://transparency.entsoe.eu/), then email transparency@entsoe.eu
- **GIE**: Register at [agsi.gie.eu](https://agsi.gie.eu/)
- **EIA**: Register at [eia.gov/opendata](https://www.eia.gov/opendata/)
- **Fingrid**: Register at [data.fingrid.fi](https://data.fingrid.fi/)
- **ESIOS**: Email consultasios@ree.es to request a token
- **Storm Glass**: Register at [stormglass.io](https://stormglass.io/)

Many tools work without any API key: energy-charts.info, ENTSOG, Elexon BMRS, RTE France, Energi Data Service, ERA5 weather, hydro inflows, Nordpool, SMARD, and more.

### Profiles

By default all available data tools are registered. Use `--profile` to load only what you need, cutting context window cost by 60-90%:

```bash
npx luminus-mcp --profile trader     # 8 tools: prices, spreads, commodities
npx luminus-mcp --profile grid       # 11 tools: flows, outages, infrastructure
npx luminus-mcp --profile generation # 6 tools: gen mix, forecasts, carbon
npx luminus-mcp --profile gas        # 5 tools: storage, LNG, pipeline flows
npx luminus-mcp --profile renewables # 5 tools: wind/solar forecasts, hydro
npx luminus-mcp --profile uk         # 3 tools: UK carbon, demand, Elexon
npx luminus-mcp --profile bess       # 7 tools: arbitrage, ancillary, revenue, shortlist
npx luminus-mcp --profile regional   # 8 tools: country-specific sources
npx luminus-mcp --profile weather    # 5 tools: forecasts, ERA5, marine
npx luminus-mcp --profile gis        # 15 tools: solar, terrain, grid, queue, screening, comparison, shortlist, verification
npx luminus-mcp --profile full       # all 56 tools (default)
```

Two meta-tools are always registered regardless of profile:
- `luminus_discover` — list available tools and profiles
- `luminus_status` — server health: registered tool count, active profile, configured/missing API keys

### Claude Code

```bash
# Full tool set
claude mcp add luminus -- npx luminus-mcp

# With a profile (recommended for faster responses)
claude mcp add luminus -- npx luminus-mcp --profile trader
```

### MCP Config (Claude Desktop / OpenClaw)

```json
{
  "mcpServers": {
    "luminus": {
      "command": "npx",
      "args": ["luminus-mcp", "--profile", "trader"],
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
| NESO Data Portal | [api.neso.energy](https://api.neso.energy/) | GB transmission connection registers and GIS boundary datasets |
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
| Yahoo Finance | [finance.yahoo.com](https://finance.yahoo.com/) | Energy commodities |
| Open-Meteo / ERA5 | [open-meteo.com](https://open-meteo.com/) | Weather forecast + ERA5 reanalysis |
| PVGIS | [re.jrc.ec.europa.eu](https://re.jrc.ec.europa.eu/pvg_tools/) | Global solar irradiance |
| Storm Glass | [stormglass.io](https://stormglass.io/) | Marine/offshore weather |
| Open Power System Data | [open-power-system-data.org](https://open-power-system-data.org/) | European power plants |
| JAO | [jao.eu](https://www.jao.eu/) | Cross-border auctions |
| OpenStreetMap | [openstreetmap.org](https://www.openstreetmap.org/) | Transmission lines, substations |
| Open-Meteo Elevation | [open-meteo.com](https://open-meteo.com/) | Terrain elevation (Copernicus EU-DEM) |
| Natural England Open Data | [naturalengland-defra.opendata.arcgis.com](https://naturalengland-defra.opendata.arcgis.com/) | England protected areas and agricultural land classification |
| EEA Natura 2000 | [bio.discomap.eea.europa.eu](https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites/Natura2000_Dyna_WM/MapServer) | EU Natura 2000 protected sites |
| Environment Agency Flood Map for Planning | [environment.data.gov.uk](https://environment.data.gov.uk/dataset/04532375-a198-476e-985e-0579a0a11b47) | England flood zones and flood storage areas |
| mainsfrequency.com | [mainsfrequency.com](https://www.mainsfrequency.com/) | European grid frequency |

## Quality and safety guardrails

Luminus is meant to be boring in the right places: typed inputs, read-only data access, small runtime dependencies, and reproducible release checks.

Current repo guardrails:
- CI runs `npm test`, `npm run build`, `npm audit --omit=dev`, and `npm pack --dry-run`
- Dependabot watches npm and GitHub Actions dependencies
- `dist/` is cleaned before every build, so stale files do not leak into the published tarball
- package runtime is pinned to supported Node versions via `.nvmrc` and `package.json` `engines`
- raw upstream errors stay hidden unless `LUMINUS_DEBUG=1` is enabled locally
- tools with missing API keys are silently excluded at startup (reduced attack surface)
- all tool calls are logged to `~/.luminus/audit.jsonl` with sensitive parameter redaction
- API keys can be stored in `~/.luminus/keys.json` instead of environment variables (with Unix permission warnings for world-readable files)

See `SECURITY.md` for the release checklist and vulnerability reporting path.

## Troubleshooting

### "Error: ENTSOE_API_KEY not set"

Most ENTSO-E tools require an API key. Set it in `.env`, `~/.luminus/keys.json`, or pass via your MCP config's `env` block. Tools with missing keys are automatically excluded from registration, so they won't appear in the tool list. Tools that don't need a key (energy-charts, Nordpool, SMARD, Elexon, etc.) always work.

### "Error: No data returned" or empty results

- **Wrong zone code**: Use two-letter country codes (`DE`, `FR`, `GB`) or ENTSO-E bidding zone codes (`10YDE-VE-------2`). See tool descriptions for valid zones.
- **Date range**: Some APIs only serve recent data (24-48h). Don't request dates more than a few days in the past unless the tool description says otherwise.
- **Weekend/holiday**: Day-ahead auction results may not exist for the current day if the auction hasn't cleared yet.

### Rate limits

| Source | Limit | What happens |
|--------|-------|--------------|
| ENTSO-E | ~400 req/min | HTTP 429 — wait and retry |
| Storm Glass | 10 req/day (free) | HTTP 403 after limit hit |
| OpenStreetMap (Overpass) | ~10k/day | Slow responses, then timeout |
| GIE (AGSI+/ALSI) | ~60 req/min | HTTP 429 |

If you hit a rate limit, the error message will include the HTTP status code. Wait a minute and retry.

### Build/install issues

```bash
# Rebuild from source
npm run build

# Run the small regression suite
npm test

# Check runtime dependency vulnerabilities
npm audit --omit=dev
```

### Error handling and debug mode

Luminus now normalises tool failures into five buckets:
- **Invalid parameters**: bad zone, corridor, date, or missing required input
- **Configuration error**: missing API key or env var
- **No data returned**: request was valid, but the upstream source had no matching data
- **Upstream source error**: timeout, 4xx/5xx, or provider-side failure
- **Unexpected server error**: anything else

By default, tool responses stay short and actionable. If you need raw internals while debugging locally, set:

```bash
LUMINUS_DEBUG=1
```

That adds the raw upstream error text to MCP responses and prints the underlying error to stderr.

### Audit logging

All tool calls are logged to `~/.luminus/audit.jsonl` as newline-delimited JSON. Each entry includes a timestamp, tool name, and parameters (with sensitive values like API keys automatically redacted).

```bash
# View recent tool calls
tail -20 ~/.luminus/audit.jsonl | jq .

# Log location
# Windows: C:\Users\<you>\.luminus\audit.jsonl
# macOS/Linux: ~/.luminus/audit.jsonl
```

Audit logging is fire-and-forget and never blocks tool execution. Logs rotate automatically at 50MB.

### Dependency hygiene

Runtime deps are intentionally small: MCP SDK, dotenv, fast-xml-parser, and zod. Transitive deps still matter, so before releases you should run:

```bash
npm audit --omit=dev
```

The package pins `path-to-regexp` via `overrides` to avoid the known vulnerable 8.0.0-8.3.0 range pulled in through the MCP SDK's Express stack.

### Scope and limitations

Luminus aggregates publicly available European energy data. It is a data-access layer, not an energy trading model. It does not provide:
- Trading recommendations or financial advice
- Sub-second or tick-level market data
- Historical data beyond what each upstream API offers (typically days to weeks; ERA5 is the main multi-year exception)
- Guaranteed uptime — upstream APIs go down independently

Data freshness depends on each source. Most update every 15-60 minutes. Check the `timestamp` or `updated_at` field in tool responses.

## Licence

MIT. See [LICENSE](LICENSE).

## GIS roadmap

See [`docs/gis-roadmap.md`](docs/gis-roadmap.md) for the shipped sprint baseline, current tranche, next actions, and hard caveats.

## UK/EU GIS data sources, API keys, and registration

The current GIS tranche is built to favour keyless or low-friction public sources for a UK/EU MVP.

| Source | What we use it for | API key needed? | Registration needed? | Notes |
|---|---|---:|---:|---|
| PVGIS | solar resource / yield context | No | No | Public HTTP access, good fit for UK/EU MVP |
| Open-Meteo elevation | terrain and elevation context | No | No | Public HTTP access, lightweight for point lookups |
| OpenStreetMap / Overpass / OpenInfraMap-derived queries | substations, lines, coarse grid proximity | No | No | Keyless but public endpoints can be slow or flaky, so fallback logic matters |
| NESO Data Portal TEC register | GB transmission connection-register signal | No | No | Public CKAN datastore API, updated twice weekly, but it is transmission-only and not a DNO headroom map |
| Natural England / UK open GIS services | protected areas, constraint screening, agricultural land classification | Usually no | Usually no | Public access, but service quality and endpoint shape can be inconsistent |
| EEA Natura 2000 | EU protected-area screening | No | No | Good first EU-wide layer, but it is not the full national planning-constraints stack in each country |
| Environment Agency Flood Map for Planning | Flood Zone 2/3 and flood storage area screening | No | No | Public ArcGIS service for England planning layers, but still not a substitute for a site-specific FRA |
| CORINE / Copernicus-style open data | land-cover and broader EU layers | No | Usually no for basic access/downloads | Better suited to staged ingestion or pre-processing than naive live API calls |

### What this means in practice

- Most of the MVP stack is **keyless**.
- You do **not** need to register just to use the current GIS tool set.
- Public GIS endpoints are still not the same thing as production-grade infrastructure.
- For the first version, we should prove usefulness with public sources first, then decide later whether to cache, mirror, or formalise any upstream dependencies.

### How we check a source is really working

We do not treat docs as proof. We check sources by:

1. live sample calls from the code
2. tests around parsing and failure handling
3. clean upstream-specific error messages
4. fallback logic for brittle public services where it is worth it
5. build + audit + real tool proofs before locking a sprint
6. `verify_gis_sources` tool — pings each upstream provider and reports ok/degraded/unreachable with response times

### Source metadata and provenance

Every GIS tool response includes a `source_metadata` block with:
- **provider** and **licence** — where the data comes from and under what terms
- **coverage** — geographic and temporal scope
- **reliability** — high/medium/low, based on observed uptime and endpoint quality
- **caveats** — known limitations specific to that source
- **attribution** — required credit line

This metadata is not marketing. It is there so callers can judge how much to trust a response, especially when making decisions that matter (site acquisition, planning applications, grid connection quotes).

### Registration stance

Right now the right approach is:

- use keyless public sources where possible
- avoid signing up for unnecessary services too early
- only add registration-based or commercial sources later if reliability or coverage genuinely demands it
