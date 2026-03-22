import { create } from 'zustand';
import type {
  PowerPlant, CountryPrice, CrossBorderFlow, TransmissionLine,
  CountryOutage, CountryForecast, PriceHistory,
} from './data-fetcher';
import type { TyndpProject } from './tyndp';

// --- Types ---

export type LayerKey =
  | 'plants' | 'prices' | 'flows' | 'lines' | 'tyndp'
  | 'genMix' | 'outages' | 'forecast' | 'history';

export type DetailSelection =
  | { kind: 'none' }
  | { kind: 'country'; data: CountryPrice }
  | { kind: 'corridor'; data: CrossBorderFlow }
  | { kind: 'plant'; data: PowerPlant }
  | { kind: 'tyndp'; data: TyndpProject };

export interface ViewState {
  latitude: number;
  longitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export type FocusMode = 'none' | 'prices' | 'flows' | 'plants';
export type SidebarTab = 'overview' | 'layers' | 'filters';

interface DataSlice {
  plants: PowerPlant[];
  prices: CountryPrice[];
  flows: CrossBorderFlow[];
  transmissionLines: TransmissionLine[];
  outages: CountryOutage[];
  forecasts: CountryForecast[];
  history: PriceHistory | null;
  isLoading: boolean;
  lastUpdate: string | null;
}

interface MapState extends DataSlice {
  viewState: ViewState;
  isMobile: boolean;
  layerVisibility: Record<LayerKey, boolean>;
  focusMode: FocusMode;
  selectedFuels: Set<string>;
  minCapacity: number;
  selectedCountries: Set<string> | null;
  detail: DetailSelection;
  compareCountries: string[];
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  sidebarTab: SidebarTab;

  // Actions
  setData: (partial: Partial<DataSlice>) => void;
  setLoading: (v: boolean) => void;
  setLastUpdate: (v: string) => void;
  setViewState: (vs: ViewState) => void;
  setIsMobile: (v: boolean) => void;
  toggleLayer: (key: LayerKey) => void;
  setFocusMode: (mode: FocusMode) => void;
  toggleFuel: (fuel: string) => void;
  setMinCapacity: (v: number) => void;
  toggleCountry: (code: string, allCodes: string[]) => void;
  selectAllCountries: () => void;
  clearCountries: () => void;
  selectDetail: (d: DetailSelection) => void;
  clearDetail: () => void;
  toggleCompareCountry: (code: string) => void;
  clearCompare: () => void;
  setSidebarOpen: (v: boolean) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setSidebarTab: (tab: SidebarTab) => void;
}

// --- Defaults ---

const DEFAULT_FUELS = new Set([
  'nuclear', 'wind', 'solar', 'gas', 'coal', 'hydro', 'other',
]);

const DEFAULT_LAYER_VISIBILITY: Record<LayerKey, boolean> = {
  plants: true, prices: true, flows: true, lines: true, tyndp: false,
  genMix: true, outages: false, forecast: false, history: false,
};

const DEFAULT_VIEW: ViewState = {
  latitude: 50.5, longitude: 10.0, zoom: 4, pitch: 20, bearing: 0,
};

// --- Store ---

export const useMapStore = create<MapState>()((set) => ({
  // Data
  plants: [],
  prices: [],
  flows: [],
  transmissionLines: [],
  outages: [],
  forecasts: [],
  history: null,
  isLoading: true,
  lastUpdate: null,
  // View
  viewState: DEFAULT_VIEW,
  isMobile: false,
  // Layers
  layerVisibility: { ...DEFAULT_LAYER_VISIBILITY },
  focusMode: 'none',
  // Filters
  selectedFuels: new Set(DEFAULT_FUELS),
  minCapacity: 50,
  selectedCountries: null,
  // Detail + Compare
  detail: { kind: 'none' },
  compareCountries: [],
  // UI
  sidebarOpen: true,
  sidebarCollapsed: false,
  sidebarTab: 'overview',

  // --- Actions ---
  setData: (partial) => set((s) => ({ ...s, ...partial })),
  setLoading: (isLoading) => set({ isLoading }),
  setLastUpdate: (lastUpdate) => set({ lastUpdate }),
  setViewState: (viewState) => set({ viewState }),
  setIsMobile: (isMobile) => set({ isMobile }),

  toggleLayer: (key) =>
    set((s) => ({
      layerVisibility: { ...s.layerVisibility, [key]: !s.layerVisibility[key] },
    })),
  setFocusMode: (focusMode) => set({ focusMode }),

  toggleFuel: (fuel) =>
    set((s) => {
      const next = new Set(s.selectedFuels);
      if (next.has(fuel)) next.delete(fuel);
      else next.add(fuel);
      return { selectedFuels: next };
    }),
  setMinCapacity: (minCapacity) => set({ minCapacity }),

  toggleCountry: (code, allCodes) =>
    set((s) => {
      const current = s.selectedCountries ?? new Set(allCodes);
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      // All selected -> collapse back to null
      if (next.size === allCodes.length) return { selectedCountries: null };
      return { selectedCountries: next };
    }),
  selectAllCountries: () => set({ selectedCountries: null }),
  clearCountries: () => set({ selectedCountries: new Set<string>() }),

  selectDetail: (detail) => set({ detail, sidebarCollapsed: detail.kind !== 'none' }),
  clearDetail: () => set({ detail: { kind: 'none' }, sidebarCollapsed: false }),

  toggleCompareCountry: (code) =>
    set((s) => {
      const idx = s.compareCountries.indexOf(code);
      if (idx >= 0) return { compareCountries: s.compareCountries.filter((c) => c !== code) };
      if (s.compareCountries.length >= 4) return s;
      return { compareCountries: [...s.compareCountries, code] };
    }),
  clearCompare: () => set({ compareCountries: [] }),

  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
}));
