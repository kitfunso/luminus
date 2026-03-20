'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, ArcLayer, GeoJsonLayer } from '@deck.gl/layers';
import { Map as MapLibre } from 'react-map-gl/maplibre';
import type { PickingInfo } from '@deck.gl/core';
import 'maplibre-gl/dist/maplibre-gl.css';

import Sidebar from './Sidebar';
import Tooltip, { type TooltipData } from './Tooltip';
import {
  getFuelColor,
  normalizeFuel,
  priceToColor,
  FUEL_LABELS,
  FUEL_FILTER_MAP,
  FILTER_FUELS,
} from '@/lib/colors';
import { COUNTRY_CENTROIDS, EU_COUNTRY_CODES } from '@/lib/countries';
import {
  fetchPowerPlants,
  fetchDayAheadPrices,
  fetchCrossBorderFlows,
  type PowerPlant,
  type CountryPrice,
  type CrossBorderFlow,
} from '@/lib/data-fetcher';

const INITIAL_VIEW_STATE = {
  latitude: 50.5,
  longitude: 10.0,
  zoom: 4,
  pitch: 20,
  bearing: 0,
};

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const REFRESH_INTERVAL = 5 * 60 * 1000;

export default function EnergyMap() {
  const [plants, setPlants] = useState<PowerPlant[]>([]);
  const [prices, setPrices] = useState<CountryPrice[]>([]);
  const [flows, setFlows] = useState<CrossBorderFlow[]>([]);
  const [geoJson, setGeoJson] = useState<any>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [lastUpdate, setLastUpdate] = useState('loading...');
  const [isLoading, setIsLoading] = useState(true);
  const [layerVisibility, setLayerVisibility] = useState({
    plants: true,
    prices: true,
    flows: true,
  });

  // Filter state
  const [selectedFuels, setSelectedFuels] = useState<Set<string>>(
    () => new Set(FILTER_FUELS)
  );
  const [minCapacity, setMinCapacity] = useState(50);
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(
    new Set()
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const [plantsData, pricesData, flowsData] = await Promise.all([
      fetchPowerPlants(),
      fetchDayAheadPrices(),
      fetchCrossBorderFlows(),
    ]);
    setPlants(plantsData);
    setPrices(pricesData);
    setFlows(flowsData);
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

  // Filtered plants based on fuel, capacity, and country selections
  const filteredPlants = useMemo(() => {
    return plants.filter((p) => {
      const fuel = normalizeFuel(p.fuel);
      const filterCat = FUEL_FILTER_MAP[fuel] || 'other';
      if (!selectedFuels.has(filterCat)) return false;
      if (p.capacity < minCapacity) return false;
      if (selectedCountries.size > 0 && !selectedCountries.has(p.country))
        return false;
      return true;
    });
  }, [plants, selectedFuels, minCapacity, selectedCountries]);

  // Countries that have visible plants (for stats)
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
      map.set(p.iso2, p);
    }
    return map;
  }, [prices]);

  const layers = useMemo(() => {
    const result: any[] = [];

    // Price heatmap (GeoJSON fill)
    if (layerVisibility.prices && geoJson) {
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
          updateTriggers: {
            getFillColor: [priceLookup],
          },
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
        })
      );
    }

    // Cross-border flow arrows
    if (layerVisibility.flows) {
      result.push(
        new ArcLayer<CrossBorderFlow>({
          id: 'cross-border-flows',
          data: flows,
          getSourcePosition: (d) => [d.fromLon, d.fromLat],
          getTargetPosition: (d) => [d.toLon, d.toLat],
          getSourceColor: [74, 222, 128, 200],
          getTargetColor: [248, 113, 113, 200],
          getWidth: (d) => Math.max(1, d.flowMW / 500),
          widthMinPixels: 1,
          widthMaxPixels: 8,
          greatCircle: true,
          pickable: true,
          onHover: (info: PickingInfo<CrossBorderFlow>) => {
            if (!info.object) {
              setTooltip(null);
              return;
            }
            const d = info.object;
            const fromName = COUNTRY_CENTROIDS[d.from]?.name || d.from;
            const toName = COUNTRY_CENTROIDS[d.to]?.name || d.to;
            const pct = ((d.flowMW / d.capacityMW) * 100).toFixed(0);
            setTooltip({
              x: info.x,
              y: info.y,
              content: {
                Flow: `${fromName} \u2192 ${toName}`,
                MW: d.flowMW.toLocaleString(),
                'Capacity %': `${pct}%`,
              },
            });
          },
        })
      );
    }

    // Power plant locations (filtered)
    if (layerVisibility.plants) {
      result.push(
        new ScatterplotLayer<PowerPlant>({
          id: 'power-plants',
          data: filteredPlants,
          getPosition: (d) => [d.lon, d.lat],
          getFillColor: (d) => getFuelColor(d.fuel),
          getRadius: (d) => Math.max(800, Math.sqrt(d.capacity) * 120),
          radiusMinPixels: 2,
          radiusMaxPixels: 20,
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
        })
      );
    }

    return result;
  }, [filteredPlants, flows, geoJson, priceLookup, layerVisibility]);

  const handleToggleLayer = useCallback(
    (layer: 'plants' | 'prices' | 'flows') => {
      setLayerVisibility((prev) => ({ ...prev, [layer]: !prev[layer] }));
    },
    []
  );

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
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  return (
    <div className="w-screen h-screen relative">
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
      >
        <MapLibre mapStyle={MAP_STYLE} />
      </DeckGL>

      {/* Edge vignette for immersive blending */}
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

      <Sidebar
        plants={plants}
        filteredPlants={filteredPlants}
        prices={prices}
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
        availableCountries={availableCountries}
      />
    </div>
  );
}
