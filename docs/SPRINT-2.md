# Luminus Sprint 2: Analytics Deep Dive

Reference: Kyle Walker's ERCOT tools (clearforkintelligence.com, @kyle_e_walker)

## 1. Rich Power Plant Detail Panel
Click a plant to open a side panel with:
- Name, operator, fuel type, capacity MW
- Commissioning year, decommissioning date (if applicable)
- Location (lat/lon, country, region)
- Annual generation (GWh) from ENTSO-E A73 or WRI dataset
- Capacity factor (actual generation / max possible)
- Estimated annual CO2 emissions (generation x emission factor)
- Ownership/operator info (from WRI or OPSD)
- Link to regulatory filings if available

Data: WRI Global Power Plant Database already has most fields. Enrich with ENTSO-E actual generation data.

## 2. Real Interconnector Routing
Replace country-centroid arcs with actual transmission line routes:
- Use OpenStreetMap Overpass data (already in MCP `get_transmission_lines`)
- Render as PathLayer (polylines following real geographic routes)
- Color by voltage level (400kV red, 220kV orange, 110kV yellow)
- Thickness by capacity
- Click for details: operator, voltage, length, year built
- Highlight cross-border interconnectors separately (thicker, different color)

Data: OSM `power=line` with voltage tags. Also ENTSO-E grid map data.

## 3. Interactive Filters & Search
Sidebar filter panel:
- Fuel type checkboxes (nuclear, wind, solar, gas, coal, hydro, biomass, other)
- Capacity range slider (0-10,000 MW)
- Country multi-select dropdown
- Commissioned year range
- Search box: type plant name or location
- "Show only plants > X MW" quick toggle
- Filter updates map in real-time (deck.gl re-renders filtered data)

## 4. Aggregate Statistics Dashboard
Top bar or expandable panel showing:
- Total installed capacity by fuel type (bar chart)
- Renewable penetration % by country (choropleth or bar)
- Current generation mix across visible countries (live pie chart)
- Total cross-border flow volume (sum of all visible interconnectors)
- Average day-ahead price across visible zones
- Carbon intensity ranking (country leaderboard)
- Stats update when filters change (show stats for filtered view)

## 5. Time Series Per Asset
Click a plant or country to see:
- Monthly/annual generation history (line chart)
- Capacity factor trend over time
- Price history for the bidding zone
- Emissions trend
- Compare with peer plants (same fuel type, same country)

Data: ENTSO-E A73 (Actual Generation per Production Type) gives monthly data per zone. Per-plant requires national registry data (harder).

## 6. TYNDP Pipeline (EU equivalent of ERCOT queue)
- ENTSO-E publishes the Ten Year Network Development Plan with planned projects
- Data: https://tyndp.entsoe.eu/ (download project list)
- Show planned interconnectors, new generation, grid reinforcements
- Distinguish: under construction, permitted, planned, concept
- Click for: project name, developer, capacity, expected completion, investment cost
- Toggle layer: "Show planned infrastructure"

## 7. Real-Time Price Feed
Replace hardcoded demo prices with live ENTSO-E data:
- Fetch via our MCP server's `get_day_ahead_prices` at build time for all zones
- Show price evolution sparkline in country tooltip
- Color scale: green (< 30 EUR) → yellow (30-80) → red (80-150) → dark red (> 150)
- Add price change indicator (↑↓ vs yesterday)

## 8. Generation Mix Overlays
Per-country mini charts on the map:
- Small donut/pie chart at country centroid showing current fuel mix
- Size proportional to total generation
- Updates with real-time data from ENTSO-E
- Toggle between: current generation, installed capacity, annual generation

## 9. Responsive Click-Through Experience
Three levels of detail:
- **Zoom out (Europe view)**: country-level heatmap, aggregate stats
- **Zoom mid (country view)**: power plants visible, interconnectors, country detail panel
- **Zoom in (region view)**: individual plants clickable, transmission lines visible, substation locations

## 10. Export & Share
- Screenshot current view as PNG
- Export filtered plant data as CSV
- Shareable URL with current view state (center, zoom, filters, layers)
- Embed snippet for reports

## Tech Notes
- deck.gl PathLayer for transmission lines
- deck.gl TextLayer for country labels
- Recharts or lightweight chart lib for time series panels
- URL state management (searchParams) for shareable views
- Consider WebWorker for large dataset parsing (transmission lines can be >100K points)
- Maplibre style customisation for dark theme base map

## Priority Order
1. Real-time prices (replace hardcoded) — quick win, most visual impact
2. Filters & search — makes it usable, not just viewable
3. Aggregate stats dashboard — turns it from a map into an analytics tool
4. Rich plant detail panel — depth of information
5. Real interconnector routing — visual wow factor
6. Generation mix overlays — makes the map tell a story at a glance
7. Time series per asset — power user feature
8. TYNDP pipeline — differentiator vs competitors
9. Responsive zoom levels — polish
10. Export & share — growth feature

## Estimated Effort
- Items 1-3: one day (mostly frontend, data already available)
- Items 4-6: two days (data enrichment + UI components)
- Items 7-8: two days (charting lib integration + ENTSO-E historical data)
- Items 9-10: one day (UX polish + URL state)
- Total: ~6 days of focused work
