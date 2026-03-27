'use client';

import React, { useMemo, useState } from 'react';
import { COUNTRY_CENTROIDS } from '@/lib/countries';
import type { CountryForecast, ForecastSource } from '@/lib/data-fetcher';
import { resolveForecastTimestamps } from '@/lib/series-timestamps';
import InteractiveTimeSeriesChart from './charts/InteractiveTimeSeriesChart';
import type { ExpandedSeriesConfig } from './charts/ExpandedSeriesPanel';

interface ForecastPanelProps {
  forecasts: CountryForecast[];
  onClose: () => void;
  embedded?: boolean;
  onExpandSeries?: (config: ExpandedSeriesConfig) => void;
}

function countryFlag(iso2: string): string {
  return iso2
    .toUpperCase()
    .split('')
    .map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65))
    .join('');
}

function SurpriseIndicator({ source }: { source: ForecastSource }) {
  if (!getActualCoverage(source).hasComparableActual || source.surpriseDirection === 'none') {
    return null;
  }

  const isAbove = source.surpriseDirection === 'above';
  return (
    <span className={`text-[10px] font-medium ${isAbove ? 'text-emerald-400' : 'text-red-400'}`}>
      {isAbove ? '\u25B2' : '\u25BC'} {source.surpriseMagnitude.toLocaleString()} MW
    </span>
  );
}

function buildSeries(label: 'Wind' | 'Solar', iso2: string, source: ForecastSource) {
  const actualColor = label === 'Wind' ? 'rgb(56, 189, 248)' : 'rgb(250, 204, 21)';
  return [
    {
      id: `${iso2}-${label.toLowerCase()}-forecast`,
      label: `${label} forecast`,
      values: source.forecastHourly,
      color: 'rgba(148, 163, 184, 0.9)',
      dashed: true,
    },
    {
      id: `${iso2}-${label.toLowerCase()}-actual`,
      label: `${label} actual`,
      values: source.actualHourly,
      color: actualColor,
    },
  ].filter((line) => line.values.length > 0);
}

function getActualCoverage(source: ForecastSource) {
  const forecastPoints = Math.max(source.forecastHourly.length, source.timestampsUtc?.length ?? 0);
  const actualPoints = source.actualHourly.length;
  const minimumComparablePoints = forecastPoints <= 4
    ? 1
    : Math.min(4, Math.max(2, Math.floor(forecastPoints / 6)));

  return {
    forecastPoints,
    actualPoints,
    hasLiveActual: actualPoints > 0,
    hasComparableActual: actualPoints >= minimumComparablePoints,
  };
}

function formatActualCoverage(source: ForecastSource) {
  const coverage = getActualCoverage(source);
  if (!coverage.hasLiveActual) {
    return 'Pending';
  }
  if (coverage.hasComparableActual) {
    return `${coverage.actualPoints}/${coverage.forecastPoints || coverage.actualPoints} live`;
  }
  return `${coverage.actualPoints} live pt${coverage.actualPoints === 1 ? '' : 's'}`;
}

function getCountryCoverageScore(forecast: CountryForecast) {
  return [forecast.wind, forecast.solar].reduce((score, source) => {
    const coverage = getActualCoverage(source);
    if (coverage.hasComparableActual) {
      return score + 2;
    }
    if (coverage.hasLiveActual) {
      return score + 1;
    }
    return score;
  }, 0);
}

function SourceRow({
  label,
  source,
  emoji,
  onExpand,
  iso2,
}: {
  label: 'Wind' | 'Solar';
  source: ForecastSource;
  emoji: string;
  onExpand?: () => void;
  iso2: string;
}) {
  const coverage = getActualCoverage(source);
  const errorPct = coverage.hasComparableActual && source.forecastMW > 0
    ? ((source.actualMW - source.forecastMW) / source.forecastMW * 100).toFixed(1)
    : null;
  const isPositive = errorPct != null ? source.actualMW >= source.forecastMW : false;
  const actualStatus = formatActualCoverage(source);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm">{emoji}</span>
        <span className="text-xs font-medium text-slate-300">{label}</span>
        <SurpriseIndicator source={source} />
      </div>

      <InteractiveTimeSeriesChart
        title={`${label} profile`}
        subtitle="Hover to inspect forecast and actual values"
        unitLabel="MW"
        timestampsUtc={resolveForecastTimestamps(source)}
        series={buildSeries(label, iso2, source)}
        height={88}
        onExpand={onExpand}
      />

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <div className="text-slate-500">Forecast</div>
          <div className="tabular-nums text-slate-300">{source.forecastMW.toLocaleString()} MW</div>
        </div>
        <div>
          <div className="text-slate-500">Actual</div>
          <div className="tabular-nums text-slate-300">
            {coverage.hasLiveActual ? `${source.actualMW.toLocaleString()} MW` : 'Pending'}
          </div>
        </div>
        <div>
          <div className="text-slate-500">{errorPct == null ? 'Actual status' : 'Error'}</div>
          {errorPct == null ? (
            <div className="font-medium text-amber-300">{actualStatus}</div>
          ) : (
            <div className={`font-medium tabular-nums ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {isPositive ? '+' : ''}
              {errorPct}%
            </div>
          )}
        </div>
      </div>

      {coverage.hasComparableActual ? (
        <div className="flex gap-3 text-[10px] text-slate-600">
          <span>MAE: {source.mae.toLocaleString()} MW</span>
          <span>MAPE: {source.mape}%</span>
          <span>Bias: {source.bias > 0 ? '+' : ''}{source.bias.toLocaleString()} MW</span>
        </div>
      ) : (
        <div className="text-[10px] text-slate-600">
          {coverage.hasLiveActual
            ? `Live actual is still sparse for this market: ${actualStatus}.`
            : 'Live actual is still pending from the provider for this market.'}
        </div>
      )}
    </div>
  );
}

function CountryForecastCard({
  forecast,
  isExpanded,
  onToggle,
  onExpandSeries,
}: {
  forecast: CountryForecast;
  isExpanded: boolean;
  onToggle: () => void;
  onExpandSeries?: (config: ExpandedSeriesConfig) => void;
}) {
  const countryName = COUNTRY_CENTROIDS[forecast.iso2]?.name || forecast.country;
  const totalForecast = forecast.wind.forecastMW + forecast.solar.forecastMW;
  const totalActual = forecast.wind.actualMW + forecast.solar.actualMW;
  const hasComparableActual = getActualCoverage(forecast.wind).hasComparableActual
    || getActualCoverage(forecast.solar).hasComparableActual;
  const hasLiveActual = getActualCoverage(forecast.wind).hasLiveActual
    || getActualCoverage(forecast.solar).hasLiveActual;
  const totalError = hasComparableActual && totalForecast > 0
    ? Math.abs(((totalActual - totalForecast) / totalForecast) * 100)
    : null;
  const hasWindSurprise = getActualCoverage(forecast.wind).hasComparableActual
    && forecast.wind.surpriseDirection !== 'none';
  const hasSolarSurprise = getActualCoverage(forecast.solar).hasComparableActual
    && forecast.solar.surpriseDirection !== 'none';
  const windSeries = buildSeries('Wind', forecast.iso2, forecast.wind);
  const solarSeries = buildSeries('Solar', forecast.iso2, forecast.solar);
  const windTimestamps = resolveForecastTimestamps(forecast.wind);
  const solarTimestamps = resolveForecastTimestamps(forecast.solar);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.03]"
        aria-label={countryName}
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
            {totalError != null
              ? `${totalError.toFixed(1)}% err`
              : hasLiveActual
                ? 'Actual thin'
                : 'Actual pending'}
          </span>
          <span className="text-[10px] text-slate-600">
            {isExpanded ? '\u25B4' : '\u25BE'}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="mb-3 ml-2 mr-2 space-y-4 rounded-lg bg-white/[0.02] px-2 py-3">
          {(forecast.wind.forecastHourly.length > 0 || forecast.wind.actualHourly.length > 0) && (
            <SourceRow
              label="Wind"
              source={forecast.wind}
              emoji={String.fromCodePoint(0x1f4a8)}
              iso2={forecast.iso2}
              onExpand={onExpandSeries
                ? () => onExpandSeries({
                    title: `${countryName} wind analysis`,
                    unitLabel: 'MW',
                    timestampsUtc: windTimestamps,
                    series: windSeries,
                    candidates: solarSeries,
                  })
                : undefined}
            />
          )}
          {(forecast.solar.forecastHourly.length > 0 || forecast.solar.actualHourly.length > 0) && (
            <SourceRow
              label="Solar"
              source={forecast.solar}
              emoji={String.fromCodePoint(0x2600)}
              iso2={forecast.iso2}
              onExpand={onExpandSeries
                ? () => onExpandSeries({
                    title: `${countryName} solar analysis`,
                    unitLabel: 'MW',
                    timestampsUtc: solarTimestamps,
                    series: solarSeries,
                    candidates: windSeries,
                  })
                : undefined}
            />
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
  onExpandSeries,
}: ForecastPanelProps) {
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...forecasts].sort((a, b) => {
      const coverageDelta = getCountryCoverageScore(b) - getCountryCoverageScore(a);
      if (coverageDelta !== 0) {
        return coverageDelta;
      }
      return (Math.abs(b.wind.bias) + Math.abs(b.solar.bias)) - (Math.abs(a.wind.bias) + Math.abs(a.solar.bias));
    }),
    [forecasts],
  );

  const surpriseCount = useMemo(
    () => sorted.filter((forecast) =>
      (getActualCoverage(forecast.wind).hasComparableActual && forecast.wind.surpriseDirection !== 'none')
      || (getActualCoverage(forecast.solar).hasComparableActual && forecast.solar.surpriseDirection !== 'none')
    ).length,
    [sorted],
  );
  const pendingActualCount = useMemo(
    () => sorted.filter((forecast) => getCountryCoverageScore(forecast) === 0).length,
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

      {pendingActualCount > 0 && (
        <p className="mb-4 text-[11px] leading-relaxed text-slate-500">
          Some markets still do not publish live actual generation into ENTSO-E for the active window. Those rows stay visible but are marked pending instead of being scored as misses.
        </p>
      )}

      <div className={`space-y-1 overflow-y-auto sidebar-scroll ${embedded ? 'flex-1 pr-1' : 'max-h-[60vh]'}`}>
        {sorted.map((forecast) => (
          <CountryForecastCard
            key={forecast.iso2}
            forecast={forecast}
            isExpanded={expandedCountry === forecast.iso2}
            onToggle={() => setExpandedCountry((prev) => (prev === forecast.iso2 ? null : forecast.iso2))}
            onExpandSeries={onExpandSeries}
          />
        ))}
      </div>
    </div>
  );
}
