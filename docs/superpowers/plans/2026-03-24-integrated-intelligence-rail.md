# Integrated Intelligence Rail Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Luminus dashboard from build-time snapshot reads plus separate floating intelligence panels into a live runtime dashboard with a single coordinated intelligence rail, a true bottom-left market anchor, and a replayable guided tour.

**Architecture:** Add server-backed runtime endpoints inside the Next app, feed them through a shared client live-data controller, and route all right-side intelligence through one rail container. Replace the current modal onboarding with a stateful tutorial system that can drive real UI targets while preserving skip, pause, resume, and replay behavior.

**Tech Stack:** Next.js 15 App Router, React 19, Zustand, Tailwind CSS 4, deck.gl, maplibre-gl, Vitest, Testing Library

---

## File Structure

### Existing files to modify

- `web/package.json`
- `web/src/app/globals.css`
- `web/src/components/Map.tsx`
- `web/src/components/MapLegend.tsx`
- `web/src/components/OutageRadar.tsx`
- `web/src/components/ForecastPanel.tsx`
- `web/src/components/Onboarding.tsx`
- `web/src/components/sidebar/OverviewTab.tsx`
- `web/src/components/sidebar/SidebarShell.tsx`
- `web/src/lib/data-fetcher.ts`
- `web/src/lib/store.ts`

### New files to create

- `web/vitest.config.ts`
- `web/src/test/setup.ts`
- `web/src/lib/live-data-types.ts`
- `web/src/lib/live-data-store.ts`
- `web/src/lib/live-data-store.test.ts`
- `web/src/app/api/live/prices/route.ts`
- `web/src/app/api/live/flows/route.ts`
- `web/src/app/api/live/outages/route.ts`
- `web/src/app/api/live/forecasts/route.ts`
- `web/src/app/api/live/history/route.ts`
- `web/src/components/MarketIntelligenceRail.tsx`
- `web/src/components/MarketIntelligenceRail.test.tsx`
- `web/src/components/LiveStatusStrip.tsx`
- `web/src/components/tutorial/TourController.tsx`
- `web/src/components/tutorial/TourChecklist.tsx`
- `web/src/components/tutorial/TourSpotlight.tsx`
- `web/src/components/tutorial/tutorial-state.ts`
- `web/src/components/tutorial/tutorial-state.test.ts`

### Responsibility map

- `live-data-types.ts`: shared runtime payload and freshness metadata contracts
- `live-data-store.ts`: client refresh controller and stale/fallback state handling
- `api/live/*/route.ts`: runtime server endpoints for dashboard datasets
- `MarketIntelligenceRail.tsx`: single right-side intelligence surface and mode switching
- `OutageRadar.tsx` / `ForecastPanel.tsx`: embeddable rail sections instead of standalone floating panels
- `LiveStatusStrip.tsx`: visible trust cues for freshness, refresh in progress, fallback, and manual refresh
- `tutorial/*`: guided tour state, spotlight, persistent checklist, replay behavior

## Chunk 1: Test Harness And Live Data Contracts

### Task 1: Add frontend test tooling

**Files:**
- Modify: `web/package.json`
- Create: `web/vitest.config.ts`
- Create: `web/src/test/setup.ts`

- [ ] **Step 1: Add the failing test infrastructure references**

Add dev dependencies and scripts for:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Also add dev dependencies for:

```json
["vitest", "@testing-library/react", "@testing-library/jest-dom", "jsdom"]
```

- [ ] **Step 2: Add Vitest config**

Create `web/vitest.config.ts` with a browser-like DOM environment and alias support for `@/`.

Minimum structure:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 3: Add shared test setup**

Create `web/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Install and verify the harness**

Run: `npm install`
Expected: install completes and `npm test` runs without config errors, even if there are no tests yet.

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/vitest.config.ts web/src/test/setup.ts
git commit -m "test: add vitest harness for web UI"
```

### Task 2: Lock down the live-data contract first

**Files:**
- Create: `web/src/lib/live-data-types.ts`
- Create: `web/src/lib/live-data-store.test.ts`

- [ ] **Step 1: Write the failing tests for freshness state**

Create tests covering:

```ts
it('keeps last good payload when refresh fails', () => {
  expect(state.prices.hasFallback).toBe(true);
  expect(state.prices.data).toEqual(lastGoodPrices);
});

it('marks a dataset stale after the stale threshold passes', () => {
  expect(state.outages.isStale).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- live-data-store`
Expected: FAIL because `live-data-store` and the contract types do not exist yet.

- [ ] **Step 3: Create the shared contract types**

Create `web/src/lib/live-data-types.ts` with explicit dataset metadata:

```ts
export interface LiveDataset<T> {
  data: T;
  lastUpdated: string | null;
  source: 'live' | 'bootstrap' | 'fallback';
  isLoading: boolean;
  isRefreshing: boolean;
  isStale: boolean;
  hasFallback: boolean;
  error: string | null;
}
```

Also define a typed shape for the combined dashboard payload returned by runtime endpoints.

- [ ] **Step 4: Re-run the tests**

Run: `npm test -- live-data-store`
Expected: FAIL now on missing store logic rather than missing types.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/live-data-types.ts web/src/lib/live-data-store.test.ts
git commit -m "test: define live dashboard data contracts"
```

## Chunk 2: Runtime Endpoints And Client Controller

### Task 3: Create server-backed runtime endpoints

**Files:**
- Create: `web/src/app/api/live/prices/route.ts`
- Create: `web/src/app/api/live/flows/route.ts`
- Create: `web/src/app/api/live/outages/route.ts`
- Create: `web/src/app/api/live/forecasts/route.ts`
- Create: `web/src/app/api/live/history/route.ts`
- Modify: `web/src/lib/data-fetcher.ts`

- [ ] **Step 1: Write a failing endpoint smoke test plan comment in the route files**

Before implementation, stub each route to make the missing pieces obvious:

```ts
export async function GET() {
  return Response.json({ error: 'not implemented' }, { status: 501 });
}
```

- [ ] **Step 2: Implement runtime route handlers**

Each route should:

- fetch or derive the latest dataset
- return payload plus freshness metadata
- preserve a bootstrap fallback path
- never silently return demo-looking data as live

Use a shared response shape:

```ts
return Response.json({
  dataset: 'prices',
  lastUpdated,
  source,
  hasFallback,
  data,
});
```

- [ ] **Step 3: Update client fetchers to prefer runtime endpoints**

In `web/src/lib/data-fetcher.ts`, change the browser fetch targets from bundled `/data/*.json` reads to `/api/live/*` for the live dashboard path, while preserving bundled bootstrap reads as explicit fallback behavior.

- [ ] **Step 4: Verify endpoints manually**

Run: `npm run dev`
Then check:

```bash
curl http://localhost:3000/api/live/prices
curl http://localhost:3000/api/live/outages
```

Expected: `200 OK` JSON with `lastUpdated`, `source`, `hasFallback`, and `data`.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/api/live web/src/lib/data-fetcher.ts
git commit -m "feat: add runtime live data endpoints"
```

### Task 4: Build the client live-data controller and wire it into state

**Files:**
- Create: `web/src/lib/live-data-store.ts`
- Modify: `web/src/lib/store.ts`
- Modify: `web/src/components/Map.tsx`

- [ ] **Step 1: Write the failing reducer/controller tests**

Add tests for:

```ts
it('refreshes all datasets and updates timestamps', async () => {
  expect(result.current.prices.isRefreshing).toBe(false);
  expect(result.current.prices.lastUpdated).toBe('2026-03-24T09:42:00Z');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- live-data-store`
Expected: FAIL because the controller does not exist yet.

- [ ] **Step 3: Implement the controller**

Create `web/src/lib/live-data-store.ts` that:

- hydrates initial datasets
- auto-refreshes on an interval
- exposes `refreshAll()`
- tracks stale state per dataset
- retains last-good data on failure

Prefer a focused interface:

```ts
export function useLiveDataStore() {
  return {
    prices,
    flows,
    outages,
    forecasts,
    history,
    refreshAll,
  };
}
```

- [ ] **Step 4: Extend the map store minimally**

In `web/src/lib/store.ts`, add only the new state the UI actually needs:

- active intelligence rail mode
- tutorial progress/status
- live refresh status summaries if they must be globally accessible

Do not dump raw fetch orchestration into the existing Zustand store if it can stay inside the dedicated live-data controller.

- [ ] **Step 5: Replace `Map.tsx` interval polling**

In `web/src/components/Map.tsx`:

- remove direct `setInterval(loadData, REFRESH_INTERVAL)` polling against bundled fetchers
- consume the live-data controller instead
- keep the rest of the map logic stable

- [ ] **Step 6: Re-run the tests**

Run: `npm test -- live-data-store`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/live-data-store.ts web/src/lib/store.ts web/src/components/Map.tsx web/src/lib/live-data-store.test.ts
git commit -m "feat: wire live dashboard data controller"
```

## Chunk 3: Intelligence Rail And Corner Anchoring

### Task 5: Introduce the coordinated intelligence rail

**Files:**
- Create: `web/src/components/MarketIntelligenceRail.tsx`
- Create: `web/src/components/MarketIntelligenceRail.test.tsx`
- Modify: `web/src/components/OutageRadar.tsx`
- Modify: `web/src/components/ForecastPanel.tsx`
- Modify: `web/src/components/TraderDashboard.tsx`
- Modify: `web/src/components/Map.tsx`
- Modify: `web/src/app/globals.css`

- [ ] **Step 1: Write the failing rail tests**

Cover:

```ts
it('renders outage mode inside one shared rail container', () => {
  expect(screen.getByText('Outage Radar')).toBeInTheDocument();
  expect(screen.getAllByTestId('market-intelligence-rail')).toHaveLength(1);
});

it('switches from outage mode to forecast mode without mounting a second panel', () => {
  expect(screen.getByText('Forecast vs Actual')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the rail tests to verify they fail**

Run: `npm test -- MarketIntelligenceRail`
Expected: FAIL because the rail does not exist yet.

- [ ] **Step 3: Create `MarketIntelligenceRail.tsx`**

The rail should:

- own one stable absolute position on desktop
- render as one bottom sheet on mobile
- switch internal content by mode
- host the live status strip at the top

- [ ] **Step 4: Refactor `OutageRadar.tsx` and `ForecastPanel.tsx`**

Change them from absolute panel components into embeddable rail sections.

Remove their independent absolute positioning responsibility. Keep their content logic.

- [ ] **Step 5: Route all right-side intelligence through the rail**

In `Map.tsx`, replace separate `OutageRadar`, `ForecastPanel`, and conflicting right-side mode handling with one rail mount.

Keep the rail mode driven by:

- layer toggles
- brief/dashboard actions
- close behavior

- [ ] **Step 6: Re-run the rail tests**

Run: `npm test -- MarketIntelligenceRail`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add web/src/components/MarketIntelligenceRail.tsx web/src/components/MarketIntelligenceRail.test.tsx web/src/components/OutageRadar.tsx web/src/components/ForecastPanel.tsx web/src/components/TraderDashboard.tsx web/src/components/Map.tsx web/src/app/globals.css
git commit -m "feat: unify dashboard intelligence into one rail"
```

### Task 6: Snap the bottom-left card to the real corner

**Files:**
- Modify: `web/src/components/MapLegend.tsx`
- Modify: `web/src/app/globals.css`

- [ ] **Step 1: Write a failing layout assertion**

Add a component test or snapshot-oriented assertion that the desktop class/style no longer uses a hardcoded sidebar offset.

Example assertion:

```ts
expect(legend).not.toHaveStyle({ left: '304px' });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- MapLegend`
Expected: FAIL because the legacy offset is still present.

- [ ] **Step 3: Update the desktop anchor behavior**

In `globals.css`, replace the default desktop `left: 304px` behavior with a true lower-left anchor and only introduce collision-aware shifting if the sidebar actually overlaps.

If collision logic requires JS instead of pure CSS, keep the detection isolated and minimal.

- [ ] **Step 4: Update the legend/card trust cues**

In `MapLegend.tsx`, add optional compact freshness signaling only if it improves clarity and does not turn the component into another busy card.

- [ ] **Step 5: Re-run the test**

Run: `npm test -- MapLegend`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/components/MapLegend.tsx web/src/app/globals.css
git commit -m "fix: anchor market legend to viewport corner"
```

## Chunk 4: Guided Tutorial System

### Task 7: Replace the modal onboarding with resumable tutorial state

**Files:**
- Create: `web/src/components/tutorial/tutorial-state.ts`
- Create: `web/src/components/tutorial/tutorial-state.test.ts`
- Create: `web/src/components/tutorial/TourController.tsx`
- Create: `web/src/components/tutorial/TourChecklist.tsx`
- Create: `web/src/components/tutorial/TourSpotlight.tsx`
- Modify: `web/src/components/Onboarding.tsx`
- Modify: `web/src/components/Map.tsx`
- Modify: `web/src/lib/store.ts`

- [ ] **Step 1: Write the failing tutorial state tests**

Cover:

```ts
it('persists skipped state and exposes replay', () => {
  expect(loadTutorialState().status).toBe('skipped');
});

it('keeps the current step when the user pauses to explore', () => {
  expect(state.mode).toBe('paused');
  expect(state.currentStep).toBe(3);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tutorial-state`
Expected: FAIL because the tutorial state model does not exist yet.

- [ ] **Step 3: Implement tutorial state**

Create a storage-backed state model for:

- `idle`
- `welcome`
- `running`
- `paused`
- `completed`
- `skipped`

Store:

- current step index
- completed steps
- dismissal/replay flags

- [ ] **Step 4: Build the tutorial UI pieces**

Create:

- `TourController.tsx` for orchestration
- `TourSpotlight.tsx` for attached callouts
- `TourChecklist.tsx` for paused/non-blocking guidance

Rewrite `Onboarding.tsx` to become the entry point for the new system instead of the old static modal.

- [ ] **Step 5: Integrate the tutorial with real UI actions**

In `Map.tsx`, wire tutorial steps so they can:

- switch sidebar tabs
- toggle relevant layers
- open the intelligence rail in the right mode
- target country/corridor interactions

Keep these effects explicit and reversible so pause/skip does not leave the app in a broken state.

- [ ] **Step 6: Re-run the tutorial tests**

Run: `npm test -- tutorial-state`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add web/src/components/tutorial web/src/components/Onboarding.tsx web/src/components/Map.tsx web/src/lib/store.ts
git commit -m "feat: add guided replayable onboarding tour"
```

### Task 8: Add replay entry and trust surfaces to the sidebar

**Files:**
- Modify: `web/src/components/sidebar/OverviewTab.tsx`
- Modify: `web/src/components/sidebar/SidebarShell.tsx`
- Create: `web/src/components/LiveStatusStrip.tsx`
- Modify: `web/src/components/MarketIntelligenceRail.tsx`

- [ ] **Step 1: Write the failing UI tests**

Cover:

```ts
it('shows a replay tour action after skip or completion', () => {
  expect(screen.getByRole('button', { name: /replay tour/i })).toBeVisible();
});

it('renders live freshness details in the rail header', () => {
  expect(screen.getByText(/auto-refresh/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- MarketIntelligenceRail OverviewTab`
Expected: FAIL because replay and live-status UI are not present yet.

- [ ] **Step 3: Add the replay entry**

Place `Replay tour` somewhere durable and obvious, preferably in `OverviewTab.tsx` or a small help/tutorial block.

- [ ] **Step 4: Add the shared live status strip**

Create `LiveStatusStrip.tsx` and mount it at the top of the intelligence rail.

It should expose:

- fresh vs stale
- last updated
- refresh in progress
- manual refresh action

- [ ] **Step 5: Re-run the tests**

Run: `npm test -- MarketIntelligenceRail OverviewTab`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/components/sidebar/OverviewTab.tsx web/src/components/sidebar/SidebarShell.tsx web/src/components/LiveStatusStrip.tsx web/src/components/MarketIntelligenceRail.tsx
git commit -m "feat: add live trust cues and replay tour entry"
```

## Chunk 5: End-To-End Verification And Cleanup

### Task 9: Run targeted verification

**Files:**
- Modify as needed from previous tasks only

- [ ] **Step 1: Run unit and component tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 2: Run a production build**

Run: `npm run build`
Expected: PASS with the new runtime endpoints, rail components, and tutorial system included.

- [ ] **Step 3: Manual QA in dev mode**

Run: `npm run dev`

Verify manually:

- live endpoints refresh data
- manual refresh updates status text
- stale/fallback state is visible
- the right rail never duplicates or overlaps
- the bottom-left market card is in the true corner on desktop
- mobile rail becomes a bottom sheet cleanly
- the tutorial can start, pause, skip, resume, and replay

- [ ] **Step 4: Clean temporary artifacts**

Remove any local-only brainstorm or scratch files before finalizing.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: ship live intelligence rail and guided onboarding"
```
