# Luminus MCP Server - Scope

## Phase 1: Core MCP Tools

### ENTSO-E API Reference
- Base URL: `https://web-api.tp.entsoe.eu/api`
- Auth: `securityToken` query parameter
- Format: XML responses (need parsing)
- Rate limit: ~400 requests/min
- Docs: https://transparency.entsoe.eu/content/static_content/Static%20content/web%20api/Guide.html

### Country/Zone Codes (ENTSO-E uses EIC codes)
```
GB  = 10YGB----------A   (Great Britain)
DE  = 10Y1001A1001A83F   (Germany)
FR  = 10YFR-RTE------C   (France)
NL  = 10YNL----------L   (Netherlands)
BE  = 10YBE----------2   (Belgium)
ES  = 10YES-REE------0   (Spain)
IT  = 10YIT-GRTN-----B   (Italy North)
NO1 = 10YNO-1--------2   (Norway zone 1)
SE1 = 10Y1001A1001A44P   (Sweden zone 1)
DK1 = 10YDK-1--------W   (Denmark West)
PL  = 10YPL-AREA-----S   (Poland)
AT  = 10YAT-APG------L   (Austria)
CH  = 10YCH-SWISSGRIDZ   (Switzerland)
IE  = 10YIE-1001A00010   (Ireland)
```

### Tool Specifications

#### 1. get_generation_mix
- ENTSO-E documentType: A75 (Actual Generation per Type)
- processType: A16 (Realised)
- Returns: MW per fuel type (wind, solar, gas, nuclear, hydro, coal, biomass, etc.)
- Params: country, date (defaults to now)

#### 2. get_day_ahead_prices  
- ENTSO-E documentType: A44 (Price Document)
- Returns: EUR/MWh per hour for a bidding zone
- Params: zone, start_date, end_date

#### 3. get_cross_border_flows
- ENTSO-E documentType: A11 (Aggregated Energy Data Report)
- Returns: MW flows between two zones
- Params: from_zone, to_zone, date

#### 4. get_outages
- ENTSO-E documentType: A80 (Generation Unavailability) / A78 (Transmission Unavailability)
- Returns: unit name, fuel type, available/unavailable MW, start/end
- Params: country, type (generation/transmission), date_range

#### 6. get_carbon_intensity
- Derived: calculate from generation mix using emission factors per fuel type
- Emission factors (gCO2/kWh): coal=900, gas=400, oil=650, nuclear=0, wind=0, solar=0, hydro=0, biomass=50
- Returns: gCO2/kWh for a zone

#### 7. get_demand_forecast
- ENTSO-E documentType: A65 (System Total Load)
- processType: A01 (Day ahead forecast)
- Returns: MW per hour
- Params: country, date

#### 8. get_renewable_forecast
- ENTSO-E documentType: A69 (Wind/Solar Generation Forecast)
- Returns: MW per hour for wind and solar
- Params: country, date

## Tech Stack
- TypeScript
- MCP SDK (@modelcontextprotocol/sdk)
- xml2js or fast-xml-parser for ENTSO-E XML parsing
- node-fetch or built-in fetch for API calls
- Zod for parameter validation

## Project Structure
```
Luminus/
  src/
    index.ts              # MCP server entry point (profile-aware, conditional registration)
    tools/
      generation.ts       # get_generation_mix
      prices.ts           # get_day_ahead_prices
      flows.ts            # get_cross_border_flows
      outages.ts          # get_outages
      carbon.ts           # get_carbon_intensity (derived)
      demand.ts           # get_demand_forecast
      forecast.ts         # get_renewable_forecast
      ... (48 tools total)
    lib/
      entsoe-client.ts    # ENTSO-E API client (handles XML, auth, rate limits)
      zone-codes.ts       # EIC code mappings
      xml-parser.ts       # XML response parsing helpers
      cache.ts            # In-memory TTL cache
      tool-handler.ts     # Error normalization & validation wrapper
      auth.ts             # Layered API key resolution (env -> keys.json)
      audit.ts            # Append-only tool call audit logging
      profiles.ts         # Tool profiles for context window optimization
  docs/
    SCOPE.md
  package.json
  tsconfig.json
  vitest.config.ts
```

## Caching Strategy
- Generation mix: cache 5 min (real-time but updates every 15 min)
- Prices: cache 1 hour (day-ahead, published once daily)
- Flows: cache 5 min
- Capacity: cache 24 hours (changes rarely)
- Outages: cache 15 min
- Frequency: cache 30 sec
- Balancing: cache 5 min
- Forecasts: cache 1 hour
- Weather: cache 30 min
- Intraday: cache 15 min

## Context Window Optimization

48 tools registered at once consumes ~5,000-6,000 LLM context tokens. Mitigations:

1. **Tool profiles** (`--profile trader|grid|gas|...`) load only relevant tools (60-90% reduction)
2. **Conditional registration** skips tools with missing API keys (never appear in context)
3. **Compressed descriptions** cut tool schema overhead by ~48%
4. **Discovery meta-tools** (`luminus_discover`, `luminus_status`) let agents inspect what's available

## Security Architecture

1. **Layered key resolution**: env vars -> `~/.luminus/keys.json` -> clear error
2. **Key file permissions**: warns on Unix if keys.json is world-readable
3. **Audit logging**: all tool calls logged to `~/.luminus/audit.jsonl` with sensitive param redaction
4. **Conditional registration**: tools with missing keys never register (reduced surface)
5. **Constant-time comparison**: `timingSafeCompare` for token validation

## Phase 2: deck.gl Frontend
- Separate package or monorepo
- Next.js + deck.gl
- ScatterplotLayer for power plants
- ArcLayer for cross-border flows
- HeatmapLayer for prices
- Real-time updates via polling (ENTSO-E doesn't have WebSocket)

## Competitive Landscape
- electricitymaps.com - has the map but no MCP/API for agents
- transparency.entsoe.eu - raw data, terrible UX
- energy-charts.info (Fraunhofer) - Germany-focused charts
- gridwatch.co.uk - UK-only, simple
- None of these have MCP servers. That's the gap.
