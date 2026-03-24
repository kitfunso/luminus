# Top Context Dock Live Time Series Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Luminus dashboard into a map-first live operations surface with a persistent intelligence rail, a top context dock for country and plant detail, fully interactive compact and expanded time-series charts, real live replay and flow profiles, and no overlay collisions.

**Architecture:** Extend the existing runtime data path so prices, replay history, flow profiles, forecasts, and outages all expose one explicit truth model with provenance metadata. Replace the current right-side detail panel with a top context dock, introduce one shared interactive chart system for compact and expanded views, and reframe overlay positioning into reserved top, right, bottom, and guide lanes so the rail, replay lane, guide, and detail surfaces never collide.

**Tech Stack:** Next.js 15 App Router, React 19, Zustand, Tailwind CSS 4, deck.gl, maplibre-gl, Vitest, Testing Library

---

## File Structure

### Existing files to modify

- `web/src/app/globals.css`
- `web/src/app/api/live/prices/route.ts`
- `web/src/app/api/live/flows/route.ts`
- `web/src/app/api/live/outages/route.ts`
- `web/src/app/api/live/forecasts/route.ts`
- `web/src/app/api/live/history/route.ts`
- `web/src/components/AssetTimeSeries.tsx`
- `web/src/components/ForecastPanel.tsx`
- `web/src/components/LiveStatusStrip.tsx`
- `web/src/components/Map.tsx`
- `web/src/components/OutageRadar.tsx`
- `web/src/components/TimeScrubber.tsx`
- `web/src/components/Tooltip.tsx`
- `web/src/components/detail/CorridorDetail.tsx`
- `web/src/components/detail/CountryDetail.tsx`
- `web/src/components/detail/DetailPanel.tsx`
- `web/src/components/detail/PlantDetail.tsx`
- `web/src/components/sidebar/LayersTab.tsx`
- `web/src/components/tutorial/TourChecklist.tsx`
- `web/src/components/tutorial/TourController.tsx`
- `web/src/components/tutorial/TourSpotlight.tsx`
- `web/src/lib/data-fetcher.ts`
- `web/src/lib/layers/index.ts`
- `web/src/lib/layers/label-layer.ts`
- `web/src/lib/live-dashboard-edge.ts`
- `web/src/lib/live-data-store.ts`
- `web/src/lib/live-data-types.ts`
- `web/src/lib/store.ts`
- `web/src/lib/url-hash.ts`
- `web/src/lib/workspace-presets.ts`

### New files to create

- `web/src/components/context/TopContextDock.tsx`
- `web/src/components/context/TopContextDock.test.tsx`
- `web/src/components/context/CountryContextSection.tsx`
- `web/src/components/context/PlantContextSection.tsx`
- `web/src/components/context/CorridorContextSection.tsx`
- `web/src/components/charts/InteractiveTimeSeriesChart.tsx`
- `web/src/components/charts/InteractiveTimeSeriesChart.test.tsx`
- `web/src/components/charts/ExpandedSeriesPanel.tsx`
- `web/src/components/charts/ExpandedSeriesPanel.test.tsx`
- `web/src/components/charts/series-catalog.ts`
- `web/src/components/ProvenancePanel.tsx`
- `web/src/lib/live-dashboard-edge.test.ts`
- `web/src/lib/live-validation.ts`

### Responsibility map

- `live-dashboard-edge.ts`: provider fetch, normalization, and runtime dataset envelopes
- `live-validation.ts`: invariant checks and provenance helpers for visible numbers
- `TopContextDock.tsx`: top-of-map shell for country, plant, and corridor context
- `CountryContextSection.tsx` / `PlantContextSection.tsx` / `CorridorContextSection.tsx`: focused content blocks for each selected asset type
- `InteractiveTimeSeriesChart.tsx`: shared compact chart with hover, crosshair, tracked values, and expand affordance
- `ExpandedSeriesPanel.tsx`: larger multi-series analysis surface with arbitrary overlays
- `series-catalog.ts`: normalized chart-series registry used by expanded chart mode
- `Tooltip.tsx`: hover popup shell for `Market Pulse` summaries
- `label-layer.ts`: map-level label layer used for the new day-ahead price metric

## Chunk 1: Live Data Truth And Validation

### Task 1: Lock down the live dataset contract and invariants first

**Files:**
- Modify: `web/src/lib/live-data-types.ts`
- Create: `web/src/lib/live-validation.ts`
- Create: `web/src/lib/live-dashboard-edge.test.ts`

- [ ] **Step 1: Write failing tests for truth metadata and invariants**

Add tests that cover:

```ts
it('marks synthetic series as estimated instead of live', () => {
  expect(result.source).not.toBe('live');
});

it('exposes provenance metadata on every dataset envelope', () => {
  expect(result).toMatchObject({
    source: 'estimated',
    lastUpdated: expect.any(String),
    intervalStart: expect.any(String),
    intervalEnd: expect.any(String),
    hasFallback: expect.any(Boolean),
    error: null,
  });
  expect(result).toHaveProperty('provider');
});

it('verifies country outage MW matches summed plant outages', () => {
  expect(validateOutageRollup(country, plants)).toEqual([]);
});

it('flags misaligned chart windows', () => {
  expect(validateChartWindow(['2026-03-24T00:00:00Z'], [1, 2])).not.toEqual([]);
});

it('flags replay cursors outside the returned interval', () => {
  expect(
    validateReplayAlignment(
      '2026-03-24T00:00:00Z',
      '2026-03-24T01:00:00Z',
      '2026-03-24T23:00:00Z',
    ),
  ).not.toEqual([]);
});

it('requires stale datasets to retain lastUpdated provenance', () => {
  expect(
    validateDatasetEnvelope({
      dataset: 'prices',
      data: {},
      source: 'live',
      provider: 'entsoe',
      lastUpdated: null,
      intervalStart: '2026-03-24T00:00:00Z',
      intervalEnd: '2026-03-24T23:00:00Z',
      hasFallback: false,
      isStale: true,
      error: null,
    }),
  ).not.toEqual([]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- live-dashboard-edge`
Expected: FAIL on missing invariant helpers and incomplete metadata.

- [ ] **Step 3: Extend the shared live dataset contract**

Update `web/src/lib/live-data-types.ts` so all live datasets can carry:

```ts
type DatasetSource = 'live' | 'fallback' | 'estimated';

interface DatasetEnvelope<T> {
  dataset: string;
  data: T;
  source: DatasetSource;
  provider: string | null;
  lastUpdated: string | null;
  intervalStart: string | null;
  intervalEnd: string | null;
  isRefreshing?: boolean;
  isStale?: boolean;
  hasFallback: boolean;
  error: string | null;
}
```

- [ ] **Step 4: Add invariant helpers**

Implement focused validators in `web/src/lib/live-validation.ts` for:

- `validateDatasetEnvelope(envelope)` for provider, source, interval, fallback, and error-field coherence
- `validateOutageRollup(country, plants)` for plant-to-country outage consistency
- `validateChartWindow(timestampsUtc, values)` for aligned time-series windows
- `validateReplayAlignment(selectedTimestamp, intervalStart, intervalEnd)` for replay cursor bounds

- [ ] **Step 5: Re-run the tests**

Run: `npm test -- live-dashboard-edge`
Expected: PASS for the new contract and validation helpers.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/live-data-types.ts web/src/lib/live-validation.ts web/src/lib/live-dashboard-edge.test.ts
git commit -m "test: define live dataset truth model"
```

### Task 2: Replace bootstrap replay and synthetic flow profiles with true live series

**Files:**
- Modify: `web/src/lib/live-dashboard-edge.ts`
- Modify: `web/src/app/api/live/history/route.ts`
- Modify: `web/src/app/api/live/flows/route.ts`
- Modify: `web/src/lib/data-fetcher.ts`

- [ ] **Step 1: Add failing tests for live replay and live corridor hourly series**

Add tests for:

```ts
it('returns live historical price series for replay windows', () => {
  expect(history.data.countries[0].hourly.length).toBeGreaterThanOrEqual(24);
  expect(history).toMatchObject({
    source: 'live',
    hasFallback: false,
    intervalStart: expect.any(String),
    intervalEnd: expect.any(String),
  });
});

it('returns true corridor hourly series instead of a synthesized proxy', () => {
  expect(flows.data[0].hourlyFlowMW).toBeDefined();
});

it('marks bootstrap replay as fallback when live history fetch fails', () => {
  expect(history).toMatchObject({
    source: 'fallback',
    hasFallback: true,
    intervalStart: expect.any(String),
    intervalEnd: expect.any(String),
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- live-dashboard-edge`
Expected: FAIL because replay still serves bootstrap history and corridor entries do not yet expose hourly flow.

- [ ] **Step 3: Implement live historical price fetch**

In `web/src/lib/live-dashboard-edge.ts`, fetch and normalize a real historical price window for `/api/live/history`.

Rules:

- return explicit interval metadata on both live and fallback paths
- set `source: 'live'` and `hasFallback: false` when the provider history fetch succeeds
- keep bootstrap only as fallback with `source: 'fallback'` and `hasFallback: true`
- never label bootstrap replay as live

- [ ] **Step 4: Implement live hourly corridor series**

Extend the flow response model so each corridor can carry:

```ts
hourlyFlowMW: number[];
hourlyTimestampsUtc: string[];
```

Update `/api/live/flows` and the browser fetch path in `web/src/lib/data-fetcher.ts` to consume it.

- [ ] **Step 5: Re-run the tests**

Run: `npm test -- live-dashboard-edge`
Expected: PASS for history and flow-series coverage.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/live-dashboard-edge.ts web/src/app/api/live/history/route.ts web/src/app/api/live/flows/route.ts web/src/lib/data-fetcher.ts
git commit -m "feat: serve live replay and corridor series"
```

### Task 3: Upgrade outages from country summaries to plant-backed live drill-down

**Files:**
- Modify: `web/src/lib/live-dashboard-edge.ts`
- Modify: `web/src/app/api/live/outages/route.ts`
- Modify: `web/src/lib/data-fetcher.ts`

- [ ] **Step 1: Write failing tests for plant-level outage drill-down**

Add tests that expect:

```ts
it('returns plant-backed outage entries with coordinates when available', () => {
  expect(outages.data[0].topOutages[0]).toMatchObject({
    plantKey: expect.any(String),
    name: expect.any(String),
    country: expect.any(String),
    fuel: expect.any(String),
    unavailableMW: expect.any(Number),
  });
  expect(outages.data[0].topOutages[0]).toHaveProperty('outageType');
  expect(outages.data[0].topOutages[0]).toHaveProperty('expectedReturn');
  expect(outages.data[0].topOutages[0]).toHaveProperty('coordinates');
});

it('labels fallback outage detail honestly when live refresh is unavailable', () => {
  expect(outages).toMatchObject({
    source: 'fallback',
    hasFallback: true,
    error: expect.stringContaining('fallback outage detail'),
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- live-dashboard-edge`
Expected: FAIL because outage drill-down is still too shallow for the click flow.

- [ ] **Step 3: Enrich the outage model**

Extend the normalized outage entry shape to support:

- stable plant key or fallback composite key
- plant name
- country
- unavailable MW
- outage type
- expected return
- fuel
- coordinates when available

- [ ] **Step 4: Preserve honest fallback labeling**

If the Pages deployment still cannot refresh full outage detail live, make the response explicit:

```ts
source: 'fallback',
error: 'Live outage refresh unavailable; serving fallback outage detail.'
```

- [ ] **Step 5: Re-run the tests**

Run: `npm test -- live-dashboard-edge`
Expected: PASS for plant-backed outage normalization.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/live-dashboard-edge.ts web/src/app/api/live/outages/route.ts web/src/lib/data-fetcher.ts
git commit -m "feat: enrich outage data for plant drill-down"
```

## Chunk 2: Top Context Dock And Reserved Layout Lanes

### Task 4: Replace the right-side detail panel with a top context dock

**Files:**
- Create: `web/src/components/context/TopContextDock.tsx`
- Create: `web/src/components/context/CountryContextSection.tsx`
- Create: `web/src/components/context/PlantContextSection.tsx`
- Create: `web/src/components/context/CorridorContextSection.tsx`
- Create: `web/src/components/context/TopContextDock.test.tsx`
- Modify: `web/src/components/detail/DetailPanel.tsx`
- Modify: `web/src/components/detail/CountryDetail.tsx`
- Modify: `web/src/components/detail/PlantDetail.tsx`
- Modify: `web/src/components/detail/CorridorDetail.tsx`
- Modify: `web/src/components/Map.tsx`
- Modify: `web/src/lib/store.ts`

- [ ] **Step 1: Write the failing dock behavior tests**

Create tests that assert:

```ts
it('renders country detail in the top dock without hiding the rail', () => {});
it('renders plant detail in the top dock without collapsing the right rail', () => {});
it('renders corridor detail in the top dock without hiding the rail', () => {});
it('renders plant detail in the top dock after an outage selection from the rail', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- TopContextDock`
Expected: FAIL because the dock components do not exist and detail still renders in `.detail-panel`.

- [ ] **Step 3: Create the new top dock shell**

Build `TopContextDock.tsx` as the shared top-of-map surface that routes:

- country selections to `CountryContextSection`
- plant selections to `PlantContextSection`
- corridor selections to `CorridorContextSection`

Use the existing `detail` selection from Zustand instead of inventing a second selection model.
Rewire `DetailPanel.tsx` so the legacy right-side detail surface no longer renders independently after the dock ships.

- [ ] **Step 4: Stop auto-hiding the rail when detail opens**

In `web/src/components/Map.tsx` and `web/src/lib/store.ts`:

- keep `intelligenceView` active when detail is selected
- stop using `detail.kind === 'none'` as a condition for showing the rail
- stop collapsing the sidebar automatically just because detail is open, unless that behavior is still needed on mobile only

- [ ] **Step 5: Re-run the tests**

Run: `npm test -- TopContextDock`
Expected: PASS for top dock routing and persistent rail visibility.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/context web/src/components/detail/DetailPanel.tsx web/src/components/detail/CountryDetail.tsx web/src/components/detail/PlantDetail.tsx web/src/components/detail/CorridorDetail.tsx web/src/components/Map.tsx web/src/lib/store.ts
git commit -m "feat: replace side detail with top context dock"
```

### Task 5: Reserve top, right, bottom, and guide lanes so overlays stop colliding

**Files:**
- Modify: `web/src/app/globals.css`
- Modify: `web/src/components/Map.tsx`
- Modify: `web/src/components/tutorial/TourController.tsx`
- Modify: `web/src/components/tutorial/TourChecklist.tsx`
- Modify: `web/src/components/tutorial/TourSpotlight.tsx`
- Modify: `web/src/components/TimeScrubber.tsx`

- [ ] **Step 1: Add a failing layout regression test**

Create a focused component test or DOM-structure test that expects:

```ts
it('places the guide chip outside the replay lane footprint', () => {});
it('keeps the intelligence rail in a dedicated right lane', () => {});
it('keeps the guide checklist outside the replay and rail lanes', () => {});
it('separates the top dock, replay lane, and rail into non-overlapping regions', () => {});
it('repositions spotlight cards into a lane-safe placement when dock rail or replay would overlap', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- TopContextDock`
Expected: FAIL because overlay positions are still independent absolutes.

- [ ] **Step 3: Define shared lane geometry in CSS**

In `web/src/app/globals.css`, replace ad hoc offsets with shared CSS custom properties for:

- left sidebar width
- right rail width
- top dock height
- bottom replay height
- guide safe offset

Use those variables to position:

- `.right-panel`
- `.time-scrubber`
- the new top dock
- guide/checklist surfaces

- [ ] **Step 4: Make spotlight cards lane-aware**

Update `TourSpotlight.tsx` and `TourController.tsx` so the spotlight card prefers positions that avoid:

- top dock
- right rail
- replay lane

- [ ] **Step 5: Re-run the tests**

Run: `npm test -- TopContextDock`
Expected: PASS for lane-aware layout behavior.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/globals.css web/src/components/Map.tsx web/src/components/TimeScrubber.tsx web/src/components/tutorial/TourController.tsx web/src/components/tutorial/TourChecklist.tsx web/src/components/tutorial/TourSpotlight.tsx
git commit -m "fix: reserve overlay lanes for dock rail replay and guide"
```

## Chunk 3: Shared Interactive Chart System

### Task 6: Build one shared interactive compact chart component

**Files:**
- Create: `web/src/components/charts/InteractiveTimeSeriesChart.tsx`
- Create: `web/src/components/charts/InteractiveTimeSeriesChart.test.tsx`
- Modify: `web/src/components/context/CountryContextSection.tsx`
- Modify: `web/src/components/context/PlantContextSection.tsx`
- Modify: `web/src/components/context/CorridorContextSection.tsx`
- Modify: `web/src/components/detail/CountryDetail.tsx`
- Modify: `web/src/components/detail/CorridorDetail.tsx`
- Modify: `web/src/components/ForecastPanel.tsx`
- Modify: `web/src/components/AssetTimeSeries.tsx`
- Modify: `web/src/components/TimeScrubber.tsx`

- [ ] **Step 1: Write failing chart interaction tests**

Add tests that verify:

```ts
it('shows tracked timestamp and value on hover', () => {});
it('shows a crosshair and exact-value tooltip on hover', () => {});
it('renders an expand button for compact charts', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- InteractiveTimeSeriesChart`
Expected: FAIL because the shared chart component does not exist.

- [ ] **Step 3: Implement the shared compact chart**

Build `InteractiveTimeSeriesChart.tsx` with:

- crosshair
- hover tooltip
- tracked value
- optional multi-series support
- compact legend
- `Expand` action callback

Use a stable API such as:

```ts
<InteractiveTimeSeriesChart
  series={[{ id: 'fr-price', label: 'France price', values, color: '#38bdf8' }]}
  timestampsUtc={timestamps}
  mode="compact"
  onExpand={...}
/>
```

- [ ] **Step 4: Replace static mini charts**

Swap out the static SVG chart code in:

- `CountryContextSection.tsx`
- `PlantContextSection.tsx`
- `CorridorContextSection.tsx`
- `CountryDetail.tsx`
- `CorridorDetail.tsx`
- `ForecastPanel.tsx`
- `AssetTimeSeries.tsx`
- `TimeScrubber.tsx`

with the shared chart component.

- [ ] **Step 5: Re-run the tests**

Run: `npm test -- InteractiveTimeSeriesChart`
Expected: PASS for hover tracking and compact chart affordances.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/charts/InteractiveTimeSeriesChart.tsx web/src/components/charts/InteractiveTimeSeriesChart.test.tsx web/src/components/context/CountryContextSection.tsx web/src/components/context/PlantContextSection.tsx web/src/components/context/CorridorContextSection.tsx web/src/components/detail/CountryDetail.tsx web/src/components/detail/CorridorDetail.tsx web/src/components/ForecastPanel.tsx web/src/components/AssetTimeSeries.tsx web/src/components/TimeScrubber.tsx
git commit -m "feat: add shared interactive compact chart"
```

### Task 7: Add the expanded multi-series analysis panel

**Files:**
- Create: `web/src/components/charts/ExpandedSeriesPanel.tsx`
- Create: `web/src/components/charts/ExpandedSeriesPanel.test.tsx`
- Create: `web/src/components/charts/series-catalog.ts`
- Modify: `web/src/components/context/TopContextDock.tsx`
- Modify: `web/src/components/context/CountryContextSection.tsx`
- Modify: `web/src/components/context/PlantContextSection.tsx`
- Modify: `web/src/components/context/CorridorContextSection.tsx`
- Modify: `web/src/components/detail/CountryDetail.tsx`
- Modify: `web/src/components/detail/CorridorDetail.tsx`
- Modify: `web/src/components/ForecastPanel.tsx`
- Modify: `web/src/components/AssetTimeSeries.tsx`
- Modify: `web/src/components/Map.tsx`
- Modify: `web/src/components/TimeScrubber.tsx`

- [ ] **Step 1: Write failing tests for expanded chart mode**

Add tests that cover:

```ts
it('opens with context-aware default series', () => {});
it('allows adding unrelated overlay series from the catalog', () => {});
it('opens the expanded panel from a compact chart with the expected default series', () => {});
it('opens plant expansion with outage-window and country-context default series', () => {});
it('opens corridor expansion with flow utilisation and spread default series', () => {});
it('opens the shared ExpandedSeriesPanel from a TopContextDock chart via Map-owned state', () => {});
it('keeps one synchronized cursor across visible series', () => {});
it('preserves stable color assignment when series are added or removed', () => {});
it('filters the searchable series picker before adding overlays', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- ExpandedSeriesPanel`
Expected: FAIL because the expanded panel and series catalog do not exist.

- [ ] **Step 3: Build the series catalog**

Create `series-catalog.ts` with helpers that normalize selectable series across:

- country prices
- corridor flow series
- corridor utilisation and spread series
- forecast vs actual series
- plant outage and country-context series
- outage event windows when supported

- [ ] **Step 4: Implement the expanded analysis panel**

Build `ExpandedSeriesPanel.tsx` with:

- larger chart viewport
- synchronized tooltip across visible series
- searchable add/remove series picker
- stable color assignment
- close/reset controls

- [ ] **Step 5: Wire all compact charts to expand**

Use one panel surface opened from:

- country, plant, and corridor dock charts
- forecast rail charts
- replay lane chart

Add explicit `onExpand` wiring in:

- `CountryContextSection.tsx`
- `PlantContextSection.tsx`
- `CorridorContextSection.tsx`
- `CountryDetail.tsx`
- `CorridorDetail.tsx`
- `AssetTimeSeries.tsx`
- `ForecastPanel.tsx`
- `TimeScrubber.tsx`

Keep the single expanded-panel state in `Map.tsx` so dock, rail, and replay entry points all open the same analysis surface.
Have `TopContextDock.tsx` consume the shared expand handlers passed down from `Map.tsx`, and mount `ExpandedSeriesPanel` once in `Map.tsx`.

- [ ] **Step 6: Re-run the tests**

Run: `npm test -- ExpandedSeriesPanel`
Expected: PASS for default context series and arbitrary overlays.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/charts/ExpandedSeriesPanel.tsx web/src/components/charts/ExpandedSeriesPanel.test.tsx web/src/components/charts/series-catalog.ts web/src/components/context/TopContextDock.tsx web/src/components/context/CountryContextSection.tsx web/src/components/context/PlantContextSection.tsx web/src/components/context/CorridorContextSection.tsx web/src/components/detail/CountryDetail.tsx web/src/components/detail/CorridorDetail.tsx web/src/components/ForecastPanel.tsx web/src/components/AssetTimeSeries.tsx web/src/components/Map.tsx web/src/components/TimeScrubber.tsx
git commit -m "feat: add expanded multi-series analysis panel"
```

## Chunk 4: Outage Drill-Down, Map Metric, And Hover Popup

### Task 8: Wire outage radar plant clicks into map zoom and top dock detail

**Files:**
- Modify: `web/src/components/OutageRadar.tsx`
- Modify: `web/src/components/MarketIntelligenceRail.tsx`
- Modify: `web/src/components/Map.tsx`
- Modify: `web/src/components/context/PlantContextSection.tsx`

- [ ] **Step 1: Write a failing click-flow test**

Add a test that asserts:

```ts
it('clicking an outage plant selects the plant, flies the map, opens the plant dock, and keeps the rail visible', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- TopContextDock`
Expected: FAIL because outage rows are not yet wired to plant selection.

- [ ] **Step 3: Add an explicit outage item click callback**

Update `OutageRadar.tsx` so expanded outage rows can invoke:

```ts
onSelectOutagePlant(plantKey: string)
```

Pass that callback through `MarketIntelligenceRail` and `Map.tsx` to:

- select the plant
- fly to its coordinates
- open plant detail in the top dock

- [ ] **Step 4: Show outage-specific context in the plant dock**

In `PlantContextSection.tsx`, render:

- unavailable MW
- outage type
- expected return
- coordinates

- [ ] **Step 5: Re-run the tests**

Run: `npm test -- TopContextDock`
Expected: PASS for outage-to-plant drill-down behavior.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/OutageRadar.tsx web/src/components/MarketIntelligenceRail.tsx web/src/components/Map.tsx web/src/components/context/PlantContextSection.tsx
git commit -m "feat: wire outage drill-down into plant dock"
```

### Task 9: Replace the clipped generation-mix label layer with live day-ahead price

**Files:**
- Modify: `web/src/lib/layers/label-layer.ts`
- Modify: `web/src/lib/layers/index.ts`
- Modify: `web/src/components/Map.tsx`
- Modify: `web/src/components/sidebar/LayersTab.tsx`
- Modify: `web/src/lib/store.ts`
- Modify: `web/src/lib/url-hash.ts`
- Modify: `web/src/lib/workspace-presets.ts`

- [ ] **Step 1: Write a failing map-metric test**

Add a test that expects:

```ts
it('renders day-ahead price labels instead of generation-mix percentages', () => {});
it('keeps old genMix hashes and presets compatible with the country metric layer', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- Map`
Expected: FAIL because the map still builds `genMixData` labels such as `43%`.

- [ ] **Step 3: Replace the label datum model**

Rename the label layer concept from generation mix to country metric, for example:

```ts
interface CountryMetricLabelDatum {
  position: [number, number];
  text: string;
}
```

Use live day-ahead price as the text payload:

```ts
€69
```

- [ ] **Step 4: Preserve URL and preset compatibility**

If renaming the visible layer key away from `genMix`, add a backward-compat parse path in `url-hash.ts` so older hashes still work.

- [ ] **Step 5: Re-run the tests**

Run: `npm test -- Map`
Expected: PASS for live price labels, no more generation-mix percentages in the map metric layer, and old `genMix` hashes or presets still restoring the metric layer.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/layers/label-layer.ts web/src/lib/layers/index.ts web/src/components/Map.tsx web/src/components/sidebar/LayersTab.tsx web/src/lib/store.ts web/src/lib/url-hash.ts web/src/lib/workspace-presets.ts
git commit -m "feat: replace map generation metric with live day-ahead price"
```

### Task 10: Replace the hover popup with a `Market Pulse` summary

**Files:**
- Modify: `web/src/components/Tooltip.tsx`
- Modify: `web/src/components/Map.tsx`

- [ ] **Step 1: Write the failing hover-popup test**

Add a test that expects:

```ts
it('does not repeat day-ahead price inside the country hover popup', () => {});
it('shows market pulse fields for hovered countries', () => {});
it('shows the country flag and live-state label in the market pulse popup', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- Map`
Expected: FAIL because hover content still includes `Day-Ahead Price`.

- [ ] **Step 3: Redesign the tooltip payload**

For hovered countries, populate tooltip content with:

- country
- country flag
- net position
- outages MW offline
- forecast surprise when material
- live status label

Do not include price.

- [ ] **Step 4: Update the tooltip presentation**

Adjust `Tooltip.tsx` so it can render the `Market Pulse` content in a clean fixed-order layout instead of generic unordered key/value output.

- [ ] **Step 5: Re-run the tests**

Run: `npm test -- Map`
Expected: PASS for the hover popup content swap.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/Tooltip.tsx web/src/components/Map.tsx
git commit -m "feat: redesign country hover popup as market pulse"
```

## Chunk 5: Provenance, Tests, And Final Verification

### Task 11: Add provenance/debug visibility for validating visible numbers

**Files:**
- Create: `web/src/components/ProvenancePanel.tsx`
- Modify: `web/src/components/context/TopContextDock.tsx`
- Modify: `web/src/components/context/TopContextDock.test.tsx`
- Modify: `web/src/components/LiveStatusStrip.tsx`

- [ ] **Step 1: Write a failing provenance-panel test**

In `web/src/components/context/TopContextDock.test.tsx`, add tests that check:

```ts
it('shows source, provider, last-updated timestamp, interval bounds, raw selected values, and stale/fallback state for the selected context', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- TopContextDock`
Expected: FAIL because there is no provenance panel or source readout in the dock.

- [ ] **Step 3: Implement the provenance panel**

Build a small collapsible `ProvenancePanel.tsx` that can show:

- dataset source
- provider
- last updated
- interval start/end
- raw selected values
- fallback or stale flags

- [ ] **Step 4: Re-run the tests**

Run: `npm test -- TopContextDock`
Expected: PASS for provenance visibility.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ProvenancePanel.tsx web/src/components/context/TopContextDock.tsx web/src/components/context/TopContextDock.test.tsx web/src/components/LiveStatusStrip.tsx
git commit -m "feat: add provenance panel for visible metrics"
```

### Task 12: Run full verification and production-readiness checks

**Files:**
- Modify as needed: any files touched in previous tasks

- [ ] **Step 1: Run the targeted test suites**

Run:

```bash
npm test -- live-dashboard-edge
npm test -- TopContextDock
npm test -- InteractiveTimeSeriesChart
npm test -- ExpandedSeriesPanel
```

Expected: PASS.

- [ ] **Step 2: Run the full frontend suite**

Run: `npm test`
Expected: PASS with no regressions.

- [ ] **Step 3: Build the app**

Run: `npm run build`
Expected: PASS and all `/api/live/*` routes still build cleanly for Pages.

- [ ] **Step 4: Manually verify the required user flows**

Check:

- live day-ahead price labels on the map
- hover popup shows `Market Pulse` without price duplication
- country click opens top dock and keeps rail visible
- plant click opens top dock and keeps rail visible
- outage plant click zooms to plant and opens plant dock
- replay lane does not overlap guide or rail
- guide checklist does not overlap the rail
- top dock does not overlap filters or the intelligence rail
- expanded chart mode can add unrelated overlays
- provenance panel shows source, timestamp, and raw selected values
- provenance panel correctly labels stale and fallback states

- [ ] **Step 5: Commit the verification-safe final changes**

```bash
git add -A
git commit -m "feat: ship top context dock and live interactive charts"
```
