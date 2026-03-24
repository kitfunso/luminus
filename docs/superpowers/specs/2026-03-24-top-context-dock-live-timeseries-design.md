# Top Context Dock Live Time Series Design

Date: 2026-03-24
Product: Luminus web dashboard
Status: Approved design direction
Chosen approach: Top Context Dock

## Summary

Luminus should move from overlapping floating panels and mixed-truth charting to a reserved map layout with one persistent intelligence rail, one top context dock, and one bottom analysis lane.

This design does six things together:

1. Makes all core time-series surfaces explicitly live or explicitly labeled fallback.
2. Replaces right-side country and plant detail panels with a top context dock.
3. Keeps the Market Intelligence rail visible while country or plant detail is open.
4. Upgrades compact charts to interactive hover-and-track charts and adds an expanded multi-series analysis view.
5. Fixes layout collisions between the tutorial, replay lane, rail, and detail surfaces.
6. Replaces the clipped generation-mix map indicator with live day-ahead price and gives the hover popup a new operational summary.

## Problem Statement

The current dashboard still has four structural issues:

1. Not all visible time-series are truly live. Some are runtime-fetched, some are bootstrap-only, and some are synthesized without explicit labeling.
2. The replay lane, guide chip, and Market Intelligence rail can overlap because they are positioned independently without reserved layout lanes.
3. Country and plant detail currently compete with the right intelligence rail instead of complementing it.
4. The map-level generation-mix indicator is clipped and duplicates information that would be better represented by live price.

There are also two trust issues:

1. Users cannot easily validate whether a number comes from a live provider response, a cached response, or a fallback dataset.
2. The outage experience is country-aggregated in the rail, but clicking a specific outage plant does not yet complete the workflow of zooming to the asset and surfacing its detail in context.

## Goals

- Make prices, replay history, corridor flow profiles, forecast vs actual series, and outage drill-down explicitly live where supported.
- Label every dataset with consistent truth metadata.
- Keep Market Intelligence visible while country or plant detail is open.
- Move country and plant information into a top context dock.
- Make all time-series charts interactive in compact form.
- Add an expanded chart mode that supports additional overlays.
- Fix all major panel collisions involving guide, replay, rail, filters, and detail surfaces.
- Replace the clipped generation-mix map indicator with live day-ahead price.
- Replace the hover popup's duplicated day-ahead price with a more useful operational summary.

## Non-Goals

- Rebuild the whole dashboard into a dedicated quant terminal.
- Redesign the brand or overall visual language from scratch.
- Remove the intelligence rail in favor of a single monolithic detail surface.
- Support unlimited analytics tooling beyond the approved expanded chart mode.
- Present estimated or fallback data as live.

## Current-State Findings

- Corridor `flowMW` is live on the runtime data path, but the displayed `24h flow profile` in corridor detail is currently synthesized from price spreads and current flow.
- Replay still uses bootstrap history rather than live historical prices.
- Outage data on the current Pages deployment is still bootstrap/fallback rather than live refresh.
- Compact chart components in replay, forecast, country detail, corridor detail, and asset detail are largely static SVG summaries without tracked inspection.
- The current `detail-panel`, `time-scrubber`, `right-panel`, tour chip, and checklist all use absolute positioning, which causes collisions.
- The Market Intelligence rail is currently hidden whenever detail is open.
- The map hover popup currently includes day-ahead price, which duplicates what the map-level metric should show by default.

## UX Principles

- One map stage, one persistent intelligence rail, one contextual top dock.
- Live data must show trust cues, not just values.
- Compact charts should be inspectable.
- Expanded charts should support comparison without turning the whole app into a separate workspace.
- Hover should provide quick signal. Click should provide full context.
- Layout lanes should be reserved so important surfaces do not collide.

## Proposed Architecture

### 1. Data Truth Model

All live-facing datasets should share one normalized metadata envelope:

- `provider`
- `source`
- `lastUpdated`
- `intervalStart`
- `intervalEnd`
- `isLoading`
- `isRefreshing`
- `isStale`
- `isFallback`
- `error`

Rules:

- No chart should silently mix live and synthesized data.
- Any estimated series must be labeled as estimated.
- Any fallback series must be labeled as fallback.
- Any stale series must show last successful update time.

### 2. Target Live Datasets

The dashboard should support these datasets as first-class live series:

- `prices`
  current day-ahead values and live historical window for replay and expanded charts
- `flows`
  current corridor values and true hourly corridor series for 24h flow profiles
- `forecasts`
  hourly forecast and actual series for wind and solar
- `outages`
  plant-level outage events with country rollups derived from them

Outage event records should carry:

- plant id or stable key
- plant name
- country
- fuel
- unavailable MW
- outage type
- expected return
- coordinates when available

### 3. Validation Model

Validation should be implemented in four layers:

1. Parser validation
   provider fixtures and contract tests to verify normalization logic
2. Data invariants
   rollup checks such as `country outage MW = sum of plant outage MW`
3. UI assertions
   tests that visible card, tooltip, and chart values match normalized API payloads
4. Operator visibility
   a provenance/debug view that shows source, timestamp, and raw selected values

This makes every visible number explainable.

## Layout Design

### Reserved Layout Lanes

The map viewport should reserve four surface zones:

1. `Top Context Dock`
   placed across the top of the map stage between the left sidebar and the right intelligence rail
2. `Right Intelligence Rail`
   persistent on the right side and always visible when active
3. `Bottom Analysis Lane`
   reserved for replay and other bottom analysis controls
4. `Guide Lane`
   bottom-right safe position for guide chip and checklist, above the replay lane and outside the rail footprint

This removes free-floating competition between the dock, rail, replay, and guide surfaces.

### Top Context Dock

The top context dock replaces the current right-side detail panel for:

- country selections
- plant selections
- corridor selections

Behavior:

- appears on click or programmatic selection
- stays below the live status area and above the map
- never displaces the Market Intelligence rail
- supports compact KPIs and compact interactive charts

Country dock content:

- country name and flag
- day-ahead price
- live status
- outages summary
- forecast surprise summary
- compact charts for price, forecast vs actual, and other contextually relevant series

Plant dock content:

- plant name
- country
- fuel
- unavailable MW
- outage type
- expected return
- coordinates
- contextual country price and outage/chart context

Corridor dock content:

- corridor name
- current flow
- utilisation
- headroom
- true live 24h flow profile
- spread and adjacent context

### Right Intelligence Rail

The Market Intelligence rail remains persistent while the top dock is open.

It continues to host:

- Morning Brief
- Outage Radar
- Forecast vs Actual
- future intelligence modules

The rail should no longer disappear when a country or plant is selected.

### Bottom Analysis Lane

The replay lane should sit in a reserved bottom band that does not overlap:

- the guide chip
- the guide checklist
- the right rail
- the top dock

This lane should stretch only through the safe horizontal span between the sidebar and the guide/rail area.

### Guide Lane

The guide chip and checklist should be moved into a reserved bottom-right safe zone.

Rules:

- the collapsed `Guide n/7` chip must not overlap replay
- the checklist must not overlap the rail
- spotlight cards should prefer adaptive placement that avoids rail, dock, and replay surfaces where possible

## Interaction Design

### Selection Flow

Country click:

- fly to country if needed
- open top context dock with country detail
- keep Market Intelligence rail visible

Plant click:

- fly to plant location
- highlight plant marker
- open top context dock with plant detail
- keep Market Intelligence rail visible

Outage plant click from the rail:

- select the plant
- zoom to the plant
- open plant detail in the top context dock
- keep the rail visible in outage mode

### Chart Behavior

All compact charts should support:

- hover
- crosshair
- tracked timestamp
- exact value tooltip

Every compact chart should include an `Expand` action.

Expanded chart mode should:

- open as a larger analysis surface
- start with context-aware default series
- allow users to add other available series from across the map
- support multiple visible series with a synchronized cursor
- use stable color assignment and a searchable series picker

Default expanded chart bundles:

- country
  price, forecast vs actual, outage context when relevant
- plant
  outage window, country price, nearby or country-level context
- corridor
  live flow profile, utilisation, spread

## Map Metric and Hover Design

### Map-Level Metric Replacement

The clipped generation-mix map indicator should be removed.

Replacement behavior:

- show live day-ahead price in that map metric slot by default
- this becomes the primary always-on map metric

### Hover Popup Redesign

The hover popup should stop repeating day-ahead price.

Recommended replacement content: `Market Pulse`

- country name and flag
- net position
  importing or exporting now
- outages
  MW offline in that country
- forecast surprise
  above or below forecast when material
- live state
  updated time or stale/fallback label

This keeps price on the map-level metric and uses hover for operational signal.

### Click Detail Rule

Once a country or plant is clicked, the full detail belongs in the top context dock rather than in the hover popup or a right-side detail panel.

## Live Series Rules

- Replay must use true live historical prices, not bootstrap history.
- 24h corridor flow profiles must use true live corridor hourly series, not synthetic estimates.
- Forecast vs actual must remain live and hoverable.
- Outage series must use provider-backed outage intervals where available. If interval data is incomplete, event windows must be labeled clearly.

## Testing Strategy

### Data Tests

- parser fixtures for prices, flows, forecasts, outages
- invariant tests for rollups and time-window alignment
- fallback and stale-state tests for partial provider failure

### UI Tests

- compact chart hover shows correct timestamp and value
- expanded chart inherits the correct default base series
- outage plant click opens dock and keeps rail visible
- replay lane does not overlap guide or rail
- top dock does not overlap filters or intelligence rail
- map metric shows live day-ahead price and no clipped generation-mix badge remains
- hover popup no longer shows duplicated price

### End-to-End Checks

- `/api/live/prices`
- `/api/live/flows`
- `/api/live/history`
- `/api/live/forecasts`
- `/api/live/outages`
- country click flow
- plant click flow
- outage drill-down flow
- replay flow
- expanded chart flow

## Risks

- Plant-level outage richness depends on provider data consistency.
- Live corridor hourly history may require a separate fetch pattern from current corridor snapshot refresh.
- Expanded multi-series charting can become cluttered if defaults and legend behavior are weak.

## Acceptance Criteria

- No visible overlap between guide, replay lane, top dock, and Market Intelligence rail on desktop.
- Country and plant detail open in the top context dock.
- Market Intelligence rail stays visible while country or plant detail is open.
- Replay, flow profile, forecast, and supported outage series are live or clearly labeled fallback.
- Compact charts are interactive.
- Expanded charts support additional series overlays.
- The map-level metric shows live day-ahead price.
- Hover popup uses `Market Pulse` instead of duplicating price.
