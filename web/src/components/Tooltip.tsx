'use client';

import { type CSSProperties } from 'react';

export interface TooltipData {
  x: number;
  y: number;
  content: Record<string, string | number>;
}

interface TooltipProps {
  data: TooltipData | null;
}

const style: CSSProperties = {
  position: 'absolute',
  zIndex: 100,
  pointerEvents: 'none',
  background: 'rgba(10, 14, 23, 0.95)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '12px',
  padding: '12px 16px',
  fontSize: '13px',
  lineHeight: '1.6',
  color: '#e2e8f0',
  maxWidth: '280px',
  backdropFilter: 'blur(16px)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(56, 189, 248, 0.08)',
};

export default function Tooltip({ data }: TooltipProps) {
  if (!data) return null;

  return (
    <div style={{ ...style, left: data.x + 12, top: data.y + 12 }}>
      {Object.entries(data.content).map(([key, value]) => (
        <div key={key} className="flex justify-between gap-4">
          <span className="text-slate-500 text-xs">{key}</span>
          <span className="font-medium text-sm">{value}</span>
        </div>
      ))}
    </div>
  );
}
