'use client';

interface MiniChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  labels?: string[];
  /** Optional dashed ceiling line at this value */
  ceiling?: number;
}

export default function MiniChart({
  data,
  width = 240,
  height = 60,
  color = '#38bdf8',
  labels,
  ceiling,
}: MiniChartProps) {
  if (data.length < 2) return null;

  const pad = 4;
  const min = Math.min(...data);
  const max = ceiling != null ? Math.max(ceiling, ...data) : Math.max(...data);
  const range = max - min || 1;

  const toX = (i: number) => pad + (i / (data.length - 1)) * (width - pad * 2);
  const toY = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2);

  const pts = data.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
  const fill = `${pad},${height - pad} ${pts} ${width - pad},${height - pad}`;

  const minIdx = data.indexOf(min);
  const maxIdx = data.indexOf(max);

  return (
    <div>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="none"
      >
        {ceiling != null && (
          <line
            x1={pad} y1={toY(ceiling)} x2={width - pad} y2={toY(ceiling)}
            stroke="rgba(255,255,255,0.1)" strokeWidth={1} strokeDasharray="3 3"
          />
        )}
        <polygon points={fill} fill={`${color}1a`} />
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {maxIdx !== minIdx && (
          <>
            <circle cx={toX(maxIdx)} cy={toY(data[maxIdx])} r="3" fill="#f87171" />
            <circle cx={toX(minIdx)} cy={toY(data[minIdx])} r="3" fill="#4ade80" />
          </>
        )}
      </svg>
      {labels && labels.length > 0 && (
        <div className="flex justify-between text-[10px] text-slate-600 mt-0.5 px-1">
          {labels.map((l) => <span key={l}>{l}</span>)}
        </div>
      )}
    </div>
  );
}
