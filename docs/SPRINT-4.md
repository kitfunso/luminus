# Luminus Sprint 4: Power-User Workflow & Market Intelligence

Reference direction: Kyle Walker style workflow, less "pretty map", more "daily decision surface".

## Goal
Turn Luminus from a strong visual grid map into a trader / analyst workflow tool with saved context, faster drill-downs, richer fundamentals, and actionable alerting.

## Sprint 4 Tracks

### 1. Search + Watchlists
- Instant search for plant, country, bidding zone, and corridor
- Pin assets into watchlists
- Persist watchlists locally first
- Quick-jump from watchlist item to map selection / detail panel

### 2. Corridor Detail Pages
- Dedicated corridor views for spreads, flows, capacity, and congestion
- Show directionality, utilisation, and relevant outages
- Support shareable route state

### 3. Per-Asset Time Series
- 7d / 30d / 1y charts for countries, plants, and corridors where data exists
- Reuse one chart shell with asset-specific data loaders
- Prefer hourly first, then widen scope

### 4. Alerts
- Price spike, outage start/end, forecast miss, congestion threshold
- Local rule builder first, delivery hooks second
- Watchlist-aware alerts

### 5. Trader Dashboard
- One-screen morning briefing
- Biggest movers, outage risk, congestion, forecast misses, and notable spreads
- Prioritise "what changed" and "what matters now"

### 6. Real Line Routing + Constraint View
- Replace centroid logic where possible with real pathing
- Highlight constrained / stressed corridors
- Build toward actual bottleneck storytelling, not just decorative arcs

### 7. Fundamentals Overlays
- Load forecast, weather, gas, carbon, and spread-adjacent overlays
- Add overlays only when they change decisions, not just because data exists

### 8. Queue / Pipeline Intelligence
- TYNDP and other planned infrastructure surfaced as an actionable pipeline layer
- Status, expected completion, capacity, geography, and developer where possible

## Delivery Principle
Sprint 4 should improve analyst speed, not just map aesthetics.

The right shape is:
- faster navigation
- better saved context
- richer drill-downs
- more alertable state
- more decision-relevant overlays

## Suggested Build Order
### Batch A
1. Search + Watchlists
2. Corridor Detail Pages
3. Per-Asset Time Series

### Batch B
4. Alerts
5. Trader Dashboard

### Batch C
6. Real Line Routing + Constraint View
7. Fundamentals Overlays
8. Queue / Pipeline Intelligence

## Done When
- A user can open Luminus on desktop or mobile and get to a watched corridor / country in under 2 clicks
- A corridor has a proper detail surface, not just a tooltip
- Time series exists as a first-class workflow element
- Alerts are configurable from in-product state
- The dashboard summarises market changes without manual map hunting
- Planned infrastructure and fundamentals can be layered without clutter collapse
