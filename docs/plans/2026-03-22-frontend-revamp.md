# Frontend Revamp Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete visual overhaul of the Luminus European energy grid dashboard to fix color channel overload, sidebar hierarchy, panel inconsistency, flow directionality, and missing legend/onboarding.

**Architecture:** Decompose the monolithic 1200-line Map.tsx into focused modules. Introduce a unified DetailPanel system with consistent skeleton across all entity types. Decouple visual channels so price owns color, flows own thickness+animation, and plants own shape. Add Zustand for state management to replace the 20+ useState calls.

**Tech Stack:** Next.js 15, React 19, Deck.gl 9.1, MapLibre GL 4.7, Tailwind CSS 4, Zustand (new), @deck.gl/mesh-layers (new for animated flows)

---

## Phase 1: Foundation (State Management + Component Decomposition)

Break apart Map.tsx and introduce proper state management before touching visuals.

### Task 1: Install Zustand and Create Map Store

**Files:**
- Modify: `web/package.json`
- Create: `web/src/lib/store.ts`

**Step 1: Install Zustand**

Run: `cd C:/Users/skf_s/luminus/web && npm install zustand`
Expected: Added 1 package

**Step 2: Create the store**

```typescript
// web/src/lib/store.ts
import { create } from 'zustand';
import type { PowerPlant, CountryPrice, CrossBorderFlow, TransmissionLine, CountryOutage, CountryForecast, PriceHistory } from './data-fetcher';
import type { TyndpProject } from './tyndp';

// --- Layer keys ---
export type LayerKey = 'plants' | 'prices' | 'flows' | 'lines' | 'tyndp' | 'genMix' | 'outages' | 'forecast' | 'history';

// --- Detail panel discriminated union ---
export type DetailSelection =
  | { kind: 'none' }
  | { kind: 'country'; data: CountryPrice }
  | { kind: 'corridor'; data: CrossBorderFlow }
  | { kind: 'plant'; data: PowerPlant }
  | { kind: 'tyndp'; data: TyndpProject };

// --- View state ---
export interface ViewState {
  latitude: number;
  longitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

// --- Focus mode ---
// When a layer is "focused", conflicting layers auto-dim
export type FocusMode = 'none' | 'prices' | 'flows' | 'plants';

interface MapState {
  // Data
  plants: PowerPlant[];
  prices: CountryPrice[];
  flows: CrossBorderFlow[];
  transmissionLines: TransmissionLine[];
  outages: CountryOutage[];
  forecasts: CountryForecast[];
  history: PriceHistory | null;
  isLoading: boolean;
  lastUpdate: string;

  // View
  viewState: ViewState;
  isMobile: boolean;

  // Layers
  layerVisibility: Record<LayerKey, boolean>;
  focusMode: FocusMode;

  // Filters
  selectedFuels: Set<string>;
  minCapacity: number;
  selectedCountries: Set<string> | null;

  // Detail panel (unified)
  detail: DetailSelection;

  // Compare mode
  compareCountries: string[];

  // UI panels
  sidebarOpen: boolean;
  sidebarTab: 'overview' | 'layers' | 'filters';

  // Actions
  setData: (data: Partial<Pick<MapState, 'plants' | 'prices' | 'flows' | 'transmissionLines' | 'outages' | 'forecasts' | 'history'>>) => void;
  setLoading: (loading: boolean) => void;
  setLastUpdate: (update: string) => void;
  setViewState: (vs: ViewState) => void;
  setIsMobile: (mobile: boolean) => void;
  toggleLayer: (layer: LayerKey) => void;
  setFocusMode: (mode: FocusMode) => void;
  toggleFuel: (fuel: string) => void;
  setMinCapacity: (cap: number) => void;
  toggleCountry: (code: string, allCodes: string[]) => void;
  selectAllCountries: () => void;
  clearCountries: () => void;
  selectDetail: (detail: DetailSelection) => void;
  clearDetail: () => void;
  toggleCompareCountry: (iso2: string) => void;
  clearCompare: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarTab: (tab: 'overview' | 'layers' | 'filters') => void;
}

const DEFAULT_LAYER_VISIBILITY: Record<LayerKey, boolean> = {
  plants: true,
  prices: true,
  flows: true,
  lines: true,
  tyndp: false,
  genMix: true,
  outages: false,
  forecast: false,
  history: false,
};

const DEFAULT_VIEW: ViewState = {
  latitude: 50.5,
  longitude: 10.0,
  zoom: 4,
  pitch: 20,
  bearing: 0,
};

export const useMapStore = create<MapState>((set) => ({
  // Data
  plants: [],
  prices: [],
  flows: [],
  transmissionLines: [],
  outages: [],
  forecasts: [],
  history: null,
  isLoading: true,
  lastUpdate: 'loading...',

  // View
  viewState: DEFAULT_VIEW,
  isMobile: false,

  // Layers
  layerVisibility: DEFAULT_LAYER_VISIBILITY,
  focusMode: 'none',

  // Filters
  selectedFuels: new Set(['nuclear', 'wind', 'solar', 'gas', 'coal', 'hydro', 'other']),
  minCapacity: 50,
  selectedCountries: null,

  // Detail
  detail: { kind: 'none' },

  // Compare
  compareCountries: [],

  // UI
  sidebarOpen: false,
  sidebarTab: 'overview',

  // Actions
  setData: (data) => set((state) => ({ ...state, ...data })),
  setLoading: (isLoading) => set({ isLoading }),
  setLastUpdate: (lastUpdate) => set({ lastUpdate }),
  setViewState: (viewState) => set({ viewState }),
  setIsMobile: (isMobile) => set({ isMobile }),

  toggleLayer: (layer) =>
    set((state) => ({
      layerVisibility: { ...state.layerVisibility, [layer]: !state.layerVisibility[layer] },
    })),

  setFocusMode: (focusMode) => set({ focusMode }),

  toggleFuel: (fuel) =>
    set((state) => {
      const next = new Set(state.selectedFuels);
      if (next.has(fuel)) next.delete(fuel);
      else next.add(fuel);
      return { selectedFuels: next };
    }),

  setMinCapacity: (minCapacity) => set({ minCapacity }),

  toggleCountry: (code, allCodes) =>
    set((state) => {
      const next = new Set(state.selectedCountries ?? allCodes);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return { selectedCountries: next.size === allCodes.length ? null : next };
    }),

  selectAllCountries: () => set({ selectedCountries: null }),
  clearCountries: () => set({ selectedCountries: new Set() }),

  selectDetail: (detail) => set({ detail }),
  clearDetail: () => set({ detail: { kind: 'none' } }),

  toggleCompareCountry: (iso2) =>
    set((state) => {
      if (state.compareCountries.includes(iso2)) {
        return { compareCountries: state.compareCountries.filter((c) => c !== iso2) };
      }
      if (state.compareCountries.length >= 4) return state;
      return { compareCountries: [...state.compareCountries, iso2] };
    }),

  clearCompare: () => set({ compareCountries: [] }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
}));
```

**Step 3: Verify the store compiles**

Run: `cd C:/Users/skf_s/luminus/web && npx tsc --noEmit src/lib/store.ts 2>&1 | head -5`
Expected: No errors (or import-only errors that resolve in full build)

**Step 4: Commit**

```bash
cd C:/Users/skf_s/luminus
git add web/package.json web/package-lock.json web/src/lib/store.ts
git commit -m "feat: add Zustand store for centralized map state management"
```

---

### Task 2: Extract Layer Factory Functions from Map.tsx

**Files:**
- Create: `web/src/lib/layers/price-layer.ts`
- Create: `web/src/lib/layers/flow-layer.ts`
- Create: `web/src/lib/layers/plant-layer.ts`
- Create: `web/src/lib/layers/line-layer.ts`
- Create: `web/src/lib/layers/label-layer.ts`
- Create: `web/src/lib/layers/tyndp-layer.ts`
- Create: `web/src/lib/layers/index.ts`

Extract each Deck.gl layer from the monolithic `layers` useMemo in Map.tsx (lines 540-933) into individual factory functions. Each factory takes data + callbacks and returns a Deck.gl layer instance.

**Step 1: Create the layers directory**

Run: `mkdir -p C:/Users/skf_s/luminus/web/src/lib/layers`

**Step 2: Extract price heatmap layer**

```typescript
// web/src/lib/layers/price-layer.ts
import { GeoJsonLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import { priceToColor } from '../colors';
import { COUNTRY_CENTROIDS } from '../countries';
import type { CountryPrice } from '../data-fetcher';

interface PriceLayerOptions {
  geoJson: any;
  priceLookup: Map<string, CountryPrice>;
  onHover: (info: { x: number; y: number; iso: string; name: string; price: number | null } | null) => void;
  onClick: (iso: string) => void;
  opacity?: number;
}

export function createPriceLayer({ geoJson, priceLookup, onHover, onClick, opacity = 200 }: PriceLayerOptions) {
  return new GeoJsonLayer({
    id: 'price-heatmap',
    data: geoJson,
    filled: true,
    stroked: true,
    getFillColor: (f: any) => {
      const iso = f.properties?.ISO_A2 || '';
      const priceData = priceLookup.get(iso);
      if (!priceData) return [60, 60, 80, 120];
      const color = priceToColor(priceData.price);
      return [color[0], color[1], color[2], opacity] as [number, number, number, number];
    },
    getLineColor: [100, 120, 140, 80],
    getLineWidth: 1,
    lineWidthMinPixels: 0.5,
    pickable: true,
    autoHighlight: true,
    highlightColor: [56, 189, 248, 60],
    updateTriggers: { getFillColor: [priceLookup, opacity] },
    onHover: (info: PickingInfo) => {
      if (!info.object) { onHover(null); return; }
      const props = info.object.properties || {};
      const iso = props.ISO_A2 || '';
      const priceData = priceLookup.get(iso);
      const name = COUNTRY_CENTROIDS[iso]?.name || props.name || iso;
      onHover({ x: info.x, y: info.y, iso, name, price: priceData?.price ?? null });
    },
    onClick: (info: PickingInfo) => {
      const iso = info.object?.properties?.ISO_A2 || '';
      if (iso) onClick(iso);
    },
  });
}
```

**Step 3: Extract flow arc layer** (key change: neutral color, thickness = magnitude)

```typescript
// web/src/lib/layers/flow-layer.ts
import { ArcLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import { COUNTRY_CENTROIDS } from '../countries';
import type { CrossBorderFlow, CountryPrice } from '../data-fetcher';

interface FlowLayerOptions {
  flows: CrossBorderFlow[];
  priceLookup: Map<string, CountryPrice>;
  onHover: (info: any) => void;
  onClick: (flow: CrossBorderFlow) => void;
}

// NEW: Neutral color for arcs — no longer competing with price choropleth
const FLOW_ARC_COLOR: [number, number, number, number] = [200, 210, 230, 180];
const FLOW_ARC_HIGHLIGHT: [number, number, number, number] = [255, 255, 255, 60];

export function createFlowLayer({ flows, priceLookup, onHover, onClick }: FlowLayerOptions) {
  return new ArcLayer<CrossBorderFlow>({
    id: 'cross-border-flows',
    data: flows,
    getSourcePosition: (d) => [d.fromLon, d.fromLat],
    getTargetPosition: (d) => [d.toLon, d.toLat],
    // Neutral white/light gray — thickness encodes magnitude
    getSourceColor: FLOW_ARC_COLOR,
    getTargetColor: FLOW_ARC_COLOR,
    // Width proportional to flow magnitude
    getWidth: (d) => Math.max(1, d.flowMW / 400),
    widthMinPixels: 1.5,
    widthMaxPixels: 10,
    greatCircle: true,
    pickable: true,
    autoHighlight: true,
    highlightColor: FLOW_ARC_HIGHLIGHT,
    onHover: (info: PickingInfo<CrossBorderFlow>) => {
      if (!info.object) { onHover(null); return; }
      const d = info.object;
      const fromName = COUNTRY_CENTROIDS[d.from]?.name || d.from;
      const toName = COUNTRY_CENTROIDS[d.to]?.name || d.to;
      const util = d.capacityMW > 0 ? d.flowMW / d.capacityMW : 0;
      const fp = priceLookup.get(d.from);
      const tp = priceLookup.get(d.to);
      const spread = fp && tp ? (tp.price - fp.price).toFixed(1) : null;
      onHover({
        x: info.x, y: info.y,
        content: {
          Flow: `${fromName} \u2192 ${toName}`,
          MW: d.flowMW.toLocaleString(),
          Utilisation: `${(util * 100).toFixed(0)}%`,
          ...(spread != null && { Spread: `${parseFloat(spread) >= 0 ? '+' : ''}\u20ac${spread}/MWh` }),
        },
      });
    },
    onClick: (info: PickingInfo<CrossBorderFlow>) => {
      if (info.object) onClick(info.object);
    },
  });
}
```

**Step 4: Create barrel export**

```typescript
// web/src/lib/layers/index.ts
export { createPriceLayer } from './price-layer';
export { createFlowLayer } from './flow-layer';
// Additional layer factories will be added in subsequent tasks
```

**Step 5: Commit**

```bash
cd C:/Users/skf_s/luminus
git add web/src/lib/layers/
git commit -m "refactor: extract Deck.gl layer factories from Map.tsx"
```

---

### Task 3: Extract Remaining Layer Factories (plants, lines, labels, TYNDP)

**Files:**
- Create: `web/src/lib/layers/plant-layer.ts`
- Create: `web/src/lib/layers/line-layer.ts`
- Create: `web/src/lib/layers/label-layer.ts`
- Create: `web/src/lib/layers/tyndp-layer.ts`
- Modify: `web/src/lib/layers/index.ts`

Follow the same pattern as Task 2 for the remaining 4 layer types. Each factory function receives data + callbacks and returns a Deck.gl layer.

Key design changes to implement during extraction:
- **Plant layer:** Use `radiusUnits: 'pixels'` for consistent sizing. Remove color-based fuel encoding (will be replaced with shape encoding in Phase 2).
- **Line layer:** Same stress coloring but dimmed when focusMode !== 'lines'.
- **Label layer:** Both gen-mix labels and spread labels extracted.
- **TYNDP layer:** Same as current but extracted.

**Step 1: Create plant-layer.ts, line-layer.ts, label-layer.ts, tyndp-layer.ts**

(Follow the extraction pattern from Task 2 — move the layer construction code from Map.tsx lines 797-917 into individual files)

**Step 2: Update barrel export**

```typescript
// web/src/lib/layers/index.ts
export { createPriceLayer } from './price-layer';
export { createFlowLayer } from './flow-layer';
export { createPlantLayer } from './plant-layer';
export { createLineLayer } from './line-layer';
export { createGenMixLabelLayer, createSpreadLabelLayer } from './label-layer';
export { createTyndpLayer } from './tyndp-layer';
```

**Step 3: Verify compilation**

Run: `cd C:/Users/skf_s/luminus/web && npx tsc --noEmit 2>&1 | head -10`

**Step 4: Commit**

```bash
cd C:/Users/skf_s/luminus
git add web/src/lib/layers/
git commit -m "refactor: extract all Deck.gl layer factories"
```

---

## Phase 2: Visual Channel Decoupling

The core visual fix: stop all layers fighting for the same color channel.

### Task 4: Decouple Flow Arcs from Color Channel

**Files:**
- Modify: `web/src/lib/layers/flow-layer.ts`
- Modify: `web/src/lib/colors.ts`

**Problem:** Arcs currently use green/yellow/red utilisation coloring, which competes with the price heatmap's green/yellow/red.

**Solution:** Arcs use a single neutral color (light gray/white). Magnitude is encoded via thickness. Direction will be animated in Task 8.

**Step 1: Verify flow-layer.ts already uses neutral color**

(Done in Task 2 — the extracted flow layer uses `FLOW_ARC_COLOR = [200, 210, 230, 180]`)

**Step 2: Update the width scaling for better magnitude encoding**

```typescript
// In flow-layer.ts, replace getWidth with tiered encoding:
getWidth: (d) => {
  const mw = d.flowMW;
  if (mw > 5000) return 8;
  if (mw > 2000) return 6;
  if (mw > 500) return 4;
  return 2;
},
```

**Step 3: Remove stress coloring from line-layer.ts too**

Transmission lines should use voltage-based opacity (400kV brighter, 220kV dimmer), not stress colors. Stress information moves to the tooltip and detail panel.

```typescript
// In line-layer.ts, replace lineStressColor:
const lineColor = (d: TransmissionLine): [number, number, number, number] => {
  return d.voltage >= 400
    ? [140, 160, 190, 140]  // brighter for high-voltage
    : [90, 110, 140, 100];  // dimmer for lower voltage
};
```

**Step 4: Verify build**

Run: `cd C:/Users/skf_s/luminus/web && npx next build 2>&1 | tail -5`

**Step 5: Commit**

```bash
cd C:/Users/skf_s/luminus
git add web/src/lib/layers/flow-layer.ts web/src/lib/layers/line-layer.ts
git commit -m "fix: decouple flow arcs and lines from price color channel

Arcs now use neutral gray with thickness encoding magnitude.
Lines use voltage-based opacity instead of stress colors."
```

---

### Task 5: Implement Layer Focus/Dimming System

**Files:**
- Modify: `web/src/lib/store.ts`
- Modify: `web/src/lib/layers/price-layer.ts`
- Modify: `web/src/lib/layers/plant-layer.ts`
- Create: `web/src/lib/layers/focus.ts`

**Problem:** When flows are active, thousands of plant dots are irrelevant clutter. When analyzing a country price, flow arcs distract.

**Solution:** Introduce `focusMode` that auto-dims non-focused layers. Toggling a layer ON when others conflict doesn't hide them — it reduces their opacity to 30%.

**Step 1: Create focus utility**

```typescript
// web/src/lib/layers/focus.ts

import type { FocusMode } from '../store';

/**
 * Returns the effective opacity (0-255) for a layer given the current focus mode.
 * Focused layer gets full opacity, others get dimmed.
 */
export function layerOpacity(
  layer: 'prices' | 'flows' | 'plants' | 'lines' | 'tyndp' | 'labels',
  focusMode: FocusMode
): number {
  if (focusMode === 'none') return 200; // Default: all layers visible

  const focusMap: Record<FocusMode, string[]> = {
    none: [],
    prices: ['prices', 'labels'],
    flows: ['flows', 'lines', 'labels'],
    plants: ['plants'],
  };

  const focused = focusMap[focusMode] || [];
  return focused.includes(layer) ? 220 : 60; // Focused vs dimmed
}
```

**Step 2: Wire focus into layer factories**

Each layer factory already accepts an `opacity` parameter (added in Task 2). The Map component passes `layerOpacity(...)` as the opacity.

**Step 3: Add auto-focus on layer toggle**

In the store's `toggleLayer` action, set focusMode based on what the user just enabled. If they toggle flows ON while plants are visible, set focusMode to 'flows'. If they toggle flows OFF, reset to 'none'.

**Step 4: Commit**

```bash
cd C:/Users/skf_s/luminus
git add web/src/lib/layers/focus.ts web/src/lib/store.ts web/src/lib/layers/
git commit -m "feat: add layer focus/dimming system

When a layer is focused, competing layers auto-dim to 30% opacity.
Prevents visual spaghetti in dense areas like central Europe."
```

---

### Task 6: Update Price Heatmap Color Scale for Dark Theme

**Files:**
- Modify: `web/src/lib/colors.ts`

**Problem:** Current green-yellow-red is too saturated on the dark base map, and the green blends into flow arc colors (which used to also be green/red).

**Solution:** Refined dark-mode palette with slightly desaturated, higher-luminance colors. Tested against WCAG 3:1 graphic contrast.

**Step 1: Update priceToColor function**

```typescript
// Replace the priceToColor function in colors.ts:
export function priceToColor(
  price: number,
  minPrice: number = 0,
  maxPrice: number = 200
): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, (price - minPrice) / (maxPrice - minPrice)));

  // Dark-mode optimised: slightly desaturated, higher luminance
  // Negative prices: teal
  if (price < 0) return [13, 148, 136, 200];

  if (t < 0.15) return [34, 197, 94, 200];    // Green: low price
  if (t < 0.3)  return [163, 230, 53, 200];   // Yellow-green: moderate-low
  if (t < 0.5)  return [234, 179, 8, 200];    // Amber: moderate
  if (t < 0.75) return [249, 115, 22, 200];   // Orange: high
  return [239, 68, 68, 200];                    // Red: extreme
}
```

**Step 2: Commit**

```bash
cd C:/Users/skf_s/luminus
git add web/src/lib/colors.ts
git commit -m "fix: dark-mode optimised price heatmap color scale

Desaturated + higher luminance for dark backgrounds.
Stepped palette (teal/green/amber/orange/red) replaces continuous interpolation."
```

---

## Phase 3: Sidebar Redesign

### Task 7: Rebuild Sidebar with Collapsible Sections and Tabbed Navigation

**Files:**
- Create: `web/src/components/sidebar/SidebarShell.tsx`
- Create: `web/src/components/sidebar/OverviewTab.tsx`
- Create: `web/src/components/sidebar/LayersTab.tsx`
- Create: `web/src/components/sidebar/FiltersTab.tsx`
- Create: `web/src/components/sidebar/SidebarHeader.tsx`
- Modify: `web/src/components/Sidebar.tsx` (replace contents, re-export from new modules)
- Modify: `web/src/app/globals.css`

**Problem:** Everything stacked vertically with equal weight. No hierarchy. "50% Bottleneck" has no context. Sidebar is both control panel and dashboard, mediocre at both.

**Solution:**
1. Three tabs: Overview (summary stats), Layers (toggle + legend), Filters (fuel, capacity, country)
2. Overview tab shows 3 key metrics with contextual indicators (good/bad)
3. Collapsible sidebar to icon rail on desktop, bottom sheet on mobile
4. Search bar persists above tabs

**Step 1: Create sidebar directory**

Run: `mkdir -p C:/Users/skf_s/luminus/web/src/components/sidebar`

**Step 2: Build SidebarShell with tab navigation**

```typescript
// web/src/components/sidebar/SidebarShell.tsx
'use client';

import { useMapStore } from '@/lib/store';
import SidebarHeader from './SidebarHeader';
import OverviewTab from './OverviewTab';
import LayersTab from './LayersTab';
import FiltersTab from './FiltersTab';
import SearchBar from '../SearchBar';

const CARD = 'bg-black/60 backdrop-blur-xl border border-white/[0.06] rounded-2xl shadow-2xl';

const TABS = [
  { key: 'overview' as const, label: 'Overview', icon: 'M4 6h16M4 12h16M4 18h16' },
  { key: 'layers' as const, label: 'Layers', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  { key: 'filters' as const, label: 'Filters', icon: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z' },
] as const;

export default function SidebarShell() {
  const { sidebarTab, setSidebarTab, sidebarOpen, setSidebarOpen } = useMapStore();

  return (
    <div className="absolute inset-0 z-20 md:z-10 pointer-events-none">
      <div className={`relative m-4 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 pointer-events-auto max-h-[calc(100vh-2rem)] overflow-y-auto sidebar-scroll transition-all duration-200 ease-out md:translate-x-0 ${
        sidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-[calc(100%+1rem)] opacity-0 md:opacity-100'
      }`}>
        <SidebarHeader />

        {/* Search — always visible */}
        <div className={`${CARD} p-3`}>
          <SearchBar />
        </div>

        {/* Tab navigation */}
        <div className={`${CARD} p-1.5`}>
          <div className="flex gap-1">
            {TABS.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setSidebarTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl text-[11px] font-medium transition-all ${
                  sidebarTab === key
                    ? 'bg-white/[0.08] text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={icon} />
                </svg>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        {sidebarTab === 'overview' && <OverviewTab />}
        {sidebarTab === 'layers' && <LayersTab />}
        {sidebarTab === 'filters' && <FiltersTab />}
      </div>
    </div>
  );
}
```

**Step 3: Build OverviewTab with contextual metrics**

The Overview tab shows 3 primary metrics with good/bad context:
- Avg Price (with trend indicator)
- Grid Utilisation (with severity color and explanation)
- Total Online Capacity

The "50% Bottleneck" stat becomes "Grid Utilisation: 50%" with a contextual label like "Normal" (green) / "Stressed" (amber) / "Congested" (red).

**Step 4: Build LayersTab with integrated mini-legends**

Each layer toggle shows what it means right next to the toggle:
- Price Heatmap toggle + inline color bar legend
- Cross-border Flows toggle + inline thickness legend
- Power Plants toggle + inline fuel type legend
- etc.

This solves the "what am I looking at" problem directly in the layer controls.

**Step 5: Build FiltersTab**

Fuel pills, capacity slider, country filter — same as current but in its own tab.

**Step 6: Update Sidebar.tsx to re-export**

```typescript
// web/src/components/Sidebar.tsx
export { default } from './sidebar/SidebarShell';
export type { LayerKey } from '@/lib/store';
```

**Step 7: Commit**

```bash
cd C:/Users/skf_s/luminus
git add web/src/components/sidebar/ web/src/components/Sidebar.tsx
git commit -m "feat: redesign sidebar with tabbed navigation and hierarchy

Three tabs: Overview (key metrics), Layers (toggles + legends), Filters.
Contextual indicators for bottleneck stat.
Mini-legends integrated into layer toggles."
```

---

## Phase 4: Unified Detail Panel System

### Task 8: Create Unified DetailPanel Component

**Files:**
- Create: `web/src/components/detail/DetailPanel.tsx`
- Create: `web/src/components/detail/CountryDetail.tsx`
- Create: `web/src/components/detail/CorridorDetail.tsx`
- Create: `web/src/components/detail/PlantDetail.tsx`
- Create: `web/src/components/detail/TyndpDetail.tsx`
- Create: `web/src/components/detail/DetailHeader.tsx`
- Create: `web/src/components/detail/KpiRow.tsx`
- Create: `web/src/components/detail/MiniChart.tsx`

**Problem:** Country click shows a tiny sparkline tooltip. Corridor click shows a Bloomberg-grade panel. Plant click shows a specs list. Three different interaction patterns.

**Solution:** All entity types share the same panel skeleton:
```
[Header with entity name + close button]
[KPI row: 2-4 key metrics with contextual coloring]
[Primary chart: time series or breakdown]
[Related entities: list with links]
```

**Step 1: Create shared components**

```typescript
// web/src/components/detail/DetailHeader.tsx
'use client';

interface DetailHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClose: () => void;
  onBack?: () => void; // For breadcrumb navigation
}

export default function DetailHeader({ icon, title, subtitle, onClose, onBack }: DetailHeaderProps) {
  return (
    <div className="flex items-start gap-3 mb-4">
      {onBack && (
        <button onClick={onBack} className="text-slate-500 hover:text-white transition-colors mt-1" aria-label="Back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        {icon}
        <div className="min-w-0">
          <h2 className="text-base font-bold text-white leading-tight truncate">{title}</h2>
          <p className="text-[11px] text-slate-400 truncate">{subtitle}</p>
        </div>
      </div>
      <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors flex-shrink-0" aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
```

```typescript
// web/src/components/detail/KpiRow.tsx
'use client';

interface Kpi {
  label: string;
  value: string;
  color?: string;     // Override text color
  sublabel?: string;  // e.g. "MW" or "EUR/MWh"
  bar?: { pct: number; color: string }; // Optional progress bar
}

export default function KpiRow({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className={`grid grid-cols-${Math.min(kpis.length, 4)} gap-2 mb-4`}>
      {kpis.map((kpi) => (
        <div key={kpi.label} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{kpi.label}</p>
          <p className="text-lg font-bold tabular-nums" style={{ color: kpi.color || '#e2e8f0' }}>
            {kpi.value}
          </p>
          {kpi.sublabel && <p className="text-[10px] text-slate-500">{kpi.sublabel}</p>}
          {kpi.bar && (
            <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden mt-1.5">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, kpi.bar.pct).toFixed(1)}%`, backgroundColor: kpi.bar.color }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Build CountryDetail — now at same depth as CorridorDetail**

CountryDetail replaces both PriceSparkline (the tiny tooltip) and adds:
- KPI row: Current Price, Daily High/Low, Price Trend (up/down arrow)
- Primary chart: 24h price profile (same SVG sparkline but larger)
- Generation mix breakdown (stacked bar)
- Top import/export flows with sparklines
- Outage context if any

**Step 3: Build CorridorDetail — adapt existing CorridorPanel**

Move the existing rich content from CorridorPanel.tsx into the new template.

**Step 4: Build PlantDetail — adapt existing PlantPanel**

Keep specs, add a mini chart placeholder for generation history.

**Step 5: Create DetailPanel router**

```typescript
// web/src/components/detail/DetailPanel.tsx
'use client';

import { useMapStore } from '@/lib/store';
import CountryDetail from './CountryDetail';
import CorridorDetail from './CorridorDetail';
import PlantDetail from './PlantDetail';
import TyndpDetail from './TyndpDetail';

export default function DetailPanel() {
  const detail = useMapStore((s) => s.detail);
  const clearDetail = useMapStore((s) => s.clearDetail);

  if (detail.kind === 'none') return null;

  return (
    <div className="detail-panel">
      {detail.kind === 'country' && <CountryDetail data={detail.data} onClose={clearDetail} />}
      {detail.kind === 'corridor' && <CorridorDetail data={detail.data} onClose={clearDetail} />}
      {detail.kind === 'plant' && <PlantDetail data={detail.data} onClose={clearDetail} />}
      {detail.kind === 'tyndp' && <TyndpDetail data={detail.data} onClose={clearDetail} />}
    </div>
  );
}
```

**Step 6: Add unified panel CSS**

```css
/* Replace all individual panel classes with one unified class */
.detail-panel {
  position: absolute;
  right: 16px;
  top: 16px;
  width: 380px;
  z-index: 15;
  background: rgba(10, 14, 23, 0.92);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  animation: slideInRight 0.2s ease-out;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
}

@media (max-width: 767px) {
  .detail-panel {
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    width: 100%;
    max-width: none;
    border-radius: 20px 20px 0 0;
    padding: 0 16px 20px;
    max-height: 72vh;
    box-shadow: 0 -8px 48px rgba(0, 0, 0, 0.7);
    animation: slideInUp 0.22s cubic-bezier(0.34, 1.08, 0.64, 1);
  }
}
```

**Step 7: Commit**

```bash
cd C:/Users/skf_s/luminus
git add web/src/components/detail/
git commit -m "feat: unified detail panel system with consistent skeleton

All entity types (country, corridor, plant, TYNDP) share same template:
header, KPI row, primary chart, related entities.
Country panel now has same depth as corridor panel."
```

---

## Phase 5: Flow Direction Animation

### Task 9: Add Animated Flow Direction to Arcs

**Files:**
- Modify: `web/src/lib/layers/flow-layer.ts`
- Create: `web/src/lib/layers/animated-flow-layer.ts`
- Modify: `web/src/components/Map.tsx` (add animation frame loop)

**Problem:** Pink/green arcs look beautiful but you can't tell which direction power is flowing.

**Solution:** Animated dash pattern ("ant path") moving from source to destination. Speed as secondary magnitude cue (faster = more MW).

Deck.gl doesn't natively support dash animation on ArcLayer, so we have two options:

**Option A: Dual-layer approach (simpler)**
- Bottom: ArcLayer as the "track" (light gray, current)
- Top: PathLayer with animated `getDashArray` + `dashJustified` for moving dashes

**Option B: Custom shader (more complex)**
- Extend ArcLayer with a fragment shader that animates dashes

We go with **Option A** as it's simpler and maintainable.

**Step 1: Create animated flow layer**

```typescript
// web/src/lib/layers/animated-flow-layer.ts
import { PathLayer } from '@deck.gl/layers';
import type { CrossBorderFlow } from '../data-fetcher';

/**
 * Creates animated dashes over flow arcs to show direction.
 * Uses PathLayer with great-circle interpolation.
 *
 * The dash offset is animated each frame by the parent component
 * updating the `timestamp` parameter.
 */

// Interpolate great-circle path as a series of points
function interpolateArc(
  fromLon: number, fromLat: number,
  toLon: number, toLat: number,
  segments: number = 20
): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Simple linear interpolation (for short European distances, sufficient)
    const lon = fromLon + t * (toLon - fromLon);
    const lat = fromLat + t * (toLat - fromLat);
    points.push([lon, lat]);
  }
  return points;
}

interface AnimatedFlowOptions {
  flows: CrossBorderFlow[];
  timestamp: number; // Updated each animation frame
}

export function createAnimatedFlowLayer({ flows, timestamp }: AnimatedFlowOptions) {
  // Precompute paths
  const data = flows.map((f) => ({
    path: interpolateArc(f.fromLon, f.fromLat, f.toLon, f.toLat),
    flow: f,
  }));

  return new PathLayer({
    id: 'flow-direction-dashes',
    data,
    getPath: (d: any) => d.path,
    getColor: [255, 255, 255, 120],
    getWidth: 2,
    widthMinPixels: 1,
    widthMaxPixels: 3,
    getDashArray: [4, 8],
    dashJustified: true,
    dashGapPickable: false,
    getOffset: (d: any) => {
      // Speed proportional to flow magnitude
      const speed = Math.max(0.5, d.flow.flowMW / 2000);
      return (timestamp * speed * 0.001) % 12;
    },
    extensions: [], // DashExtension if using @deck.gl/extensions
    pickable: false,
    updateTriggers: {
      getOffset: [timestamp],
    },
  });
}
```

**Step 2: Add animation loop to Map component**

```typescript
// In Map.tsx, add:
const [animationTimestamp, setAnimationTimestamp] = useState(0);
const animRef = useRef<number>(0);

useEffect(() => {
  function animate() {
    setAnimationTimestamp(Date.now());
    animRef.current = requestAnimationFrame(animate);
  }
  animRef.current = requestAnimationFrame(animate);
  return () => cancelAnimationFrame(animRef.current);
}, []);
```

Note: Deck.gl's PathLayer + `@deck.gl/extensions` PathStyleExtension provides native dash array support. We may need to install and use that. Implementation will verify which approach works best with Deck.gl 9.1.

**Step 3: Commit**

```bash
cd C:/Users/skf_s/luminus
git add web/src/lib/layers/animated-flow-layer.ts web/src/components/Map.tsx
git commit -m "feat: animated dash flow direction on cross-border arcs

Dashes travel from source to destination country.
Speed proportional to flow magnitude (faster = more MW)."
```

---

## Phase 6: Map Legend and Onboarding

### Task 10: Add Floating Map Legend

**Files:**
- Create: `web/src/components/MapLegend.tsx`
- Modify: `web/src/components/Map.tsx`
- Modify: `web/src/app/globals.css`

**Problem:** No legend on the map. Users can't tell what colors, symbols, or thicknesses mean.

**Solution:** Compact floating legend in the bottom-left corner. Only shows items for currently visible layers. Auto-hides at low zoom.

**Step 1: Build MapLegend component**

```typescript
// web/src/components/MapLegend.tsx
'use client';

import { useMapStore } from '@/lib/store';

export default function MapLegend() {
  const layerVisibility = useMapStore((s) => s.layerVisibility);
  const viewState = useMapStore((s) => s.viewState);

  // Hide legend when zoomed way out (overview level)
  if (viewState.zoom < 3) return null;

  const showPrice = layerVisibility.prices;
  const showFlows = layerVisibility.flows;
  const showPlants = layerVisibility.plants;

  // If nothing is visible, don't show legend
  if (!showPrice && !showFlows && !showPlants) return null;

  return (
    <div className="map-legend">
      {/* Price legend */}
      {showPrice && (
        <div className="mb-2">
          <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-1">Day-Ahead Price</p>
          <div className="flex items-center gap-1">
            <div
              className="h-2 flex-1 rounded-sm"
              style={{
                background: 'linear-gradient(to right, #22C55E, #A3E635, #EAB308, #F97316, #EF4444)',
              }}
            />
          </div>
          <div className="flex justify-between text-[8px] text-slate-500 mt-0.5">
            <span>0</span>
            <span>100</span>
            <span>200+</span>
          </div>
          <p className="text-[8px] text-slate-600 mt-0.5">EUR/MWh</p>
        </div>
      )}

      {/* Flow legend */}
      {showFlows && (
        <div className="mb-2">
          <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-1">Cross-Border Flow</p>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-[2px] bg-slate-300/60" />
              <span className="text-[8px] text-slate-500">&lt;500 MW</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-[4px] bg-slate-300/70" />
              <span className="text-[8px] text-slate-500">500-2000 MW</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-[6px] bg-slate-300/80" />
              <span className="text-[8px] text-slate-500">&gt;2000 MW</span>
            </div>
          </div>
          <p className="text-[8px] text-slate-600 mt-0.5 flex items-center gap-1">
            <span className="inline-block w-3 border-t border-dashed border-slate-400" />
            Direction of flow
          </p>
        </div>
      )}

      {/* Plant legend */}
      {showPlants && viewState.zoom >= 4 && (
        <div>
          <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-1">Power Plants</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {[
              { fuel: 'Nuclear', color: '#FACC15' },
              { fuel: 'Wind', color: '#22D3EE' },
              { fuel: 'Solar', color: '#FBBf24' },
              { fuel: 'Gas', color: '#FB923C' },
              { fuel: 'Coal', color: '#9CA3AF' },
              { fuel: 'Hydro', color: '#3B82F6' },
            ].map(({ fuel, color }) => (
              <div key={fuel} className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-[8px] text-slate-500">{fuel}</span>
              </div>
            ))}
          </div>
          <p className="text-[8px] text-slate-600 mt-0.5">Size = capacity</p>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add legend CSS**

```css
/* Add to globals.css */
.map-legend {
  position: absolute;
  bottom: 16px;
  left: 304px; /* Clear of sidebar */
  z-index: 12;
  background: rgba(10, 14, 23, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 10px 12px;
  min-width: 140px;
  max-width: 180px;
  pointer-events: auto;
}

@media (max-width: 767px) {
  .map-legend {
    left: 16px;
    bottom: 16px;
  }
}
```

**Step 3: Render in Map.tsx**

Add `<MapLegend />` after the sidebar in the render tree.

**Step 4: Commit**

```bash
cd C:/Users/skf_s/luminus
git add web/src/components/MapLegend.tsx web/src/app/globals.css web/src/components/Map.tsx
git commit -m "feat: floating map legend that adapts to visible layers

Shows only legends for currently visible layers.
Bottom-left position, auto-hides at very low zoom.
Includes price color bar, flow thickness scale, and plant fuel dots."
```

---

### Task 11: Add First-Visit Onboarding Overlay

**Files:**
- Create: `web/src/components/Onboarding.tsx`
- Modify: `web/src/components/Map.tsx`

**Problem:** For a data-dense tool, there's no "what am I looking at?" guidance.

**Solution:** 3-step tooltip tour on first visit. Persisted via localStorage so it only shows once.

Steps:
1. "Countries are colored by electricity price" (pointing at map)
2. "Click any country or flow arc for details" (pointing at detail area)
3. "Toggle layers and filters in the sidebar" (pointing at sidebar)

Uses a simple spotlight overlay with positioned tooltip cards.

**Step 1: Build Onboarding component**

```typescript
// web/src/components/Onboarding.tsx
'use client';

import { useState, useEffect } from 'react';

const STEPS = [
  {
    title: 'Price Heatmap',
    description: 'Countries are colored by day-ahead electricity price. Green = cheap, red = expensive.',
    position: 'center' as const,
  },
  {
    title: 'Click to Explore',
    description: 'Click any country for price details, or click a flow arc for cross-border analysis.',
    position: 'center' as const,
  },
  {
    title: 'Control Panel',
    description: 'Toggle layers, filter by fuel type, and adjust settings in the sidebar.',
    position: 'left' as const,
  },
];

export default function Onboarding() {
  const [step, setStep] = useState(-1); // -1 = not started / already seen

  useEffect(() => {
    const seen = localStorage.getItem('luminus-onboarding-v1');
    if (!seen) setStep(0);
  }, []);

  if (step < 0 || step >= STEPS.length) return null;

  const current = STEPS[step];

  const dismiss = () => {
    localStorage.setItem('luminus-onboarding-v1', 'true');
    setStep(-1);
  };

  const next = () => {
    if (step >= STEPS.length - 1) {
      dismiss();
    } else {
      setStep(step + 1);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={dismiss} />

      {/* Tooltip card */}
      <div className="relative bg-[#161B22] border border-white/[0.1] rounded-2xl p-5 max-w-sm shadow-2xl z-10">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-sky-400 font-medium uppercase tracking-widest">
            {step + 1} of {STEPS.length}
          </span>
        </div>
        <h3 className="text-base font-bold text-white mb-1">{current.title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed">{current.description}</p>

        <div className="flex justify-between items-center mt-4">
          <button onClick={dismiss} className="text-[11px] text-slate-500 hover:text-white transition-colors">
            Skip tour
          </button>
          <button
            onClick={next}
            className="px-4 py-1.5 rounded-lg bg-sky-500/20 border border-sky-500/30 text-[12px] text-sky-400 font-medium hover:bg-sky-500/30 transition-colors"
          >
            {step >= STEPS.length - 1 ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Render in Map.tsx after loading completes**

**Step 3: Commit**

```bash
cd C:/Users/skf_s/luminus
git add web/src/components/Onboarding.tsx web/src/components/Map.tsx
git commit -m "feat: first-visit onboarding tour (3 steps)

Shows once on first visit, persisted via localStorage.
Explains price heatmap, click interactions, and sidebar controls."
```

---

## Phase 7: Accessibility and Contrast Fixes

### Task 12: Fix Text Contrast and Accessibility

**Files:**
- Modify: `web/src/app/globals.css`
- Modify: `web/src/components/detail/KpiRow.tsx`
- Modify: `web/src/components/detail/MiniChart.tsx`
- Modify: `web/src/components/sidebar/OverviewTab.tsx`

**Problem:**
- Chart axes: dark grey on dark background fails WCAG
- White text on orange country fills has marginal contrast
- Small text sizes (9-10px) exacerbate contrast issues

**Solution:**
1. Minimum 4.5:1 contrast ratio for all text
2. Chart axis text: `#8B949E` (slate-400 equivalent, ~5:1 on `#0F1117`)
3. Country label text: add dark outline/shadow for readability on any fill
4. Minimum font size: 10px (never 8px or 9px for essential info)

**Step 1: Audit and fix CSS color tokens**

```css
/* Update in globals.css */
:root {
  --bg-primary: #0F1117;     /* Slightly lighter than #0a0e17 for better layering */
  --bg-surface: #161B22;     /* Card backgrounds */
  --bg-elevated: #1C2128;    /* Hover states */
  --text-primary: #E6EDF3;   /* 15:1 contrast on bg-primary */
  --text-secondary: #8B949E; /* 5:1 contrast on bg-primary */
  --text-muted: #484F58;     /* Disabled states only */
  --border: #30363D;         /* Visible border */
  --border-subtle: #21262D;  /* Subtle separator */
  --accent: #38bdf8;         /* Unchanged */
}
```

**Step 2: Update all `text-[9px]` to minimum `text-[10px]`**

Grep for `text-[9px]` and `text-[8px]` across all components and bump to `text-[10px]`.

**Step 3: Add text outline to map labels**

Increase outlineWidth on TextLayer from 3 to 4, and use a darker outline color for better contrast on any background fill.

**Step 4: Commit**

```bash
cd C:/Users/skf_s/luminus
git add web/src/app/globals.css web/src/components/
git commit -m "fix: WCAG contrast compliance for dark theme

Min 4.5:1 text contrast, min 10px font size.
Updated color tokens for better layering.
Added darker outlines to map labels for readability."
```

---

## Phase 8: Rebuild Map.tsx with New Architecture

### Task 13: Rewrite Map.tsx Using Store + Layer Factories + Detail Panel

**Files:**
- Modify: `web/src/components/Map.tsx` (major rewrite, ~500 lines target vs 1200+)

**Purpose:** Wire everything together. The new Map.tsx:
1. Uses Zustand store instead of 20+ useState
2. Calls layer factories instead of inline layer construction
3. Renders `<DetailPanel />` and `<MapLegend />` and `<Onboarding />`
4. Has animation loop for flow direction
5. Respects focusMode for layer opacity

**Step 1: Rewrite Map.tsx**

The component becomes primarily:
- Data loading effect (same as current)
- GeoJSON loading effect (same as current)
- URL hash sync effect (adapted to read from store)
- Animation frame loop (new)
- Layer construction via factories (new)
- Render: DeckGL + MapLibre + Sidebar + DetailPanel + MapLegend + Onboarding + Tooltip

**Step 2: Verify all interactions work**

Run: `cd C:/Users/skf_s/luminus/web && npm run build`

Manually test:
- [ ] Price heatmap colors (new palette)
- [ ] Flow arcs (neutral color, thickness varies)
- [ ] Flow direction animation (dashes moving)
- [ ] Plant dots (fuel colored)
- [ ] Layer toggles (focus/dimming)
- [ ] Country click -> rich detail panel
- [ ] Corridor click -> rich detail panel (same template)
- [ ] Plant click -> rich detail panel (same template)
- [ ] Sidebar tabs work
- [ ] Legend updates with visible layers
- [ ] Onboarding shows on first visit
- [ ] Mobile bottom sheets
- [ ] URL hash persistence

**Step 3: Commit**

```bash
cd C:/Users/skf_s/luminus
git add web/src/components/Map.tsx
git commit -m "refactor: rewrite Map.tsx using store + layer factories + unified panels

1200+ lines -> ~500 lines.
Zustand store replaces 20+ useState calls.
Layer factories replace inline construction.
Unified detail panel for all entity types."
```

---

## Phase 9: Cleanup and Polish

### Task 14: Remove Old Panel Components

**Files:**
- Delete: `web/src/components/PlantPanel.tsx`
- Delete: `web/src/components/PriceSparkline.tsx`
- Delete: `web/src/components/CorridorPanel.tsx`
- Delete: `web/src/components/TyndpPanel.tsx`
- Modify: `web/src/app/globals.css` (remove old panel CSS classes)

**Step 1: Remove old files**

```bash
rm web/src/components/PlantPanel.tsx web/src/components/PriceSparkline.tsx web/src/components/CorridorPanel.tsx web/src/components/TyndpPanel.tsx
```

**Step 2: Clean up globals.css**

Remove `.plant-panel`, `.corridor-panel`, `.sparkline-panel`, `.outage-panel`, `.forecast-panel` CSS rules. Keep only `.detail-panel` and `.map-legend`.

**Step 3: Verify build**

Run: `cd C:/Users/skf_s/luminus/web && npm run build`

**Step 4: Commit**

```bash
cd C:/Users/skf_s/luminus
git add -A web/src/components/ web/src/app/globals.css
git commit -m "chore: remove old panel components replaced by unified DetailPanel"
```

---

### Task 15: Final Sidebar Collapse to Icon Rail

**Files:**
- Modify: `web/src/components/sidebar/SidebarShell.tsx`
- Modify: `web/src/app/globals.css`

**Problem:** When detail panel is open, map is squeezed between left sidebar and right panel.

**Solution:** Add collapse-to-icon-rail feature. When detail panel is open on desktop, sidebar auto-collapses to a thin icon strip (40px). Clicking an icon expands the full sidebar temporarily (overlay).

**Step 1: Add collapsed state to store**

```typescript
// In store.ts, add:
sidebarCollapsed: boolean;
setSidebarCollapsed: (collapsed: boolean) => void;
```

**Step 2: Build icon rail**

When collapsed, show only the tab icons vertically. Clicking expands to full sidebar as overlay.

**Step 3: Auto-collapse when detail panel opens**

In the store's `selectDetail` action, set `sidebarCollapsed: true` on desktop.

**Step 4: Commit**

```bash
cd C:/Users/skf_s/luminus
git add web/src/components/sidebar/ web/src/lib/store.ts web/src/app/globals.css
git commit -m "feat: collapsible sidebar icon rail

Auto-collapses when detail panel opens on desktop.
Gives map room to breathe when inspecting data.
Click any icon to expand temporarily."
```

---

### Task 16: Polish and Visual QA

**Files:**
- Various component tweaks

**Step 1: Test all viewport sizes**

- 1440px+ (full desktop)
- 1024-1440px (narrow desktop)
- 768-1024px (tablet)
- <768px (mobile)

**Step 2: Verify legend responds to all layer combinations**

**Step 3: Test onboarding flow**

**Step 4: Verify flow animation performance**

Check that the requestAnimationFrame loop doesn't cause jank. If it does, throttle to 30fps:
```typescript
const FRAME_INTERVAL = 1000 / 30; // 30fps
```

**Step 5: Run `next build` and verify no errors**

**Step 6: Final commit**

```bash
cd C:/Users/skf_s/luminus
git add -A
git commit -m "polish: visual QA fixes and performance tuning"
```

---

## Summary of Changes by Feedback Point

| Feedback | Phase | Solution |
|----------|-------|----------|
| 1. Color channel overload | Phase 2 | Flows use neutral color + thickness. Price owns color exclusively. |
| 2. Sidebar information dump | Phase 3 | Tabbed sidebar: Overview / Layers / Filters. Collapsible. |
| 3. Inconsistent detail panels | Phase 4 | Unified DetailPanel with same skeleton for all entity types. |
| 4. Flow arcs lack direction | Phase 5 | Animated dash-array moving source-to-destination. |
| 5. No legend/onboarding | Phase 6 | Floating legend (bottom-left) + 3-step first-visit tour. |
| Visual spaghetti | Phase 2 | Layer focus/dimming system. |
| Panel squeeze | Phase 9 | Auto-collapse sidebar to icon rail when panel opens. |
| Text contrast | Phase 7 | WCAG-compliant color tokens, min 10px font, dark outlines. |
| Missing context for stats | Phase 3 | "Bottleneck" becomes "Grid Utilisation" with severity indicator. |

## Architecture After Revamp

```
web/src/
  app/
    globals.css          -- Updated design tokens + unified panel CSS
    page.tsx             -- Same (dynamic import)
    layout.tsx           -- Same
  components/
    Map.tsx              -- ~500 lines (down from 1200+)
    MapLegend.tsx        -- NEW: floating legend
    Onboarding.tsx       -- NEW: first-visit tour
    Tooltip.tsx          -- Same
    sidebar/
      SidebarShell.tsx   -- NEW: tabbed container
      SidebarHeader.tsx  -- NEW: branding + collapse toggle
      OverviewTab.tsx    -- NEW: key metrics with context
      LayersTab.tsx      -- NEW: toggles + integrated mini-legends
      FiltersTab.tsx     -- NEW: fuel, capacity, country filters
    detail/
      DetailPanel.tsx    -- NEW: router for entity type
      DetailHeader.tsx   -- NEW: shared header
      KpiRow.tsx         -- NEW: shared KPI display
      MiniChart.tsx      -- NEW: shared SVG charts
      CountryDetail.tsx  -- NEW: full country analysis
      CorridorDetail.tsx -- NEW: adapted from CorridorPanel
      PlantDetail.tsx    -- NEW: adapted from PlantPanel
      TyndpDetail.tsx    -- NEW: adapted from TyndpPanel
    SearchBar.tsx        -- Same
    WatchlistPanel.tsx   -- Same
    ComparePanel.tsx     -- Same
    ... (other panels adapted to new store)
  lib/
    store.ts             -- NEW: Zustand centralized state
    colors.ts            -- Updated: dark-mode optimised palette
    layers/
      index.ts           -- NEW: barrel export
      price-layer.ts     -- NEW: extracted from Map.tsx
      flow-layer.ts      -- NEW: neutral color + thickness
      animated-flow-layer.ts -- NEW: dash animation
      plant-layer.ts     -- NEW: extracted from Map.tsx
      line-layer.ts      -- NEW: voltage-based opacity
      label-layer.ts     -- NEW: gen-mix + spread labels
      tyndp-layer.ts     -- NEW: extracted from Map.tsx
      focus.ts           -- NEW: layer opacity by focus mode
    data-fetcher.ts      -- Same
    countries.ts         -- Same
    corridor-lines.ts    -- Same
    ... (other lib files same)
```

## Estimated Commits: 16
## Estimated New/Modified Files: ~30
