'use client';

import React, { useMemo, useState } from 'react';
import { COUNTRY_CENTROIDS } from '@/lib/countries';
import type { CountryForecast, ForecastSource } from '@/lib/data-fetcher';

interface ForecastPanelProps {
  forecasts: CountryForecast[];
  onClose: () => void;
  embedded?: boolean;
}

function countryFlag(iso2: string): string {
  return iso2
    .toUpperCase()
    .split('')
    .map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65))
    .join('');
}

function SurpriseIndicator({ source }: { source: ForecastSource }) {
  if (source.surpriseDirection === 'none') {
    return null;
  }

  const isAbove = source.surpriseDirection === 'above';
  return (
    <span className={`text-[10px] font-medium ${isAbove ? 'text-emerald-400' : 'text-red-400'}`}>
      {isAbove ? '\u25B2' : '\u25BC'} {source.surpriseMagnitude.toLocaleString()} MW
    </span>
  );
}

function MiniDualLine({
  forecastHourly,
  actualHourly,
  label,
}: {
  forecastHourly: number[];
  actualHourly: number[];
  label: string;
}) {
  const maxLen = Math.max(forecastHourly.length, actualHourly.length);
  if (maxLen === 0) {
    return <span className="text-[10px] text-slate-600">No {label} data</span>;
  }

  const allValues = [...forecastHourly, ...actualHourly];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const width = 200;
  const height = 44;
  const padding = 2;

  const toPoints = (series: number[]) =>
    series
      .map((value, index) => {
        const x = padding + (index / (maxLen - 1 || 1)) * (width - padding * 2);
        const y = height - padding - ((value - min) / range) * (height - padding * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  return (
    <div>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="none"
      >
        {forecastHourly.length > 0 && (
          <polyline
            points={toPoints(forecastHourly)}
            fill="none"
            stroke="rgba(148, 163, 184, 0.4)"
            strokeWidth="1"
            strokeDasharray="3,2"
            strokeLinecap="round"
          />
        )}
        {actualHourly.length > 0 && (
          <polyline
            points={toPoints(actualHourly)}
            fill="none"
            stroke={label === 'Wind' ? 'rgb(56, 189, 248)' : 'rgb(250, 204, 21)'}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      <div className="mt-0.5 flex justify-between px-0.5 text-[9px] text-slate-600">
        <span>{min.toLocaleString()} MW</span>
        <span>{max.toLocaleString()} MW</span>
      </div>
    </div>
  );
}

function SourceRow({
  label,
  source,
  emoji,
}: {
  label: string;
  source: ForecastSource;
  emoji: string;
}) {
  const errorPct = source.forecastMW > 0
    ? ((source.actualMW - source.forecastMW) / source.forecastMW * 100).toFixed(1)
    : '0.0';
  const isPositive = source.actualMW >= source.forecastMW;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm">{emoji}</span>
        <span className="text-xs font-medium text-slate-300">{label}</span>
        <SurpriseIndicator source={source} />
      </div>

      <MiniDualLine
        forecastHourly={source.forecastHourly}
        actualHourly={source.actualHourly}
        label={label}
      />

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <div className="text-slate-500">Forecast</div>
          <div className="tabular-nums text-slate-300">{source.forecastMW.toLocaleString()} MW</div>
        </div>
        <div>
          <div className="text-slate-500">Actual</div>
          <div className="tabular-nums text-slate-300">{source.actualMW.toLocaleString()} MW</div>
        </div>
        <div>
          <div className="text-slate-500">Error</div>
          <div className={`font-medium tabular-nums ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {isPositive ? '+' : ''}{errorPct}%
          </div>
        </div>
      </div>

      <div className="flex gap-3 text-[10px] text-slate-600">
        <span>MAE: {source.mae.toLocaleString()} MW</span>
        <span>MAPE: {source.mape}%</span>
        <span>Bias: {source.bias > 0 ? '+' : ''}{source.bias.toLocaleString()} MW</span>
      </div>
    </div>
  );
}

function CountryForecastCard({
  forecast,
  isExpanded,
  onToggle,
}: {
  forecast: CountryForecast;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const countryName = COUNTRY_CENTROIDS[forecast.iso2]?.name || forecast.country;
  const totalForecast = forecast.wind.forecastMW + forecast.solar.forecastMW;
  const totalActual = forecast.wind.actualMW + forecast.solar.actualMW;
  const totalError = totalForecast > 0
    ? Math.abs(((totalActual - totalForecast) / totalForecast) * 100)
    : 0;
  const hasWindSurprise = forecast.wind.surpriseDirection !== 'none';
  const hasSolarSurprise = forecast.solar.surpriseDirection !== 'none';

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.03]"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{countryFlag(forecast.iso2)}</span>
          <span className="flex-1 text-sm font-medium text-slate-200">
            {countryName}
          </span>
          {(hasWindSurprise || hasSolarSurprise) && (
            <span className="text-[9px] font-medium text-amber-400">SURPRISE</span>
          )}
          <span className="text-xs tabular-nums text-slate-400">
            {totalError.toFixed(1)}% err
          </span>
          <span className="text-[10px] text-slate-600">
            {isExpanded ? '\u25B4' : '\u25BE'}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="mb-3 ml-2 mr-2 space-y-4 rounded-lg bg-white/[0.02] px-2 py-3">
          {(forecast.wind.forecastHourly.length > 0 || forecast.wind.actualHourly.length > 0) && (
            <SourceRow label="Wind" source={forecast.wind} emoji={String.fromCodePoint(0x1f4a8)} />
          )}
          {(forecast.solar.forecastHourly.length > 0 || forecast.solar.actualHourly.length > 0) && (
            <SourceRow label="Solar" source={forecast.solar} emoji={String.fromCodePoint(0x2600)} />
          )}
          <div className="flex items-center gap-3 border-t border-white/[0.06] pt-2 text-[10px] text-slate-600">
            <span className="flex items-center gap-1">
              <span className="inline-block h-px w-4" style={{ borderTop: '1px dashed rgba(148,163,184,0.4)' }} />
              Forecast
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-px w-4 bg-sky-400" />
              Actual
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="absolute right-4 top-4 text-lg text-slate-500 transition-colors hover:text-white"
      aria-label="Close forecast panel"
    >
      &#10005;
    </button>
  );
}

export default function ForecastPanel({
  forecasts,
  onClose,
  embedded = false,
}: ForecastPanelProps) {
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...forecasts].sort((a, b) => (Math.abs(b.wind.bias) + Math.abs(b.solar.bias)) - (Math.abs(a.wind.bias) + Math.abs(a.solar.bias))),
    [forecasts],
  );

  const surpriseCount = useMemo(
    () => sorted.filter((forecast) => forecast.wind.surpriseDirection !== 'none' || forecast.solar.surpriseDirection !== 'none').length,
    [sorted],
  );

  const containerClass = embedded ? 'flex h-full flex-col' : 'forecast-panel';

  if (sorted.length === 0) {
    return (
      <div className={embedded ? 'space-y-2' : containerClass}>
        {!embedded && <CloseButton onClose={onClose} />}
        <h2 className="text-lg font-bold text-white">Forecast vs Actual</h2>
        <p className="text-sm text-slate-400">No forecast data available for today.</p>
      </div>
    );
  }

  return (
    <div className={containerClass}>
      {!embedded && <CloseButton onClose={onClose} />}

      <h2 className="text-lg font-bold text-white">Forecast vs Actual</h2>
      <p className="mb-4 text-xs text-slate-500">
        Wind &amp; solar generation: forecast vs reality today
      </p>

      {surpriseCount > 0 && (
        <div className="mb-4 flex items-baseline gap-2 border-b border-white/[0.06] pb-3">
          <span className="text-2xl font-bold text-amber-400">{surpriseCount}</span>
          <span className="text-sm text-slate-400">
            {surpriseCount === 1 ? 'country' : 'countries'} with surprises
          </span>
        </div>
      )}

      <div className={`space-y-1 overflow-y-auto sidebar-scroll ${embedded ? 'flex-1 pr-1' : 'max-h-[60vh]'}`}>
        {sorted.map((forecast) => (
          <CountryForecastCard
            key={forecast.iso2}
            forecast={forecast}
            isExpanded={expandedCountry === forecast.iso2}
            onToggle={() => setExpandedCountry((prev) => (prev === forecast.iso2 ? null : forecast.iso2))}
          />
        ))}
      </div>
    </div>
  );
}
