# Luminus Sprint 3: Analytics & Intelligence

Sprint 2 delivered the map, filters, price heatmap, and shareable URLs. Sprint 3 turns it from a visual toy into an analyst tool.

## Phase A: High-Value, Fast

### 1. Country Compare Mode
Click two or more countries to open a side-by-side comparison panel.

**What it shows:**
- Day-ahead price (current + 24h sparkline)
- Installed capacity breakdown by fuel (horizontal stacked bar)
- Estimated carbon intensity (gCO2/kWh, derived from fuel mix)
- Import/export balance (net cross-border flows)
- Top plants by capacity

**Data:** All available from existing bundled JSON (prices.json, power-plants.json, flows.json). No new API calls needed for v1.

**UI:**
- Right-side panel (replaces PlantPanel / PriceSparkline when active)
- Click country on map to add to comparison (max 4)
- Close button per country, "Clear all" button
- Cards scroll horizontally if >2 countries

**Effort:** 1 day. Pure frontend, existing data.

### 2. Outage Radar
Show planned and unplanned generation/transmission outages with return dates.

**Data source:** ENTSO-E Unavailability API
- A80: Generation unavailability (per unit)
- A78: Transmission unavailability
- Already specified in MCP tools (get_outages)

**What it shows:**
- List of current outages grouped by country
- Per outage: unit name, fuel type, unavailable MW, start date, expected return
- Total unavailable MW per country
- Severity indicator (% of installed capacity offline)

**UI:**
- New sidebar section or dedicated panel (toggle via layer)
- Color-coded severity: green (<5%), yellow (5-15%), red (>15%)
- Click-through to affected plant on map

**Build-time approach:** Add outage fetch to `fetch-data.js`, output `outages.json`. Runtime reads bundled data like prices/flows.

**Effort:** 1.5 days. New API integration + UI component.

### 3. Historical Replay (Time Scrubber)
Drag a slider to replay prices, flows, and generation mix over time.

**Data source:** ENTSO-E historical data
- A44 (prices) for past 7-30 days
- A11 (flows) for past 7 days
- A75 (generation mix) for past 7 days

**What it shows:**
- Date/time scrubber bar at bottom of screen
- Map updates: price heatmap colors, flow arrow sizes, gen mix labels
- "Play" button for animated playback at 1 hour per second

**Build-time approach:** Fetch 7 days of hourly data per country at build time. Bundle as `history.json` (~500KB compressed). Runtime interpolates between snapshots.

**Effort:** 2 days. Significant data pipeline + animation logic.

---

## Phase B: Analytical Depth

### 4. Interconnector Stress / Bottleneck Score
Derived metric: how close is each cross-border link to capacity?

**What it shows:**
- Per-corridor utilization % (flow / capacity)
- Color arcs by stress: green (<50%), yellow (50-80%), red (>80%)
- "Bottleneck score" per country: weighted average of inbound corridor stress
- Highlight congested corridors that may be driving price dislocations

**Data:** Already in flows.json (flowMW + capacityMW). This is mostly a UI/calculation layer on existing data.

**Effort:** 0.5 days. Straightforward derived metric.

### 5. Forecast vs Actual
Show how forecasts compare to reality for wind, solar, and demand.

**Data source:** ENTSO-E
- A69 (wind/solar forecast) vs A75 (actual generation)
- A65 (demand forecast) vs A67 (actual demand)

**What it shows:**
- Per-country forecast error bars
- "Surprise" indicator: actual significantly above/below forecast
- Historical accuracy trend (7-day rolling)

**Build-time:** Fetch both forecast and actual, compute error. Bundle as `forecast-errors.json`.

**Effort:** 1.5 days. New API calls + comparison logic.

---

## Phase C: Sticky Product Layer

### 6. Watchlists + Alerts (Future)
Save countries/interconnectors of interest. Alert on price spikes, outage changes, or flow reversals.

**Requires:** localStorage for persistence, optional push notifications.

**Effort:** 2 days. Needs design decisions on notification delivery.

**Parked for now.** Ship Phases A and B first.

---

## Build Order

| # | Feature | Depends On | Effort | New Data |
|---|---------|-----------|--------|----------|
| 1 | Country Compare | nothing | 1d | none |
| 2 | Bottleneck Score | nothing | 0.5d | none (derived) |
| 3 | Outage Radar | ENTSO-E A78/A80 | 1.5d | outages.json |
| 4 | Forecast vs Actual | ENTSO-E A65/A67/A69/A75 | 1.5d | forecast-errors.json |
| 5 | Historical Replay | ENTSO-E historical | 2d | history.json |
| 6 | Watchlists | Phase A+B complete | 2d | localStorage |

**Total estimated: ~8.5 days**

Items 1-2 are pure frontend on existing data. Ship those first, then tackle new data pipelines.

## Tech Notes
- Keep the static-export model (next build -> out/). No server-side runtime.
- All new data goes through fetch-data.js at build time.
- New panels share the same glass-morphism card style as PlantPanel/PriceSparkline.
- Country Compare panel uses absolute positioning on the right side, same z-index pattern.
- Consider adding recharts or a lightweight chart lib for Phase B bar charts.

## Priority
Start with **Country Compare Mode** (item 1). It uses only existing data, has the highest user value per effort, and establishes the comparison UI pattern that outage radar and forecast error will reuse.
