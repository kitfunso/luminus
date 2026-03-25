'use client';

import { type CSSProperties } from 'react';

export interface TooltipData {
  x: number;
  y: number;
  eyebrow?: string;
  title?: string;
  content: Record<string, string | number>;
}

interface TooltipProps {
  data: TooltipData | null;
}

const style: CSSProperties = {
  position: 'absolute',
  zIndex: 100,
  pointerEvents: 'none',
  background: 'linear-gradient(180deg, rgba(12, 18, 30, 0.97), rgba(8, 12, 20, 0.95))',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '16px',
  padding: '14px 16px',
  fontSize: '13px',
  lineHeight: '1.6',
  color: '#e2e8f0',
  maxWidth: '320px',
  backdropFilter: 'blur(16px)',
  boxShadow: '0 18px 40px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(56, 189, 248, 0.08)',
};

export default function Tooltip({ data }: TooltipProps) {
  if (!data) return null;

  return (
    <div style={{ ...style, left: data.x + 12, top: data.y + 12 }}>
      {(data.eyebrow || data.title) && (
        <div className="mb-2 border-b border-white/[0.06] pb-2">
          {data.eyebrow && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
              {data.eyebrow}
            </p>
          )}
          {data.title && (
            <p className="mt-1 text-sm font-semibold text-white">{data.title}</p>
          )}
        </div>
      )}
      <div className="space-y-2">
        {Object.entries(data.content).map(([key, value]) => (
          key
            ? (
              <div
                key={key}
                className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.04] bg-white/[0.03] px-3 py-2"
              >
                <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{key}</span>
                <span className="max-w-[10rem] text-right text-sm font-medium text-white">{value}</span>
              </div>
            ) : (
              <div
                key="hint"
                className="rounded-xl border border-dashed border-cyan-300/18 bg-cyan-300/[0.05] px-3 py-2 text-[11px] text-cyan-100/80"
              >
                {value}
              </div>
            )
        ))}
      </div>
    </div>
  );
}
