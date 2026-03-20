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
  background: 'rgba(10, 14, 23, 0.92)',
  border: '1px solid rgba(56, 189, 248, 0.3)',
  borderRadius: '8px',
  padding: '10px 14px',
  fontSize: '13px',
  lineHeight: '1.5',
  color: '#e2e8f0',
  maxWidth: '300px',
  backdropFilter: 'blur(8px)',
};

export default function Tooltip({ data }: TooltipProps) {
  if (!data) return null;

  return (
    <div style={{ ...style, left: data.x + 12, top: data.y + 12 }}>
      {Object.entries(data.content).map(([key, value]) => (
        <div key={key} className="flex justify-between gap-4">
          <span className="text-slate-400">{key}</span>
          <span className="font-medium">{value}</span>
        </div>
      ))}
    </div>
  );
}
