'use client';

import { useMemo, useState } from 'react';
import { COUNTRY_CENTROIDS } from '@/lib/countries';
import type { CountryForecast, ForecastSource } from '@/lib/data-fetcher';

interface ForecastPanelProps {
  forecasts: CountryForecast[];
  onClose: () => void;
}

function countryFlag(iso2: string): string {
  return iso2
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

function SurpriseIndicator({ source }: { source: ForecastSource }) {
  if (source.surpriseDirection === 'none') return null;
  const isAbove = source.surpriseDirection === 'above';
  return (
    <span
      className={`text-[10px] font-medium ${
        isAbove ? 'text-emerald-400' : 'text-red-400'
      }`}
    >
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

  const allVals = [...forecastHourly, ...actualHourly];
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;
  const w = 200;
  const h = 44;
  const pad = 2;

  const toPoints = (data: number[]) =>
    data
      .map((v, i) => {
        const x = pad + (i / (maxLen - 1 || 1)) * (w - pad * 2);
        const y = h - pad - ((v - min) / range) * (h - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const fcPoints = toPoints(forecastHourly);
  const actPoints = toPoints(actualHourly);

  return (
    <div>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        preserveAspectRatio="none"
      >
        {forecastHourly.length > 0 && (
          <polyline
            points={fcPoints}
            fill="none"
            stroke="rgba(148, 163, 184, 0.4)"
            strokeWidth="1"
            strokeDasharray="3,2"
            strokeLinecap="round"
          />
        )}
        {actualHourly.length > 0 && (
          <polyline
            points={actPoints}
            fill="none"
            stroke={label === 'Wind' ? 'rgb(56, 189, 248)' : 'rgb(250, 204, 21)'}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      <div className="flex justify-between text-[9px] text-slate-600 mt-0.5 px-0.5">
        <span>{min.toLocaleString()} MW</span>
        <span>{max.toLocaleString()} MW</span>
      </div>
    </div>
  );
}

function SourceRow({ label, source, emoji }: { label: string; source: ForecastSource; emoji: string }) {
  const errorPct = source.forecastMW > 0
    ? ((source.actualMW - source.forecastMW) / source.forecastMW * 100).toFixed(1)
    : '0.0';
  const isPositive = source.actualMW >= source.forecastMW;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm">{emoji}</span>
        <span className="text-xs text-slate-300 font-medium">{label}</span>
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
          <div className="text-slate-300 tabular-nums">{source.forecastMW.toLocaleString()} MW</div>
        </div>
        <div>
          <div className="text-slate-500">Actual</div>
          <div className="text-slate-300 tabular-nums">{source.actualMW.toLocaleString()} MW</div>
        </div>
        <div>
          <div className="text-slate-500">Error</div>
          <div className={`tabular-nums font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
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
        onClick={onToggle}
        className="w-full text-left px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{countryFlag(forecast.iso2)}</span>
          <span className="text-sm text-slate-200 font-medium flex-1">
            {countryName}
          </span>
          {(hasWindSurprise || hasSolarSurprise) && (
            <span className="text-[9px] text-amber-400 font-medium">SURPRISE</span>
          )}
          <span className="text-xs text-slate-400 tabular-nums">
            {totalError.toFixed(1)}% err
          </span>
          <span className="text-[10px] text-slate-600">
            {isExpanded ? '\u25B4' : '\u25BE'}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="ml-2 mr-2 mb-3 space-y-4 px-2 py-3 rounded-lg bg-white/[0.02]">
          {(forecast.wind.forecastHourly.length > 0 || forecast.wind.actualHourly.length > 0) && (
            <SourceRow label="Wind" source={forecast.wind} emoji={String.fromCodePoint(0x1F4A8)} />
          )}
          {(forecast.solar.forecastHourly.length > 0 || forecast.solar.actualHourly.length > 0) && (
            <SourceRow label="Solar" source={forecast.solar} emoji={String.fromCodePoint(0x2600)} />
          )}
          <div className="flex items-center gap-3 pt-2 border-t border-white/[0.06] text-[10px] text-slate-600">
            <span className="flex items-center gap-1">
              <span className="w-4 h-px inline-block" style={{ borderTop: '1px dashed rgba(148,163,184,0.4)' }} />
              Forecast
            </span>
            <span className="flex items-center gap-1">
              <span className="w-4 h-px inline-block bg-sky-400" />
              Actual
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ForecastPanel({ forecasts, onClose }: ForecastPanelProps) {
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...forecasts].sort((a, b) => {
      const aErr = Math.abs(a.wind.bias) + Math.abs(a.solar.bias);
      const bErr = Math.abs(b.wind.bias) + Math.abs(b.solar.bias);
      return bErr - aErr;
    });
  }, [forecasts]);

  const surpriseCount = useMemo(
    () =>
      sorted.filter(
        (f) => f.wind.surpriseDirection !== 'none' || f.solar.surpriseDirection !== 'none'
      ).length,
    [sorted]
  );

  if (sorted.length === 0) {
    return (
      <div className="forecast-panel">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors text-lg"
        >
          &#10005;
        </button>
        <h2 className="text-lg font-bold text-white mb-1">Forecast vs Actual</h2>
        <p className="text-sm text-slate-400">No forecast data available for today.</p>
      </div>
    );
  }

  return (
    <div className="forecast-panel">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors text-lg"
      >
        &#10005;
      </button>

      <h2 className="text-lg font-bold text-white mb-1">Forecast vs Actual</h2>
      <p className="text-xs text-slate-500 mb-4">
        Wind &amp; solar generation: forecast vs reality today
      </p>

      {surpriseCount > 0 && (
        <div className="flex items-baseline gap-2 mb-4 pb-3 border-b border-white/[0.06]">
          <span className="text-2xl font-bold text-amber-400">{surpriseCount}</span>
          <span className="text-sm text-slate-400">
            {surpriseCount === 1 ? 'country' : 'countries'} with surprises
          </span>
        </div>
      )}

      <div className="space-y-1 max-h-[60vh] overflow-y-auto sidebar-scroll">
        {sorted.map((f) => (
          <CountryForecastCard
            key={f.iso2}
            forecast={f}
            isExpanded={expandedCountry === f.iso2}
            onToggle={() =>
              setExpandedCountry((prev) => (prev === f.iso2 ? null : f.iso2))
            }
          />
        ))}
      </div>
    </div>
  );
}
