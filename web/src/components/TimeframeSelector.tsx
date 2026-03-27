'use client';

import type { Timeframe } from '@/lib/store';

const OPTIONS: { value: Timeframe; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'day-ahead', label: 'Day-Ahead' },
  { value: 'trend', label: '3-Day' },
];

interface TimeframeSelectorProps {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
}

export default function TimeframeSelector({ value, onChange }: TimeframeSelectorProps) {
  return (
    <div
      data-tour-id="timeframe-selector"
      className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/[0.06] bg-[#0a0e17]/92 px-1 py-1 shadow-2xl backdrop-blur-xl"
    >
      {OPTIONS.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-3.5 py-1 text-[11px] font-medium transition-all ${
              isActive
                ? 'border border-sky-500/30 bg-sky-500/20 text-sky-400'
                : 'border border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
