'use client';

import React from 'react';
import type { LiveStatusSummary } from '@/lib/live-data-store';

interface LiveStatusStripProps {
  summary: LiveStatusSummary;
  onRefresh: () => void;
}

const STATUS_STYLES: Record<LiveStatusSummary['status'], string> = {
  live: 'border-emerald-400/30 bg-emerald-400/12 text-emerald-300',
  refreshing: 'border-sky-400/30 bg-sky-400/12 text-sky-300',
  stale: 'border-amber-400/30 bg-amber-400/12 text-amber-300',
  fallback: 'border-orange-400/30 bg-orange-400/12 text-orange-300',
};

export default function LiveStatusStrip({ summary, onRefresh }: LiveStatusStripProps) {
  return (
    <div
      data-tour-id="live-status"
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.06] bg-black/35 px-3 py-2"
      aria-live="polite"
    >
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] ${STATUS_STYLES[summary.status]}`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            summary.isRefreshing ? 'animate-pulse bg-current' : 'bg-current'
          }`}
        />
        {summary.label}
      </span>

      <span className="text-[11px] text-slate-300">{summary.updatedAtLabel}</span>
      <span className="text-[11px] text-slate-500">{summary.autoRefreshLabel}</span>
      {summary.hasStale && <span className="text-[11px] text-amber-300">Some datasets are stale</span>}
      {summary.hasFallback && <span className="text-[11px] text-orange-300">Fallback retained</span>}

      <button
        type="button"
        onClick={onRefresh}
        className="ml-auto rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1.5 text-[11px] font-medium text-sky-200 transition-colors hover:border-sky-400/40 hover:bg-sky-400/16"
      >
        {summary.isRefreshing ? 'Refreshing...' : 'Refresh now'}
      </button>
    </div>
  );
}
