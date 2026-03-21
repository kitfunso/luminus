'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import {
  ScatterplotLayer,
  ArcLayer,
  GeoJsonLayer,
  PathLayer,
  TextLayer,
} from '@deck.gl/layers';
import { Map as MapLibre } from 'react-map-gl/maplibre';
import type { PickingInfo } from '@deck.gl/core';
import 'maplibre-gl/dist/maplibre-gl.css';

import Sidebar from './Sidebar';
import type { LayerKey } from './Sidebar';
import Tooltip, { type TooltipData } from './Tooltip';
import PlantPanel from './PlantPanel';
import PriceSparkline from './PriceSparkline';
import ComparePanel from './ComparePanel';
import OutageRadar from './OutageRadar';
import ForecastPanel from './ForecastPanel';
import TimeScrubber from './TimeScrubber';
import AssetTimeSeries, { type TimeSeriesAsset } from './AssetTimeSeries';
import AlertsPanel from './AlertsPanel';
import TraderDashboard from './TraderDashboard';
import { evaluateAlerts } from '@/lib/alerts';
import CorridorPanel from './CorridorPanel';
import TyndpPanel from './TyndpPanel';
import PipelinePanel from './PipelinePanel';
import {
  getFuelColor,
  normalizeFuel,
  priceToColor,
  FUEL_LABELS,
  FUEL_FILTER_MAP,
  FILTER_FUELS,
  FUEL_EMOJI,
} from '@/lib/colors';
import { COUNTRY_CENTROIDS, EU_COUNTRY_CODES } from '@/lib/countries';
import {
  fetchPowerPlants,
  fetchDayAheadPrices,
  fetchCrossBorderFlows,
  fetchTransmissionLines,
  fetchOutages,
  fetchForecasts,
  fetchHistory,
  type PowerPlant,
  type CountryPrice,
  type CrossBorderFlow,
  type TransmissionLine,
  type CountryOutage,
  type CountryForecast,
  type PriceHistory,
} from '@/lib/data-fetcher';
import { TYNDP_PROJECTS, type TyndpProject } from '@/lib/tyndp';
import { corridorId, corridorForLine } from '@/lib/corridor-lines';
import { deletePreset, type WorkspacePreset } from '@/lib/workspace-presets';

// --- URL hash state ---

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

function parseHashState(): {
  lat?: number;
  lon?: number;
  z?: number;
  cap?: number;
  fuels?: Set<string>;
  countries?: Set<string>;
  layers?: Record<LayerKey, boolean>;
} | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.slice(1);
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const result: {
    lat?: number;
    lon?: number;
    z?: number;
    cap?: number;
    fuels?: Set<string>;
    countries?: Set<string>;
    layers?: Record<LayerKey, boolean>;
  } = {};

  if (params.has('lat')) result.lat = parseFloat(params.get('lat')!);
  if (params.has('lon')) result.lon = parseFloat(params.get('lon')!);
  if (params.has('z')) result.z = parseFloat(params.get('z')!);
  if (params.has('cap')) result.cap = parseFloat(params.get('cap')!);

  const fuels = params.get('fuels');
  if (fuels !== null) {
    result.fuels = new Set(
      fuels
        .split(',')
        .map((fuel) => fuel.trim())
        .filter(Boolean)
    );
  }

  const countries = params.get('countries');
  if (countries !== null) {
    result.countries = new Set(
      countries === 'none'
        ? []
        : countries
            .split(',')
            .map((code) => code.trim())
            .filter(Boolean)
    );
  }

  const layers = params.get('layers');
  if (layers !== null) {
    const enabled = new Set(
      layers
        .split(',')
        .map((layer) => layer.trim())
        .filter(Boolean)
    );
    result.layers = {
      plants: enabled.has('plants'),
      prices: enabled.has('prices'),
      flows: enabled.has('flows'),
      lines: enabled.has('lines'),
      tyndp: enabled.has('tyndp'),
      genMix: enabled.has('genMix'),
      outages: enabled.has('outages'),
      forecast: enabled.has('forecast'),
      history: enabled.has('history'),
    };
  }

  return Object.keys(result).length > 0 ? result : null;
}

function buildHash(
  lat: number,
  lon: number,
  zoom: number,
  minCapacity: number,
  selectedFuels: Set<string>,
  selectedCountries: Set<string> | null,
  layerVisibility: Record<LayerKey, boolean>
): string {
  const params = new URLSearchParams({
    lat: lat.toFixed(2),
    lon: lon.toFixed(2),
    z: zoom.toFixed(1),
  });

  if (minCapacity !== 50) {
    params.set('cap', String(minCapacity));
  }

  if (selectedFuels.size !== FILTER_FUELS.length) {
    params.set('fuels', [...selectedFuels].sort().join(','));
  }

  if (selectedCountries !== null) {
    params.set(
      'countries',
      selectedCountries.size > 0
        ? [...selectedCountries].sort().join(',')
        : 'none'
    );
  }

  const defaultLayers = JSON.stringify(DEFAULT_LAYER_VISIBILITY);
  const currentLayers = JSON.stringify(layerVisibility);
  if (currentLayers !== defaultLayers) {
    params.set(
      'layers',
      (Object.entries(layerVisibility) as [LayerKey, boolean][])
        .filter(([, enabled]) => enabled)
        .map(([layer]) => layer)
        .sort()
        .join(',')
    );
  }

  return `#${params.toString()}`;
}

// --- Constants ---

const INITIAL_HASH_STATE = parseHashState();

const DEFAULTS = {
  latitude: INITIAL_HASH_STATE?.lat ?? 50.5,
  longitude: INITIAL_HASH_STATE?.lon ?? 10.0,
  zoom: INITIAL_HASH_STATE?.z ?? 4,
  pitch: 20,
  bearing: 0,
};

const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const REFRESH_INTERVAL = 5 * 60 * 1000;

// --- Component ---

export default function EnergyMap() {
  // Data state
  const [plants, setPlants] = useState<PowerPlant[]>([]);
  const [prices, setPrices] = useState<CountryPrice[]>([]);
  const [flows, setFlows] = useState<CrossBorderFlow[]>([]);
  const [transmissionLines, setTransmissionLines] = useState<TransmissionLine[]>([]);
  const [outages, setOutages] = useState<CountryOutage[]>([]);
  const [forecasts, setForecasts] = useState<CountryForecast[]>([]);
  const [history, setHistory] = useState<PriceHistory | null>(null);
  const [historyPriceOverride, setHistoryPriceOverride] = useState<Record<string, number> | null>(null);
  const [geoJson, setGeoJson] = useState<any>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [lastUpdate, setLastUpdate] = useState('loading...');
  const [isLoading, setIsLoading] = useState(true);

  // View state
  const [viewState, setViewState] = useState(DEFAULTS);
  const [zoomLevel, setZoomLevel] = useState(DEFAULTS.zoom);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Layer toggles
  const [layerVisibility, setLayerVisibility] = useState<Record<LayerKey, boolean>>(
    () => INITIAL_HASH_STATE?.layers ?? DEFAULT_LAYER_VISIBILITY
  );

  // Filters
  const [selectedFuels, setSelectedFuels] = useState<Set<string>>(
    () => INITIAL_HASH_STATE?.fuels ?? new Set(FILTER_FUELS)
  );
  const [minCapacity, setMinCapacity] = useState(INITIAL_HASH_STATE?.cap ?? 50);
  const [selectedCountries, setSelectedCountries] = useState<Set<string> | null>(
    () => INITIAL_HASH_STATE?.countries ?? null
  );

  // Detail panels
  const [selectedPlant, setSelectedPlant] = useState<PowerPlant | null>(null);
  const [selectedCountryPrice, setSelectedCountryPrice] =
    useState<CountryPrice | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<CrossBorderFlow | null>(null);
  const [selectedTyndp, setSelectedTyndp] = useState<TyndpProject | null>(null);

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [compareCountries, setCompareCountries] = useState<string[]>([]);
  const shiftHeld = useRef(false);

  // Sprint 4: search-driven navigation, watchlist, time series, alerts, dashboard, pipeline
  const [timeSeriesAsset, setTimeSeriesAsset] = useState<TimeSeriesAsset | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showPipeline, setShowPipeline] = useState(false);
  const [watchlistVersion, setWatchlistVersion] = useState(0);
  const [presetsVersion, setPresetsVersion] = useState(0);

  // URL hash debounce
  const hashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Data loading ---

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const [plantsData, pricesData, flowsData, linesData, outagesData, forecastsData, historyData] = await Promise.all([
      fetchPowerPlants(),
      fetchDayAheadPrices(),
      fetchCrossBorderFlows(),
      fetchTransmissionLines(),
      fetchOutages(),
      fetchForecasts(),
      fetchHistory(),
    ]);
    setPlants(plantsData);
    setPrices(pricesData);
    setFlows(flowsData);
    setTransmissionLines(linesData);
    setOutages(outagesData);
    setForecasts(forecastsData);
    setHistory(historyData);
    setLastUpdate(new Date().toLocaleTimeString());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    async function loadGeo() {
      try {
        const resp = await fetch('/data/eu-countries.geojson');
        const data = await resp.json();
        data.features = data.features.filter((f: any) => {
          const iso = f.properties?.ISO_A2 || f.properties?.iso_a2 || '';
          return EU_COUNTRY_CODES.has(iso);
        });
        setGeoJson(data);
      } catch (err) {
        console.warn('Failed to load GeoJSON:', err);
      }
    }
    loadGeo();
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  // --- Shift key tracking for compare mode ---

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeld.current = true;
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeld.current = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // --- URL hash sync (debounced) ---

  useEffect(() => {
    if (hashTimer.current) clearTimeout(hashTimer.current);
    hashTimer.current = setTimeout(() => {
      if (typeof window !== 'undefined') {
        const newHash = buildHash(
          viewState.latitude,
          viewState.longitude,
          viewState.zoom,
          minCapacity,
          selectedFuels,
          selectedCountries,
          layerVisibility
        );
        window.history.replaceState(null, '', newHash);
      }
    }, 600);
    return () => {
      if (hashTimer.current) clearTimeout(hashTimer.current);
    };
  }, [
    viewState.latitude,
    viewState.longitude,
    viewState.zoom,
    minCapacity,
    selectedFuels,
    selectedCountries,
    layerVisibility,
  ]);

  // --- Sprint 4: alert evaluation on data refresh ---

  useEffect(() => {
    if (prices.length === 0) return;
    const priceByIso: Record<string, number> = {};
    for (const p of prices) priceByIso[p.iso2] = p.price;
    const congestionByCorridorId: Record<string, number> = {};
    for (const f of flows) {
      const id = [f.from, f.to].sort().join('-');
      congestionByCorridorId[`corridor:${id}`] = f.capacityMW > 0 ? f.flowMW / f.capacityMW : 0;
    }
    const outageSet = new Set(outages.map((o) => `country:${o.iso2}`));
    evaluateAlerts(priceByIso, congestionByCorridorId, outageSet);
  }, [prices, flows, outages]);

  // --- Filtered data ---

  const filteredPlants = useMemo(() => {
    return plants.filter((p) => {
      const fuel = normalizeFuel(p.fuel);
      const filterCat = FUEL_FILTER_MAP[fuel] || 'other';
      if (!selectedFuels.has(filterCat)) return false;
      if (p.capacity < minCapacity) return false;
      if (selectedCountries !== null && !selectedCountries.has(p.country)) {
        return false;
      }
      return true;
    });
  }, [plants, selectedFuels, minCapacity, selectedCountries]);

  const availableCountries = useMemo(() => {
    const codes = new Set(plants.map((p) => p.country));
    return [...codes]
      .map((code) => ({
        code,
        name: COUNTRY_CENTROIDS[code]?.name || code,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [plants]);

  const priceLookup = useMemo(() => {
    const map = new Map<string, CountryPrice>();
    for (const p of prices) {
      if (historyPriceOverride && historyPriceOverride[p.iso2] !== undefined) {
        map.set(p.iso2, { ...p, price: historyPriceOverride[p.iso2] });
      } else {
        map.set(p.iso2, p);
      }
    }
    return map;
  }, [prices, historyPriceOverride]);

  // --- Generation mix: dominant fuel emoji per country ---

  const genMixData = useMemo(() => {
    const countryFuels: Record<string, Record<string, number>> = {};
    for (const p of filteredPlants) {
      const fuel = normalizeFuel(p.fuel);
      if (!countryFuels[p.country]) countryFuels[p.country] = {};
      countryFuels[p.country][fuel] =
        (countryFuels[p.country][fuel] || 0) + p.capacity;
    }

    return Object.entries(COUNTRY_CENTROIDS)
      .map(([iso, { lat, lon }]) => {
        const fuels = countryFuels[iso];
        if (!fuels) return null;
        const entries = Object.entries(fuels).sort(
          (a, b) => b[1] - a[1]
        );
        const dominant = entries[0];
        if (!dominant) return null;
        const total = entries.reduce((s, [, v]) => s + v, 0);
        const pct = Math.round((dominant[1] / total) * 100);
        const emoji = FUEL_EMOJI[dominant[0]] || '\u26A1';
        return {
          position: [lon, lat] as [number, number],
          text: `${emoji} ${pct}%`,
          iso,
        };
      })
      .filter(Boolean) as { position: [number, number]; text: string; iso: string }[];
  }, [filteredPlants]);

  // --- Flow stress lookup by corridorId (for line coloring) ---

  const flowStressByCorridor = useMemo(() => {
    const map = new Map<string, { util: number; flowMW: number; capacityMW: number; from: string; to: string }>();
    for (const f of flows) {
      const cid = corridorId(f.from, f.to);
      const util = f.capacityMW > 0 ? f.flowMW / f.capacityMW : 0;
      const existing = map.get(cid);
      // Keep the highest utilisation entry if there are duplicate corridors
      if (!existing || util > existing.util) {
        map.set(cid, { util, flowMW: f.flowMW, capacityMW: f.capacityMW, from: f.from, to: f.to });
      }
    }
    return map;
  }, [flows]);

  // --- Spread labels: mid-arc price differential text ---

  const spreadLabelData = useMemo(() => {
    if (!layerVisibility.flows) return [];
    return flows
      .map((f) => {
        const fp = priceLookup.get(f.from);
        const tp = priceLookup.get(f.to);
        if (!fp || !tp) return null;
        const spread = Math.round((tp.price - fp.price) * 10) / 10;
        const lon = (f.fromLon + f.toLon) / 2;
        const lat = (f.fromLat + f.toLat) / 2;
        const sign = spread >= 0 ? '+' : '';
        return {
          position: [lon, lat] as [number, number],
          text: `${sign}€${Math.abs(spread).toFixed(0)}`,
          spread,
        };
      })
      .filter(Boolean) as { position: [number, number]; text: string; spread: number }[];
  }, [flows, priceLookup, layerVisibility.flows]);

  // --- Zoom-responsive visibility ---

  const effectiveVis = useMemo(
    () => ({
      plants: layerVisibility.plants && zoomLevel >= 4,
      prices: layerVisibility.prices,
      flows: layerVisibility.flows && zoomLevel >= 4,
      lines: layerVisibility.lines && zoomLevel >= 4,
      tyndp: layerVisibility.tyndp && zoomLevel >= 4,
      genMix: layerVisibility.genMix && zoomLevel < 6,
      spreadLabels: layerVisibility.flows && zoomLevel >= 4 && zoomLevel < 7,
    }),
    [layerVisibility, zoomLevel]
  );

  // --- Layers ---

  const layers = useMemo(() => {
    const result: any[] = [];

    // 1. Price heatmap (GeoJSON fill)
    if (effectiveVis.prices && geoJson) {
      result.push(
        new GeoJsonLayer({
          id: 'price-heatmap',
          data: geoJson,
          filled: true,
          stroked: true,
          getFillColor: (f: any) => {
            const iso = f.properties?.ISO_A2 || '';
            const priceData = priceLookup.get(iso);
            if (!priceData) return [60, 60, 80, 120];
            return priceToColor(priceData.price);
          },
          getLineColor: [100, 120, 140, 80],
          getLineWidth: 1,
          lineWidthMinPixels: 0.5,
          pickable: true,
          autoHighlight: true,
          highlightColor: [56, 189, 248, 60],
          updateTriggers: { getFillColor: [priceLookup] },
          onHover: (info: PickingInfo) => {
            if (!info.object) {
              setTooltip(null);
              return;
            }
            const props = info.object.properties || {};
            const iso = props.ISO_A2 || '';
            const priceData = priceLookup.get(iso);
            const countryName =
              COUNTRY_CENTROIDS[iso]?.name || props.name || iso;
            setTooltip({
              x: info.x,
              y: info.y,
              content: {
                Country: countryName,
                'Day-Ahead Price': priceData
                  ? `${priceData.price} EUR/MWh`
                  : 'N/A',
              },
            });
          },
          onClick: (info: PickingInfo) => {
            if (!info.object) return;
            const iso = info.object.properties?.ISO_A2 || '';
            if (!iso) return;

            if (compareMode || shiftHeld.current) {
              setCompareCountries((prev) => {
                if (prev.includes(iso)) return prev.filter((c) => c !== iso);
                if (prev.length >= 4) return prev;
                return [...prev, iso];
              });
              setSelectedPlant(null);
              setSelectedCountryPrice(null);
              return;
            }

            const priceData = priceLookup.get(iso);
            if (priceData) {
              setSelectedCountryPrice(priceData);
              setSelectedPlant(null);
              setSelectedFlow(null);
              setSelectedTyndp(null);
            }
          },
        })
      );
    }

    // 2. Transmission lines (PathLayer) — colored by corridor stress, clickable
    if (effectiveVis.lines && transmissionLines.length > 0) {
      // Precompute selected-corridor line names for highlight
      const selectedCid = selectedFlow
        ? corridorId(selectedFlow.from, selectedFlow.to)
        : null;

      const lineStressColor = (d: TransmissionLine): [number, number, number, number] => {
        const cid = corridorForLine(d.name);
        if (cid) {
          const stress = flowStressByCorridor.get(cid);
          if (stress) {
            if (stress.util > 0.8) return [248, 113, 113, 210]; // Congested: red
            if (stress.util > 0.5) return [250, 204, 21, 210];  // Stressed: amber
            return [74, 222, 128, 180];                          // Low: green
          }
        }
        // No flow data for this line — dim default by voltage
        return d.voltage >= 400 ? [100, 120, 160, 120] : [80, 100, 130, 100];
      };

      const lineWidth = (d: TransmissionLine): number => {
        const cid = corridorForLine(d.name);
        const isSelected = cid !== null && cid === selectedCid;
        if (isSelected) return d.voltage >= 400 ? 600 : 400;
        return d.voltage >= 400 ? 300 : 200;
      };

      result.push(
        new PathLayer<TransmissionLine>({
          id: 'transmission-lines',
          data: transmissionLines,
          getPath: (d) => d.path,
          getColor: lineStressColor,
          getWidth: lineWidth,
          widthMinPixels: 1,
          widthMaxPixels: 6,
          pickable: true,
          updateTriggers: {
            getColor: [flowStressByCorridor],
            getWidth: [selectedFlow],
          },
          onHover: (info: PickingInfo<TransmissionLine>) => {
            if (!info.object) {
              setTooltip(null);
              return;
            }
            const d = info.object;
            const cid = corridorForLine(d.name);
            const stress = cid ? flowStressByCorridor.get(cid) : null;
            const stressLabel = stress
              ? stress.util > 0.8
                ? 'Congested'
                : stress.util > 0.5
                ? 'Stressed'
                : 'Low'
              : null;
            setTooltip({
              x: info.x,
              y: info.y,
              content: {
                Line: d.name,
                Voltage: `${d.voltage} kV`,
                ...(stress && { 'Flow': `${stress.flowMW.toLocaleString()} MW` }),
                ...(stressLabel && { 'Status': stressLabel }),
                ...(cid && { '': 'Click for corridor detail' }),
              },
            });
          },
          onClick: (info: PickingInfo<TransmissionLine>) => {
            if (!info.object) return;
            const cid = corridorForLine(info.object.name);
            if (!cid) return;
            // Find the matching flow and open CorridorPanel via the shared path
            const matchedFlow = flows.find(
              (f) => corridorId(f.from, f.to) === cid
            );
            if (matchedFlow) {
              setSelectedFlow(matchedFlow);
              setSelectedPlant(null);
              setSelectedCountryPrice(null);
              setSelectedTyndp(null);
              setTimeSeriesAsset(null);
              setShowAlerts(false);
              setShowDashboard(false);
              setShowPipeline(false);
            }
          },
        })
      );
    }

    // 3. Cross-border flow arrows (colored by utilization stress, clickable for corridor detail)
    if (effectiveVis.flows) {
      const stressColor = (d: CrossBorderFlow): [number, number, number, number] => {
        const util = d.capacityMW > 0 ? d.flowMW / d.capacityMW : 0;
        if (util > 0.8) return [248, 113, 113, 220];
        if (util > 0.5) return [250, 204, 21, 220];
        return [74, 222, 128, 200];
      };
      result.push(
        new ArcLayer<CrossBorderFlow>({
          id: 'cross-border-flows',
          data: flows,
          getSourcePosition: (d) => [d.fromLon, d.fromLat],
          getTargetPosition: (d) => [d.toLon, d.toLat],
          getSourceColor: (d) => stressColor(d),
          getTargetColor: (d) => stressColor(d),
          getWidth: (d) => Math.max(1, d.flowMW / 500),
          widthMinPixels: 2,
          widthMaxPixels: 10,
          greatCircle: true,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 60],
          onHover: (info: PickingInfo<CrossBorderFlow>) => {
            if (!info.object) {
              setTooltip(null);
              return;
            }
            const d = info.object;
            const fromName = COUNTRY_CENTROIDS[d.from]?.name || d.from;
            const toName = COUNTRY_CENTROIDS[d.to]?.name || d.to;
            const util = d.capacityMW > 0 ? d.flowMW / d.capacityMW : 0;
            const pct = (util * 100).toFixed(0);
            const stressLabel = util > 0.8 ? 'Congested' : util > 0.5 ? 'Stressed' : 'Low';
            const fp = priceLookup.get(d.from);
            const tp = priceLookup.get(d.to);
            const spread = fp && tp ? (tp.price - fp.price).toFixed(1) : null;
            setTooltip({
              x: info.x,
              y: info.y,
              content: {
                Flow: `${fromName} \u2192 ${toName}`,
                MW: d.flowMW.toLocaleString(),
                'Capacity %': `${pct}% (${stressLabel})`,
                ...(spread != null && { Spread: `${parseFloat(spread) >= 0 ? '+' : ''}\u20ac${spread}/MWh` }),
                '': 'Click for corridor detail',
              },
            });
          },
          onClick: (info: PickingInfo<CrossBorderFlow>) => {
            if (!info.object) return;
            setSelectedFlow(info.object);
            setSelectedPlant(null);
            setSelectedCountryPrice(null);
            setSelectedTyndp(null);
            setTimeSeriesAsset(null);
            setShowAlerts(false);
            setShowDashboard(false);
            setShowPipeline(false);
          },
        })
      );
    }

    // 3b. Spread label overlays on flow arcs (visible at zoom 4-7)
    if (effectiveVis.spreadLabels && spreadLabelData.length > 0) {
      result.push(
        new TextLayer({
          id: 'spread-labels',
          data: spreadLabelData,
          getPosition: (d: { position: [number, number] }) => d.position,
          getText: (d: { text: string }) => d.text,
          getSize: 11,
          getColor: (d: { spread: number }) =>
            d.spread > 5
              ? [74, 222, 128, 210]
              : d.spread < -5
              ? [248, 113, 113, 210]
              : [250, 204, 21, 200],
          fontFamily: 'system-ui, sans-serif',
          fontWeight: 700,
          outlineWidth: 3,
          outlineColor: [10, 14, 23, 220],
          billboard: true,
          characterSet: 'auto',
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'center',
          pickable: false,
        })
      );
    }

    // 4. Power plant dots
    if (effectiveVis.plants) {
      result.push(
        new ScatterplotLayer<PowerPlant>({
          id: 'power-plants',
          data: filteredPlants,
          getPosition: (d) => [d.lon, d.lat],
          getFillColor: (d) => getFuelColor(d.fuel),
          getRadius: (d) =>
            Math.max(800, Math.sqrt(d.capacity) * (zoomLevel > 6 ? 150 : 120)),
          radiusMinPixels: 2,
          radiusMaxPixels: zoomLevel > 6 ? 30 : 20,
          pickable: true,
          antialiasing: true,
          onHover: (info: PickingInfo<PowerPlant>) => {
            if (!info.object) {
              setTooltip(null);
              return;
            }
            const d = info.object;
            const fuel = normalizeFuel(d.fuel);
            setTooltip({
              x: info.x,
              y: info.y,
              content: {
                Plant: d.name,
                Fuel: FUEL_LABELS[fuel] || fuel,
                Capacity: `${d.capacity.toLocaleString()} MW`,
                Country: COUNTRY_CENTROIDS[d.country]?.name || d.country,
                Commissioned: d.year || 'Unknown',
              },
            });
          },
          onClick: (info: PickingInfo<PowerPlant>) => {
            if (!info.object) return;
            setSelectedPlant(info.object);
            setSelectedCountryPrice(null);
            setSelectedFlow(null);
            setSelectedTyndp(null);
          },
        })
      );
    }

    // 5. TYNDP pipeline (hollow circles, clickable for project detail)
    if (effectiveVis.tyndp) {
      const tyndpStatusColor = (d: TyndpProject): [number, number, number, number] => {
        if (d.status === 'under_construction') return [74, 222, 128, 210];
        if (d.status === 'permitted') return [56, 189, 248, 190];
        if (d.status === 'planned') return [250, 204, 21, 170];
        return [148, 163, 184, 140];
      };
      result.push(
        new ScatterplotLayer<TyndpProject>({
          id: 'tyndp-projects',
          data: TYNDP_PROJECTS,
          getPosition: (d) => [d.lon, d.lat],
          getRadius: (d) => Math.max(1200, Math.sqrt(d.capacity) * 150),
          radiusMinPixels: 4,
          radiusMaxPixels: 28,
          filled: false,
          stroked: true,
          getLineColor: tyndpStatusColor,
          getLineWidth: 2,
          lineWidthMinPixels: 2,
          lineWidthMaxPixels: 4,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 40],
          onHover: (info: PickingInfo<TyndpProject>) => {
            if (!info.object) {
              setTooltip(null);
              return;
            }
            const d = info.object;
            const statusLabel = d.status.replace('_', ' ');
            setTooltip({
              x: info.x,
              y: info.y,
              content: {
                Project: d.name,
                Type: d.fuel,
                Capacity: `${d.capacity.toLocaleString()} MW`,
                Status: statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1),
                Expected: d.expectedYear,
                '': 'Click for project detail',
              },
            });
          },
          onClick: (info: PickingInfo<TyndpProject>) => {
            if (!info.object) return;
            setSelectedTyndp(info.object);
            setSelectedPlant(null);
            setSelectedCountryPrice(null);
            setSelectedFlow(null);
          },
        })
      );
    }

    // 6. Generation mix labels (TextLayer)
    if (effectiveVis.genMix && genMixData.length > 0) {
      result.push(
        new TextLayer({
          id: 'gen-mix-labels',
          data: genMixData,
          getPosition: (d: { position: [number, number] }) => d.position,
          getText: (d: { text: string }) => d.text,
          getSize: 16,
          getColor: [255, 255, 255, 220],
          fontFamily: 'system-ui, sans-serif',
          fontWeight: 700,
          outlineWidth: 3,
          outlineColor: [10, 14, 23, 200],
          billboard: true,
          characterSet: 'auto',
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'center',
        })
      );
    }

    return result;
  }, [
    filteredPlants,
    flows,
    transmissionLines,
    geoJson,
    priceLookup,
    effectiveVis,
    genMixData,
    spreadLabelData,
    zoomLevel,
    compareMode,
    flowStressByCorridor,
    selectedFlow,
  ]);

  // --- Handlers ---

  const handleViewStateChange = useCallback(({ viewState: vs }: any) => {
    setViewState(vs);
    setZoomLevel(vs.zoom);
  }, []);

  const handleToggleLayer = useCallback((layer: LayerKey) => {
    setLayerVisibility((prev) => ({ ...prev, [layer]: !prev[layer] }));
    setMobileSidebarOpen(false);
  }, []);

  const handleToggleFuel = useCallback((fuel: string) => {
    setSelectedFuels((prev) => {
      const next = new Set(prev);
      if (next.has(fuel)) next.delete(fuel);
      else next.add(fuel);
      return next;
    });
  }, []);

  const handleSetMinCapacity = useCallback((value: number) => {
    setMinCapacity(value);
  }, []);

  const handleToggleCountry = useCallback((code: string) => {
    setSelectedCountries((prev) => {
      const allCountries = availableCountries.map(({ code }) => code);
      const next = new Set(prev ?? allCountries);

      if (next.has(code)) next.delete(code);
      else next.add(code);

      if (next.size === allCountries.length) {
        return null;
      }

      return next;
    });
  }, [availableCountries]);

  const handleSelectAllCountries = useCallback(() => {
    setSelectedCountries(null);
  }, []);

  const handleClearCountries = useCallback(() => {
    setSelectedCountries(new Set());
  }, []);

  // Sprint 4 handlers
  const handleSearchSelectPlant = useCallback((plant: PowerPlant) => {
    setSelectedPlant(plant);
    setSelectedCountryPrice(null);
    setTimeSeriesAsset(null);
    setShowAlerts(false);
    setShowDashboard(false);
    // Fly to plant
    setViewState((prev) => ({
      ...prev,
      latitude: plant.lat,
      longitude: plant.lon,
      zoom: Math.max(prev.zoom, 7),
    }));
  }, []);

  const handleSearchSelectCountry = useCallback((iso2: string) => {
    const priceData = prices.find((p) => p.iso2 === iso2);
    if (priceData) {
      setSelectedCountryPrice(priceData);
      setSelectedPlant(null);
    }
    setShowAlerts(false);
    setShowDashboard(false);
    // Fly to country centroid
    const centroid = COUNTRY_CENTROIDS[iso2];
    if (centroid) {
      setViewState((prev) => ({
        ...prev,
        latitude: centroid.lat,
        longitude: centroid.lon,
        zoom: Math.max(prev.zoom, 5),
      }));
    }
  }, [prices]);

  const handleOpenTimeSeries = useCallback((iso2: string) => {
    setTimeSeriesAsset({ kind: 'country', iso2 });
    setShowAlerts(false);
    setShowDashboard(false);
  }, []);

  // Watchlist plant selection: look up the full PowerPlant record by label, fall back
  // to flying to the country centroid when the plant is not in the current plants array.
  const handleWatchlistSelectPlant = useCallback((item: { label: string; iso2?: string }) => {
    const found = plants.find(
      (p) => p.name.toLowerCase() === item.label.toLowerCase()
    );
    if (found) {
      handleSearchSelectPlant(found);
    } else if (item.iso2) {
      // Plant not in current dataset (filtered out or data missing) — fly to its country
      const centroid = COUNTRY_CENTROIDS[item.iso2];
      if (centroid) {
        setViewState((prev) => ({
          ...prev,
          latitude: centroid.lat,
          longitude: centroid.lon,
          zoom: Math.max(prev.zoom, 6),
        }));
      }
    }
  }, [plants, handleSearchSelectPlant]);

  /**
   * Shared corridor-selection path used by map clicks, search, watchlist, and dashboard.
   *
   * Sets selectedFlow (opens CorridorPanel), clears conflicting panels,
   * and flies the map to the corridor midpoint.
   */
  const selectCorridorFlow = useCallback((from: string, to: string) => {
    // Find the matching flow record (order-independent)
    const matchedFlow = flows.find(
      (f) =>
        (f.from === from && f.to === to) ||
        (f.from === to && f.to === from)
    );

    // Open CorridorPanel via selectedFlow (primary richer path)
    if (matchedFlow) {
      setSelectedFlow(matchedFlow);
    }

    // Clear competing detail panels
    setSelectedPlant(null);
    setSelectedCountryPrice(null);
    setSelectedTyndp(null);
    setTimeSeriesAsset(null);

    // Close full-screen overlay panels that would block the corridor view
    setShowAlerts(false);
    setShowDashboard(false);
    setShowPipeline(false);

    // Focus map on corridor midpoint
    const midLon = matchedFlow
      ? (matchedFlow.fromLon + matchedFlow.toLon) / 2
      : (() => {
          const fc = COUNTRY_CENTROIDS[from];
          const tc = COUNTRY_CENTROIDS[to];
          return fc && tc ? (fc.lon + tc.lon) / 2 : null;
        })();
    const midLat = matchedFlow
      ? (matchedFlow.fromLat + matchedFlow.toLat) / 2
      : (() => {
          const fc = COUNTRY_CENTROIDS[from];
          const tc = COUNTRY_CENTROIDS[to];
          return fc && tc ? (fc.lat + tc.lat) / 2 : null;
        })();

    if (midLon !== null && midLat !== null) {
      setViewState((prev) => ({
        ...prev,
        latitude: midLat,
        longitude: midLon,
        // Zoom out slightly from current if too close; keep zoom if already wide
        zoom: Math.min(Math.max(prev.zoom, 4), 6),
      }));
    }
  }, [flows]);

  const handleScreenshot = useCallback(() => {
    try {
      const canvases = document.querySelectorAll('canvas');
      if (canvases.length === 0) return;
      const first = canvases[0];
      const offscreen = document.createElement('canvas');
      offscreen.width = first.width;
      offscreen.height = first.height;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;
      for (const canvas of canvases) {
        try {
          ctx.drawImage(canvas, 0, 0);
        } catch {
          // CORS may block base map capture
        }
      }
      const link = document.createElement('a');
      link.download = `luminus-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = offscreen.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.warn('Screenshot failed:', err);
    }
  }, []);

  const handleToggleCompareMode = useCallback(() => {
    setCompareMode((prev) => {
      if (!prev) {
        setSelectedPlant(null);
        setSelectedCountryPrice(null);
      } else {
        setCompareCountries([]);
      }
      return !prev;
    });
    setMobileSidebarOpen(false);
  }, []);

  const handleRemoveCompareCountry = useCallback((iso2: string) => {
    setCompareCountries((prev) => prev.filter((c) => c !== iso2));
  }, []);

  const handleClearCompare = useCallback(() => {
    setCompareCountries([]);
    setCompareMode(false);
  }, []);

  const handleApplyPreset = useCallback((preset: WorkspacePreset) => {
    const { layerVisibility, selectedFuels, minCapacity, selectedCountries } = preset.state;
    setLayerVisibility(layerVisibility);
    setSelectedFuels(new Set(selectedFuels));
    setMinCapacity(minCapacity);
    setSelectedCountries(selectedCountries !== null ? new Set(selectedCountries) : null);
  }, []);

  const handleDeletePreset = useCallback((id: string) => {
    deletePreset(id);
    setPresetsVersion((v) => v + 1);
  }, []);

  const handlePresetSaved = useCallback(() => {
    setPresetsVersion((v) => v + 1);
  }, []);

  const handleExportCSV = useCallback(() => {
    const header = 'Name,Fuel,Capacity_MW,Country,Latitude,Longitude,Year\n';
    const rows = filteredPlants
      .map(
        (p) =>
          `"${p.name}","${p.fuel}",${p.capacity},"${p.country}",${p.lat},${p.lon},"${p.year}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `luminus-plants-${new Date().toISOString().slice(0, 10)}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredPlants]);

  return (
    <div className="w-screen h-screen relative">
      <DeckGL
        viewState={viewState}
        onViewStateChange={handleViewStateChange}
        controller={true}
        layers={layers}
      >
        <MapLibre mapStyle={MAP_STYLE} />
      </DeckGL>

      {/* Edge vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          zIndex: 5,
          background: [
            'linear-gradient(to right, rgba(10, 14, 23, 0.5) 0%, transparent 18%)',
            'linear-gradient(to left, rgba(10, 14, 23, 0.2) 0%, transparent 8%)',
            'linear-gradient(to bottom, rgba(10, 14, 23, 0.2) 0%, transparent 8%)',
            'linear-gradient(to top, rgba(10, 14, 23, 0.3) 0%, transparent 12%)',
          ].join(', '),
        }}
      />

      <Tooltip data={tooltip} />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0e17]/70 backdrop-blur-sm">
          <div className="text-center">
            <div className="inline-block w-8 h-8 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin mb-3" />
            <p className="text-sm text-slate-400">
              Loading power plant data...
            </p>
          </div>
        </div>
      )}

      {/* Compare mode toggle */}
      <button
        onClick={handleToggleCompareMode}
        className={`absolute bottom-6 right-4 px-3 py-1.5 rounded-full text-xs font-medium transition-all backdrop-blur-xl ${
          compareMode
            ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
            : 'bg-black/60 text-slate-400 border border-white/[0.06] hover:text-white hover:border-white/10'
        }`}
        style={{ zIndex: 15 }}
      >
        <span className="flex items-center gap-1.5">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="18" rx="1" />
            <rect x="14" y="3" width="7" height="18" rx="1" />
          </svg>
          {compareMode ? 'Exit Compare' : 'Compare'}
        </span>
      </button>

      {/* Compare panel (replaces plant/price panels when active) */}
      {compareCountries.length > 0 ? (
        <ComparePanel
          selectedCountries={compareCountries}
          plants={plants}
          prices={prices}
          flows={flows}
          onRemoveCountry={handleRemoveCompareCountry}
          onClose={handleClearCompare}
        />
      ) : (
        <>
          {/* Corridor detail panel */}
          {selectedFlow && (
            <CorridorPanel
              flow={selectedFlow}
              prices={prices}
              outages={outages}
              onClose={() => setSelectedFlow(null)}
            />
          )}

          {/* TYNDP project detail panel */}
          {selectedTyndp && !selectedFlow && (
            <TyndpPanel
              project={selectedTyndp}
              onClose={() => setSelectedTyndp(null)}
            />
          )}

          {/* Plant detail panel */}
          {selectedPlant && !selectedFlow && !selectedTyndp && (
            <PlantPanel
              plant={selectedPlant}
              onClose={() => setSelectedPlant(null)}
            />
          )}

          {/* Price sparkline panel */}
          {selectedCountryPrice && selectedCountryPrice.hourly && !selectedFlow && !selectedTyndp && (
            <PriceSparkline
              hourly={selectedCountryPrice.hourly}
              countryName={selectedCountryPrice.country}
              avgPrice={selectedCountryPrice.price}
              onClose={() => setSelectedCountryPrice(null)}
            />
          )}

          {/* Outage radar panel */}
          {layerVisibility.outages && !layerVisibility.forecast && !selectedPlant && !selectedCountryPrice && !selectedFlow && !selectedTyndp && (
            <OutageRadar
              outages={outages}
              plants={plants}
              onClose={() => handleToggleLayer('outages')}
            />
          )}

          {/* Forecast vs actual panel */}
          {layerVisibility.forecast && !selectedPlant && !selectedCountryPrice && !selectedFlow && !selectedTyndp && (
            <ForecastPanel
              forecasts={forecasts}
              onClose={() => handleToggleLayer('forecast')}
            />
          )}
        </>
      )}

      {/* Sprint 4: Asset Time Series panel */}
      {timeSeriesAsset && !showAlerts && !showDashboard && !showPipeline && (
        <AssetTimeSeries
          asset={timeSeriesAsset}
          prices={prices}
          flows={flows}
          history={history}
          onClose={() => setTimeSeriesAsset(null)}
        />
      )}

      {/* Sprint 4: Alerts panel */}
      {showAlerts && (
        <AlertsPanel
          onClose={() => setShowAlerts(false)}
        />
      )}

      {/* Sprint 4: Trader Dashboard */}
      {showDashboard && (
        <TraderDashboard
          prices={prices}
          flows={flows}
          outages={outages}
          forecasts={forecasts}
          projects={TYNDP_PROJECTS}
          onSelectCountry={(iso2) => { handleSearchSelectCountry(iso2); setShowDashboard(false); }}
          onSelectCorridor={(from, to) => { selectCorridorFlow(from, to); }}
          onClose={() => setShowDashboard(false)}
        />
      )}

      {/* Sprint 4: Pipeline Intelligence panel */}
      {showPipeline && (
        <PipelinePanel
          projects={TYNDP_PROJECTS}
          prices={prices}
          flows={flows}
          onSelectProject={(project) => {
            setSelectedTyndp(project);
            setShowPipeline(false);
          }}
          onClose={() => setShowPipeline(false)}
        />
      )}

      {/* Time scrubber bar */}
      {layerVisibility.history && history && (
        <TimeScrubber
          history={history}
          onHourChange={setHistoryPriceOverride}
          onClose={() => {
            setHistoryPriceOverride(null);
            handleToggleLayer('history');
          }}
        />
      )}

      <Sidebar
        plants={plants}
        filteredPlants={filteredPlants}
        prices={prices}
        flows={flows}
        lastUpdate={lastUpdate}
        layerVisibility={layerVisibility}
        onToggleLayer={handleToggleLayer}
        isLoading={isLoading}
        selectedFuels={selectedFuels}
        onToggleFuel={handleToggleFuel}
        minCapacity={minCapacity}
        onSetMinCapacity={handleSetMinCapacity}
        selectedCountries={selectedCountries}
        onToggleCountry={handleToggleCountry}
        onSelectAllCountries={handleSelectAllCountries}
        onClearCountries={handleClearCountries}
        availableCountries={availableCountries}
        zoomLevel={zoomLevel}
        onScreenshot={handleScreenshot}
        onExportCSV={handleExportCSV}
        mobileOpen={mobileSidebarOpen}
        onToggleMobile={() => setMobileSidebarOpen((prev) => !prev)}
        hasRightPanel={
          !!(timeSeriesAsset || showAlerts || showDashboard || showPipeline ||
             selectedPlant || selectedCountryPrice || selectedFlow ||
             selectedTyndp || compareCountries.length > 0 ||
             (layerVisibility.outages && !layerVisibility.forecast && !selectedPlant && !selectedCountryPrice && !selectedFlow && !selectedTyndp) ||
             (layerVisibility.forecast && !selectedPlant && !selectedCountryPrice && !selectedFlow && !selectedTyndp))
        }
        onSelectPlant={handleSearchSelectPlant}
        onSelectCountry={handleSearchSelectCountry}
        onSelectCorridor={selectCorridorFlow}
        onSelectWatchlistPlant={handleWatchlistSelectPlant}
        onOpenAlerts={() => { setShowAlerts(true); setShowDashboard(false); setShowPipeline(false); setTimeSeriesAsset(null); }}
        onOpenDashboard={() => { setShowDashboard(true); setShowAlerts(false); setShowPipeline(false); setTimeSeriesAsset(null); }}
        onOpenPipeline={() => { setShowPipeline(true); setShowDashboard(false); setShowAlerts(false); setTimeSeriesAsset(null); }}
        onOpenTimeSeries={handleOpenTimeSeries}
        watchlistVersion={watchlistVersion}
        onWatchlistChange={() => setWatchlistVersion((v) => v + 1)}
        onApplyPreset={handleApplyPreset}
        onDeletePreset={handleDeletePreset}
        onPresetSaved={handlePresetSaved}
        presetsVersion={presetsVersion}
      />
    </div>
  );
}
