'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { Map as MapLibre } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

import Sidebar from './Sidebar';
import Tooltip, { type TooltipData } from './Tooltip';
import ComparePanel from './ComparePanel';
import TimeScrubber from './TimeScrubber';
import AssetTimeSeries, { type TimeSeriesAsset } from './AssetTimeSeries';
import AlertsPanel from './AlertsPanel';
import PipelinePanel from './PipelinePanel';
import DetailPanel from './detail/DetailPanel';
import ExpandedSeriesPanel, { type ExpandedSeriesConfig } from './charts/ExpandedSeriesPanel';
import TopContextDock from './context/TopContextDock';
import MapLegend from './MapLegend';
import Onboarding from './Onboarding';
import MobileActionBar from './MobileActionBar';
import MarketIntelligenceRail from './MarketIntelligenceRail';

import { useMapStore } from '@/lib/store';
import type { LayerKey, ViewState } from '@/lib/store';
import { evaluateAlerts } from '@/lib/alerts';
import { deliverFirings } from '@/lib/alert-delivery';
import { normalizeFuel, FUEL_FILTER_MAP, FILTER_FUELS } from '@/lib/colors';
import { COUNTRY_CENTROIDS, EU_COUNTRY_CODES } from '@/lib/countries';
import {
  fetchPowerPlants, fetchDayAheadPricesDataset, fetchCrossBorderFlowsDataset,
  fetchTransmissionLines, fetchOutagesDataset, fetchForecastsDataset, fetchHistoryDataset,
  type CountryPrice, type CrossBorderFlow, type OutageEntry, type PowerPlant,
} from '@/lib/data-fetcher';
import { TYNDP_PROJECTS } from '@/lib/tyndp';
import { corridorId } from '@/lib/corridor-lines';
import { deletePreset, type WorkspacePreset } from '@/lib/workspace-presets';
import type { WatchlistItem } from '@/lib/watchlist';
import { parseHashState, buildHash } from '@/lib/url-hash';
import {
  createPriceLayer, createFlowLayer, createAnimatedFlowLayer,
  createPlantLayer, createLineLayer, createSpreadLabelLayer,
  createMetricLabelLayer, createTyndpLayer, layerOpacity,
  type FlowStressEntry, type SpreadLabelDatum, type MetricLabelDatum,
} from '@/lib/layers';
import {
  buildCountryMarketPulse,
  buildMapMetricLabelData,
} from '@/lib/map-insights';
import {
  beginDatasetRefresh,
  createEmptyLiveDatasetMap,
  summarizeLiveStatus,
  type LiveDatasetMap,
} from '@/lib/live-data-store';
import type { TutorialStepId } from './tutorial/tutorial-state';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INITIAL_HASH = parseHashState();
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const REFRESH_INTERVAL = 5 * 60 * 1000;

const MOBILE_LAYER_DEFAULTS: Record<LayerKey, boolean> = {
  plants: false, prices: true, flows: true, lines: false, tyndp: false,
  genMix: false, outages: false, forecast: false, history: false,
};

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

// Edge vignette gradient (constant, no need to recalculate)
const VIGNETTE_BG = [
  'linear-gradient(to right, rgba(10, 14, 23, 0.5) 0%, transparent 18%)',
  'linear-gradient(to left, rgba(10, 14, 23, 0.2) 0%, transparent 8%)',
  'linear-gradient(to bottom, rgba(10, 14, 23, 0.2) 0%, transparent 8%)',
  'linear-gradient(to top, rgba(10, 14, 23, 0.3) 0%, transparent 12%)',
].join(', ');

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EnergyMap() {
  // --- Store selectors (individual for minimal re-renders) ---
  const plants = useMapStore((s) => s.plants);
  const prices = useMapStore((s) => s.prices);
  const flows = useMapStore((s) => s.flows);
  const transmissionLines = useMapStore((s) => s.transmissionLines);
  const outages = useMapStore((s) => s.outages);
  const forecasts = useMapStore((s) => s.forecasts);
  const history = useMapStore((s) => s.history);
  const isLoading = useMapStore((s) => s.isLoading);
  const lastUpdate = useMapStore((s) => s.lastUpdate);
  const viewState = useMapStore((s) => s.viewState);
  const layerVisibility = useMapStore((s) => s.layerVisibility);
  const focusMode = useMapStore((s) => s.focusMode);
  const selectedFuels = useMapStore((s) => s.selectedFuels);
  const minCapacity = useMapStore((s) => s.minCapacity);
  const selectedCountries = useMapStore((s) => s.selectedCountries);
  const detail = useMapStore((s) => s.detail);
  const compareCountries = useMapStore((s) => s.compareCountries);
  const intelligenceView = useMapStore((s) => s.intelligenceView);

  // Store actions
  const setData = useMapStore((s) => s.setData);
  const setLoading = useMapStore((s) => s.setLoading);
  const setLastUpdate = useMapStore((s) => s.setLastUpdate);
  const storeSetViewState = useMapStore((s) => s.setViewState);
  const toggleLayer = useMapStore((s) => s.toggleLayer);
  const toggleFuel = useMapStore((s) => s.toggleFuel);
  const storeSetMinCapacity = useMapStore((s) => s.setMinCapacity);
  const toggleCountry = useMapStore((s) => s.toggleCountry);
  const selectAllCountries = useMapStore((s) => s.selectAllCountries);
  const clearCountries = useMapStore((s) => s.clearCountries);
  const selectDetail = useMapStore((s) => s.selectDetail);
  const clearDetail = useMapStore((s) => s.clearDetail);
  const toggleCompareCountry = useMapStore((s) => s.toggleCompareCountry);
  const clearCompare = useMapStore((s) => s.clearCompare);
  const setSidebarCollapsed = useMapStore((s) => s.setSidebarCollapsed);
  const setSidebarTab = useMapStore((s) => s.setSidebarTab);
  const setIntelligenceView = useMapStore((s) => s.setIntelligenceView);

  // --- Local state ---
  const [geoJson, setGeoJson] = useState<unknown>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [historyPriceOverride, setHistoryPriceOverride] = useState<Record<string, number> | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [animTimestamp, setAnimTimestamp] = useState(0);
  const [timeSeriesAsset, setTimeSeriesAsset] = useState<TimeSeriesAsset | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showPipeline, setShowPipeline] = useState(false);
  const [watchlistVersion, setWatchlistVersion] = useState(0);
  const [presetsVersion, setPresetsVersion] = useState(0);
  const [compareMode, setCompareMode] = useState(false);
  const [expandedSeries, setExpandedSeries] = useState<ExpandedSeriesConfig | null>(null);
  const [liveDatasets, setLiveDatasets] = useState<LiveDatasetMap>(() => createEmptyLiveDatasetMap());

  const shiftHeld = useRef(false);
  const animRef = useRef(0);
  const hashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveDatasetsRef = useRef(liveDatasets);

  const zoomLevel = viewState.zoom;
  const liveStatus = useMemo(
    () => summarizeLiveStatus(liveDatasets, REFRESH_INTERVAL),
    [liveDatasets],
  );

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Apply initial hash state on mount
  useEffect(() => {
    if (!INITIAL_HASH) {
      // Mobile layer defaults when no hash
      if (isMobileViewport()) {
        const store = useMapStore.getState();
        for (const [key, desired] of Object.entries(MOBILE_LAYER_DEFAULTS) as [LayerKey, boolean][]) {
          if (store.layerVisibility[key] !== desired) store.toggleLayer(key);
        }
      }
      return;
    }

    const state = useMapStore.getState();
    if (INITIAL_HASH.lat != null || INITIAL_HASH.lon != null || INITIAL_HASH.z != null) {
      storeSetViewState({
        ...state.viewState,
        latitude: INITIAL_HASH.lat ?? state.viewState.latitude,
        longitude: INITIAL_HASH.lon ?? state.viewState.longitude,
        zoom: INITIAL_HASH.z ?? (isMobileViewport() ? 3.5 : state.viewState.zoom),
      });
    }
    if (INITIAL_HASH.cap != null) useMapStore.getState().setMinCapacity(INITIAL_HASH.cap);
    if (INITIAL_HASH.fuels) {
      for (const f of FILTER_FUELS) {
        const shouldBeOn = INITIAL_HASH.fuels.has(f);
        const isOn = useMapStore.getState().selectedFuels.has(f);
        if (shouldBeOn !== isOn) useMapStore.getState().toggleFuel(f);
      }
    }
    if (INITIAL_HASH.countries && INITIAL_HASH.countries.size === 0) {
      useMapStore.getState().clearCountries();
    }
    if (INITIAL_HASH.layers) {
      const store = useMapStore.getState();
      for (const [key, desired] of Object.entries(INITIAL_HASH.layers) as [LayerKey, boolean][]) {
        if (store.layerVisibility[key] !== desired) store.toggleLayer(key);
      }
    } else if (isMobileViewport()) {
      const store = useMapStore.getState();
      for (const [key, desired] of Object.entries(MOBILE_LAYER_DEFAULTS) as [LayerKey, boolean][]) {
        if (store.layerVisibility[key] !== desired) store.toggleLayer(key);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data loading
  const loadData = useCallback(async () => {
    const currentLive = liveDatasetsRef.current;
    const hasExistingData = currentLive.prices.data.length > 0 || currentLive.flows.data.length > 0;
    setLoading(!hasExistingData);
    setLiveDatasets({
      prices: beginDatasetRefresh(currentLive.prices),
      flows: beginDatasetRefresh(currentLive.flows),
      outages: beginDatasetRefresh(currentLive.outages),
      forecasts: beginDatasetRefresh(currentLive.forecasts),
      history: beginDatasetRefresh(currentLive.history),
    });
    const [plantsData, pricesData, flowsData, linesData, outagesData, forecastsData, historyData] =
      await Promise.all([
        fetchPowerPlants(),
        fetchDayAheadPricesDataset(currentLive.prices),
        fetchCrossBorderFlowsDataset(currentLive.flows),
        fetchTransmissionLines(),
        fetchOutagesDataset(currentLive.outages),
        fetchForecastsDataset(currentLive.forecasts),
        fetchHistoryDataset(currentLive.history),
      ]);
    const nextLive = {
      prices: pricesData,
      flows: flowsData,
      outages: outagesData,
      forecasts: forecastsData,
      history: historyData,
    };
    setLiveDatasets(nextLive);
    setData({
      plants: plantsData, prices: pricesData.data, flows: flowsData.data,
      transmissionLines: linesData, outages: outagesData.data,
      forecasts: forecastsData.data, history: historyData.data,
    });
    setLastUpdate(summarizeLiveStatus(nextLive, REFRESH_INTERVAL).timestampLabel);
    setLoading(false);

    // Apply hash country filter now that we have plant data
    if (INITIAL_HASH?.countries && INITIAL_HASH.countries.size > 0) {
      const allCodes = [...new Set(plantsData.map((p) => p.country))];
      if (useMapStore.getState().selectedCountries === null) {
        for (const code of allCodes) {
          if (!INITIAL_HASH.countries!.has(code)) useMapStore.getState().toggleCountry(code, allCodes);
        }
      }
    }
  }, [setData, setLoading, setLastUpdate]);

  useEffect(() => {
    liveDatasetsRef.current = liveDatasets;
  }, [liveDatasets]);

  useEffect(() => {
    fetch('/data/eu-countries.geojson').then((r) => r.json()).then((data) => {
      data.features = data.features.filter((f: { properties?: { ISO_A2?: string; iso_a2?: string } }) => {
        const iso = f.properties?.ISO_A2 || f.properties?.iso_a2 || '';
        return EU_COUNTRY_CODES.has(iso);
      });
      setGeoJson(data);
    }).catch((err) => console.warn('Failed to load GeoJSON:', err));
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  // Animation loop (~30fps)
  useEffect(() => {
    let lastFrame = 0;
    function animate(time: number) {
      if (time - lastFrame > 33) { setAnimTimestamp(time); lastFrame = time; }
      animRef.current = requestAnimationFrame(animate);
    }
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // Shift key tracking
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeld.current = true; };
    const onUp = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeld.current = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, []);

  // URL hash sync (debounced)
  useEffect(() => {
    if (hashTimer.current) clearTimeout(hashTimer.current);
    hashTimer.current = setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', buildHash(viewState, minCapacity, selectedFuels, selectedCountries, layerVisibility));
      }
    }, 600);
    return () => { if (hashTimer.current) clearTimeout(hashTimer.current); };
  }, [viewState, minCapacity, selectedFuels, selectedCountries, layerVisibility]);

  // Alert evaluation
  useEffect(() => {
    if (prices.length === 0) return;
    const priceByIso: Record<string, number> = {};
    for (const p of prices) priceByIso[p.iso2] = p.price;
    const congestion: Record<string, number> = {};
    for (const f of flows) {
      const id = [f.from, f.to].sort().join('-');
      congestion[`corridor:${id}`] = f.capacityMW > 0 ? f.flowMW / f.capacityMW : 0;
    }
    const outageSet = new Set(outages.map((o) => `country:${o.iso2}`));
    const fired = evaluateAlerts(priceByIso, congestion, outageSet);
    if (fired.length > 0) deliverFirings(fired);
  }, [prices, flows, outages]);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const filteredPlants = useMemo(() =>
    plants.filter((p) => {
      const cat = FUEL_FILTER_MAP[normalizeFuel(p.fuel)] || 'other';
      return selectedFuels.has(cat) && p.capacity >= minCapacity &&
        (selectedCountries === null || selectedCountries.has(p.country));
    }),
  [plants, selectedFuels, minCapacity, selectedCountries]);

  const availableCountries = useMemo(() => {
    const codes = new Set(plants.map((p) => p.country));
    return [...codes].map((c) => ({ code: c, name: COUNTRY_CENTROIDS[c]?.name || c })).sort((a, b) => a.name.localeCompare(b.name));
  }, [plants]);

  const allCountryCodes = useMemo(() => availableCountries.map((c) => c.code), [availableCountries]);

  const priceLookup = useMemo(() => {
    const map = new Map<string, CountryPrice>();
    for (const p of prices) {
      map.set(p.iso2, historyPriceOverride?.[p.iso2] !== undefined
        ? { ...p, price: historyPriceOverride[p.iso2] }
        : p);
    }
    return map;
  }, [prices, historyPriceOverride]);

  const metricLabelData: MetricLabelDatum[] = useMemo(
    () => buildMapMetricLabelData([...priceLookup.values()]),
    [priceLookup],
  );

  const flowStressByCorridor = useMemo(() => {
    const map = new Map<string, FlowStressEntry>();
    for (const f of flows) {
      const cid = corridorId(f.from, f.to);
      const util = f.capacityMW > 0 ? f.flowMW / f.capacityMW : 0;
      const existing = map.get(cid);
      if (!existing || util > existing.util) {
        map.set(cid, { util, flowMW: f.flowMW, capacityMW: f.capacityMW, from: f.from, to: f.to });
      }
    }
    return map;
  }, [flows]);

  const spreadLabelData: SpreadLabelDatum[] = useMemo(() => {
    if (!layerVisibility.flows) return [];
    return flows.map((f) => {
      const fp = priceLookup.get(f.from), tp = priceLookup.get(f.to);
      if (!fp || !tp) return null;
      const spread = Math.round((tp.price - fp.price) * 10) / 10;
      const sign = spread >= 0 ? '+' : '';
      return {
        position: [(f.fromLon + f.toLon) / 2, (f.fromLat + f.toLat) / 2] as [number, number],
        text: `${sign}\u20ac${Math.abs(spread).toFixed(0)}`, spread,
      };
    }).filter(Boolean) as SpreadLabelDatum[];
  }, [flows, priceLookup, layerVisibility.flows]);

  // Zoom-responsive visibility
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const plantFloor = isMobile ? 5 : 4;
  const lineFloor = isMobile ? 5 : 4;
  const spreadFloor = isMobile ? 5.5 : 4;
  const spreadCeil = isMobile ? 8 : 7;

  const effectiveVis = useMemo(() => ({
    plants: layerVisibility.plants && zoomLevel >= plantFloor,
    prices: layerVisibility.prices,
    flows: layerVisibility.flows && zoomLevel >= 4,
    lines: layerVisibility.lines && zoomLevel >= lineFloor,
    tyndp: layerVisibility.tyndp && zoomLevel >= 4,
    genMix: layerVisibility.genMix && zoomLevel < 6,
    spreadLabels: layerVisibility.flows && zoomLevel >= spreadFloor && zoomLevel < spreadCeil,
  }), [layerVisibility, zoomLevel, plantFloor, lineFloor, spreadFloor, spreadCeil]);

  const selectedFlowForLines: CrossBorderFlow | null = detail.kind === 'corridor' ? detail.data : null;

  // ---------------------------------------------------------------------------
  // Layers (via factory functions)
  // ---------------------------------------------------------------------------

  const layers = useMemo(() => {
    const result: unknown[] = [];

    if (effectiveVis.prices && geoJson) {
      result.push(createPriceLayer({
        geoJson, priceLookup,
        onHover: (info) => {
          if (!info) { setTooltip(null); return; }
          const pulse = buildCountryMarketPulse(info.iso2, prices, flows, outages, forecasts);
          setTooltip({
            x: info.x,
            y: info.y,
            title: pulse.title,
            eyebrow: pulse.eyebrow,
            content: pulse.content,
          });
        },
        onClick: (iso2) => {
          if (compareMode || shiftHeld.current) { toggleCompareCountry(iso2); return; }
          const pd = priceLookup.get(iso2);
          if (pd) selectDetail({ kind: 'country', data: pd });
        },
        opacity: layerOpacity('prices', focusMode),
      }));
    }

    if (effectiveVis.lines && transmissionLines.length > 0) {
      result.push(createLineLayer({
        transmissionLines, flowStressByCorridor, selectedFlow: selectedFlowForLines,
        onHover: (info) => {
          if (!info) { setTooltip(null); return; }
          setTooltip({ x: info.x, y: info.y, content: {
            Line: info.name, Voltage: `${info.voltage} kV`,
            ...(info.flowMW != null && { Flow: `${info.flowMW.toLocaleString()} MW` }),
            ...(info.stressLabel && { Status: info.stressLabel }),
            ...(info.corridorId && { '': 'Click for corridor detail' }),
          } });
        },
        onClick: (cid) => {
          const mf = flows.find((f) => corridorId(f.from, f.to) === cid);
          if (mf) selectDetail({ kind: 'corridor', data: mf });
        },
        opacity: layerOpacity('lines', focusMode),
      }));
    }

    if (effectiveVis.flows) {
      result.push(createFlowLayer({
        flows, priceLookup,
        onHover: (info) => {
          if (!info) { setTooltip(null); return; }
          setTooltip({ x: info.x, y: info.y, content: {
            Flow: `${info.from} \u2192 ${info.to}`, MW: info.flowMW.toLocaleString(),
            'Capacity %': `${(info.capacityMW > 0 ? (info.flowMW / info.capacityMW * 100).toFixed(0) : '0')}%`,
            ...(info.spread != null && { Spread: `${info.spread >= 0 ? '+' : ''}\u20ac${info.spread.toFixed(1)}/MWh` }),
            '': 'Click for corridor detail',
          } });
        },
        onClick: (flow) => selectDetail({ kind: 'corridor', data: flow }),
        opacity: layerOpacity('flows', focusMode),
      }));
      result.push(createAnimatedFlowLayer({ flows, timestamp: animTimestamp, opacity: Math.round(layerOpacity('flows', focusMode) * 0.7) }));
    }

    if (effectiveVis.spreadLabels && spreadLabelData.length > 0) {
      result.push(createSpreadLabelLayer({ data: spreadLabelData }));
    }

    if (effectiveVis.plants) {
      result.push(createPlantLayer({
        filteredPlants, zoomLevel,
        onHover: (info) => {
          if (!info) { setTooltip(null); return; }
          setTooltip({ x: info.x, y: info.y, content: { Plant: info.name, Fuel: info.fuelLabel, Capacity: `${info.capacity.toLocaleString()} MW`, Country: info.country, Commissioned: info.year } });
        },
        onClick: (plant) => selectDetail({ kind: 'plant', data: plant }),
        opacity: layerOpacity('plants', focusMode),
      }));
    }

    if (effectiveVis.tyndp) {
      result.push(createTyndpLayer({
        projects: TYNDP_PROJECTS,
        onHover: (info) => {
          if (!info) { setTooltip(null); return; }
          setTooltip({ x: info.x, y: info.y, content: { Project: info.name, Type: info.fuel, Capacity: `${info.capacity.toLocaleString()} MW`, Status: info.status, Expected: info.expectedYear, '': 'Click for project detail' } });
        },
        onClick: (project) => selectDetail({ kind: 'tyndp', data: project }),
      }));
    }

    if (effectiveVis.genMix && metricLabelData.length > 0) {
      result.push(createMetricLabelLayer({ data: metricLabelData }));
    }

    return result;
  }, [
    effectiveVis, geoJson, priceLookup, focusMode, compareMode,
    transmissionLines, flowStressByCorridor, selectedFlowForLines, flows,
    animTimestamp, spreadLabelData, filteredPlants, zoomLevel, metricLabelData,
    selectDetail, toggleCompareCountry, prices, outages, forecasts,
  ]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleViewStateChange = useCallback(({ viewState: vs }: { viewState: ViewState }) => {
    storeSetViewState(vs);
  }, [storeSetViewState]);

  const handleToggleLayer = useCallback((layer: LayerKey) => {
    const nextValue = !layerVisibility[layer];
    toggleLayer(layer);
    if (layer === 'outages' && nextValue) {
      setIntelligenceView('outages');
    } else if (layer === 'forecast' && nextValue) {
      setIntelligenceView('forecast');
    } else if (layer === 'outages' && !nextValue && intelligenceView === 'outages') {
      setIntelligenceView(layerVisibility.forecast ? 'forecast' : 'none');
    } else if (layer === 'forecast' && !nextValue && intelligenceView === 'forecast') {
      setIntelligenceView(layerVisibility.outages ? 'outages' : 'none');
    }
    setMobileSidebarOpen(false);
  }, [intelligenceView, layerVisibility, setIntelligenceView, toggleLayer]);

  const handleToggleCountry = useCallback((code: string) => toggleCountry(code, allCountryCodes), [toggleCountry, allCountryCodes]);

  // Panel open helpers (clear competing overlays)
  const openAlerts = useCallback(() => {
    setShowAlerts(true);
    setShowPipeline(false);
    setTimeSeriesAsset(null);
    setExpandedSeries(null);
    setIntelligenceView('none');
    clearCompare();
    setCompareMode(false);
  }, [clearCompare, setIntelligenceView]);
  const openDashboard = useCallback(() => {
    setShowAlerts(false);
    setShowPipeline(false);
    setTimeSeriesAsset(null);
    setExpandedSeries(null);
    setIntelligenceView('brief');
    clearCompare();
    setCompareMode(false);
  }, [clearCompare, setIntelligenceView]);
  const openPipeline = useCallback(() => {
    setShowPipeline(true);
    setShowAlerts(false);
    setTimeSeriesAsset(null);
    setExpandedSeries(null);
    setIntelligenceView('none');
    clearCompare();
    setCompareMode(false);
  }, [clearCompare, setIntelligenceView]);

  const flyTo = useCallback((lat: number, lon: number, minZoom: number) => {
    const vs = useMapStore.getState().viewState;
    storeSetViewState({ ...vs, latitude: lat, longitude: lon, zoom: Math.max(vs.zoom, minZoom) });
  }, [storeSetViewState]);

  const handleSearchSelectPlant = useCallback((plant: PowerPlant) => {
    selectDetail({ kind: 'plant', data: plant });
    setTimeSeriesAsset(null); setShowAlerts(false); setShowPipeline(false); setExpandedSeries(null);
    flyTo(plant.lat, plant.lon, 7);
  }, [selectDetail, flyTo]);

  const handleSearchSelectCountry = useCallback((iso2: string) => {
    const pd = prices.find((p) => p.iso2 === iso2);
    if (pd) selectDetail({ kind: 'country', data: pd });
    setShowAlerts(false); setShowPipeline(false); setExpandedSeries(null);
    const c = COUNTRY_CENTROIDS[iso2];
    if (c) flyTo(c.lat, c.lon, 5);
  }, [prices, selectDetail, flyTo]);

  const handleOpenTimeSeries = useCallback((iso2: string) => {
    setTimeSeriesAsset({ kind: 'country', iso2 }); setShowAlerts(false); setShowPipeline(false); setExpandedSeries(null);
  }, []);

  const handleWatchlistSelectPlant = useCallback((item: WatchlistItem) => {
    const found = plants.find((p) => p.name.toLowerCase() === item.label.toLowerCase());
    if (found) { handleSearchSelectPlant(found); return; }
    if (item.iso2) { const c = COUNTRY_CENTROIDS[item.iso2]; if (c) flyTo(c.lat, c.lon, 6); }
  }, [plants, handleSearchSelectPlant, flyTo]);

  const selectCorridorFlow = useCallback((from: string, to: string) => {
    const mf = flows.find((f) => (f.from === from && f.to === to) || (f.from === to && f.to === from));
    if (mf) selectDetail({ kind: 'corridor', data: mf });
    setTimeSeriesAsset(null); setShowAlerts(false); setShowPipeline(false); setExpandedSeries(null);
    const midLon = mf ? (mf.fromLon + mf.toLon) / 2 : (() => { const fc = COUNTRY_CENTROIDS[from]; const tc = COUNTRY_CENTROIDS[to]; return fc && tc ? (fc.lon + tc.lon) / 2 : null; })();
    const midLat = mf ? (mf.fromLat + mf.toLat) / 2 : (() => { const fc = COUNTRY_CENTROIDS[from]; const tc = COUNTRY_CENTROIDS[to]; return fc && tc ? (fc.lat + tc.lat) / 2 : null; })();
    if (midLon != null && midLat != null) {
      const vs = useMapStore.getState().viewState;
      storeSetViewState({ ...vs, latitude: midLat, longitude: midLon, zoom: Math.min(Math.max(vs.zoom, 4), 6) });
    }
  }, [flows, selectDetail, storeSetViewState]);

  const handleScreenshot = useCallback(() => {
    try {
      const canvases = document.querySelectorAll('canvas');
      if (canvases.length === 0) return;
      const first = canvases[0];
      const off = document.createElement('canvas');
      off.width = first.width; off.height = first.height;
      const ctx = off.getContext('2d');
      if (!ctx) return;
      for (const c of canvases) { try { ctx.drawImage(c, 0, 0); } catch { /* CORS */ } }
      const link = document.createElement('a');
      link.download = `luminus-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = off.toDataURL('image/png');
      link.click();
    } catch (err) { console.warn('Screenshot failed:', err); }
  }, []);

  const handleExportCSV = useCallback(() => {
    const header = 'Name,Fuel,Capacity_MW,Country,Latitude,Longitude,Year\n';
    const rows = filteredPlants.map((p) => `"${p.name}","${p.fuel}",${p.capacity},"${p.country}",${p.lat},${p.lon},"${p.year}"`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `luminus-plants-${new Date().toISOString().slice(0, 10)}.csv`;
    link.href = url; link.click(); URL.revokeObjectURL(url);
  }, [filteredPlants]);

  const handleToggleCompareMode = useCallback(() => {
    setCompareMode((prev) => { if (prev) clearCompare(); return !prev; });
    setMobileSidebarOpen(false);
  }, [clearCompare]);

  const handleApplyPreset = useCallback((preset: WorkspacePreset) => {
    const { layerVisibility: lv, selectedFuels: sf, minCapacity: mc, selectedCountries: sc } = preset.state;
    const store = useMapStore.getState();
    for (const [key, desired] of Object.entries(lv) as [LayerKey, boolean][]) {
      if (store.layerVisibility[key] !== desired) store.toggleLayer(key);
    }
    const desiredFuels = new Set(sf);
    for (const f of FILTER_FUELS) {
      if (desiredFuels.has(f) !== useMapStore.getState().selectedFuels.has(f)) useMapStore.getState().toggleFuel(f);
    }
    useMapStore.getState().setMinCapacity(mc);
    if (sc === null) { useMapStore.getState().selectAllCountries(); } else {
      useMapStore.getState().clearCountries();
      for (const code of sc) useMapStore.getState().toggleCountry(code, allCountryCodes);
    }
  }, [allCountryCodes]);

  const handleRefreshNow = useCallback(() => {
    void loadData();
  }, [loadData]);

  const handleExpandSeries = useCallback((config: ExpandedSeriesConfig) => {
    setExpandedSeries(config);
  }, []);

  const handleSelectOutagePlant = useCallback((entry: OutageEntry) => {
    const normalize = (value: string) =>
      value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[_-]+/g, ' ')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    const matchedPlant = plants.find((plant) =>
      (entry.country ? plant.country === entry.country : true)
      && (
        normalize(plant.name) === normalize(entry.name)
        || (entry.coordinates
          && Math.abs(plant.lat - entry.coordinates[0]) < 0.05
          && Math.abs(plant.lon - entry.coordinates[1]) < 0.05)
      ),
    );

    if (matchedPlant) {
      handleSearchSelectPlant(matchedPlant);
      return;
    }

    if (entry.country) {
      handleSearchSelectCountry(entry.country);
    }
  }, [handleSearchSelectCountry, handleSearchSelectPlant, plants]);

  const focusTutorialStep = useCallback((stepId: TutorialStepId) => {
    setSidebarCollapsed(false);
    setMobileSidebarOpen(false);
    clearCompare();
    setCompareMode(false);

    switch (stepId) {
      case 'live-status':
        setSidebarTab('overview');
        setShowAlerts(false);
        setShowPipeline(false);
        setTimeSeriesAsset(null);
        setIntelligenceView('brief');
        break;
      case 'country-detail':
        setSidebarTab('overview');
        setShowAlerts(false);
        setShowPipeline(false);
        setTimeSeriesAsset(null);
        clearDetail();
        break;
      case 'flows-layer':
        setSidebarTab('layers');
        if (!layerVisibility.flows) {
          toggleLayer('flows');
        }
        break;
      case 'outage-radar':
        setSidebarTab('layers');
        if (!layerVisibility.outages) {
          toggleLayer('outages');
        }
        setShowAlerts(false);
        setShowPipeline(false);
        setTimeSeriesAsset(null);
        setIntelligenceView('outages');
        break;
      case 'forecast-actual':
        setSidebarTab('layers');
        if (!layerVisibility.forecast) {
          toggleLayer('forecast');
        }
        setShowAlerts(false);
        setShowPipeline(false);
        setTimeSeriesAsset(null);
        setIntelligenceView('forecast');
        break;
      case 'morning-brief':
        setSidebarTab('overview');
        setShowAlerts(false);
        setShowPipeline(false);
        setTimeSeriesAsset(null);
        setIntelligenceView('brief');
        break;
      case 'filters-replay':
        setSidebarTab('filters');
        break;
    }
  }, [
    clearCompare,
    clearDetail,
    layerVisibility.flows,
    layerVisibility.forecast,
    layerVisibility.outages,
    setIntelligenceView,
    setSidebarCollapsed,
    setSidebarTab,
    toggleLayer,
  ]);

  // hasRightPanel for sidebar layout
  const hasRightPanel = compareCountries.length > 0 ||
    !!timeSeriesAsset || showAlerts || showPipeline || !!expandedSeries ||
    intelligenceView !== 'none';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="w-screen h-screen relative" data-tour-id="map-stage">
      <DeckGL viewState={viewState} onViewStateChange={handleViewStateChange as any} controller={true} layers={layers as any[]}>
        <MapLibre mapStyle={MAP_STYLE} />
      </DeckGL>

      <div className="pointer-events-none absolute inset-0" style={{ zIndex: 5, background: VIGNETTE_BG }} />

      <Tooltip data={tooltip} />

      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0e17]/70 backdrop-blur-sm">
          <div className="text-center">
            <div className="inline-block w-8 h-8 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin mb-3" />
            <p className="text-sm text-slate-400">Loading power plant data...</p>
          </div>
        </div>
      )}

      {/* Compare mode toggle */}
      <button
        onClick={handleToggleCompareMode}
        className={`hidden md:flex absolute bottom-6 right-4 px-3 py-1.5 rounded-full text-xs font-medium transition-all backdrop-blur-xl ${
          compareMode ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'bg-black/60 text-slate-400 border border-white/[0.06] hover:text-white hover:border-white/10'
        }`}
        style={{ zIndex: 15 }}
      >
        <span className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="18" rx="1" />
          </svg>
          {compareMode ? 'Exit Compare' : 'Compare'}
        </span>
      </button>

      {compareCountries.length > 0 ? (
        <ComparePanel
          selectedCountries={compareCountries}
          plants={plants}
          prices={prices}
          flows={flows}
          onRemoveCountry={(iso2) => toggleCompareCountry(iso2)}
          onClose={() => { clearCompare(); setCompareMode(false); }}
          onExpandSeries={handleExpandSeries}
        />
      ) : (
        !showAlerts && !showPipeline && !timeSeriesAsset && intelligenceView !== 'none' && (
          <MarketIntelligenceRail
            activeView={intelligenceView}
            prices={prices}
            flows={flows}
            outages={outages}
            forecasts={forecasts}
            plants={plants}
            projects={TYNDP_PROJECTS}
            liveStatus={liveStatus}
            onViewChange={setIntelligenceView}
            onRefresh={handleRefreshNow}
            onSelectCountry={handleSearchSelectCountry}
            onSelectCorridor={selectCorridorFlow}
            onSelectPlant={handleSelectOutagePlant}
            onExpandSeries={handleExpandSeries}
            onClose={() => setIntelligenceView('none')}
          />
        )
      )}

      <TopContextDock
        detail={detail}
        plants={plants}
        prices={prices}
        flows={flows}
        outages={outages}
        forecasts={forecasts}
        onClose={clearDetail}
        onExpandSeries={handleExpandSeries}
      />

      {detail.kind === 'tyndp' && <DetailPanel />}

      {expandedSeries && (
        <ExpandedSeriesPanel
          {...expandedSeries}
          onClose={() => setExpandedSeries(null)}
        />
      )}

      {timeSeriesAsset && !showAlerts && !showPipeline && (
        <AssetTimeSeries
          asset={timeSeriesAsset}
          prices={prices}
          flows={flows}
          history={history}
          onClose={() => setTimeSeriesAsset(null)}
          onExpandSeries={handleExpandSeries}
        />
      )}
      {showAlerts && <AlertsPanel onClose={() => setShowAlerts(false)} />}
      {showPipeline && (
        <PipelinePanel projects={TYNDP_PROJECTS} prices={prices} flows={flows}
          onSelectProject={(p) => { selectDetail({ kind: 'tyndp', data: p }); setShowPipeline(false); }}
          onClose={() => setShowPipeline(false)} />
      )}
      {layerVisibility.history && history && (
        <TimeScrubber history={history} onHourChange={setHistoryPriceOverride}
          onClose={() => { setHistoryPriceOverride(null); handleToggleLayer('history'); }} />
      )}

      {/* Mobile action bar (visible when no panel is open) */}
      {!mobileSidebarOpen && !showAlerts && !showPipeline && !timeSeriesAsset &&
        detail.kind === 'none' && compareCountries.length === 0 && (
        <MobileActionBar onOpenDashboard={openDashboard} onOpenAlerts={openAlerts}
          onOpenLayers={() => setMobileSidebarOpen(true)} onOpenPipeline={openPipeline} />
      )}

      <Sidebar
        plants={plants} filteredPlants={filteredPlants} prices={prices} flows={flows}
        lastUpdate={liveStatus.timestampLabel || lastUpdate || 'loading...'} layerVisibility={layerVisibility}
        onToggleLayer={handleToggleLayer} isLoading={isLoading}
        selectedFuels={selectedFuels} onToggleFuel={toggleFuel}
        minCapacity={minCapacity} onSetMinCapacity={storeSetMinCapacity}
        selectedCountries={selectedCountries} onToggleCountry={handleToggleCountry}
        onSelectAllCountries={selectAllCountries} onClearCountries={clearCountries}
        availableCountries={availableCountries} zoomLevel={zoomLevel}
        onScreenshot={handleScreenshot} onExportCSV={handleExportCSV}
        mobileOpen={mobileSidebarOpen} onToggleMobile={() => setMobileSidebarOpen((v) => !v)}
        hasRightPanel={hasRightPanel}
        onSelectPlant={handleSearchSelectPlant} onSelectCountry={handleSearchSelectCountry}
        onSelectCorridor={selectCorridorFlow} onSelectWatchlistPlant={handleWatchlistSelectPlant}
        onOpenAlerts={openAlerts} onOpenDashboard={openDashboard} onOpenPipeline={openPipeline}
        onOpenTimeSeries={handleOpenTimeSeries}
        watchlistVersion={watchlistVersion} onWatchlistChange={() => setWatchlistVersion((v) => v + 1)}
        onApplyPreset={handleApplyPreset} onDeletePreset={(id) => { deletePreset(id); setPresetsVersion((v) => v + 1); }}
        onPresetSaved={() => setPresetsVersion((v) => v + 1)} presetsVersion={presetsVersion}
      />

      <MapLegend />
      <Onboarding onStepFocus={focusTutorialStep} />
    </div>
  );
}
