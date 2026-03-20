'use client';

interface PriceSparklineProps {
  hourly: number[];
  countryName: string;
  avgPrice: number;
  onClose: () => void;
}

export default function PriceSparkline({
  hourly,
  countryName,
  avgPrice,
  onClose,
}: PriceSparklineProps) {
  if (hourly.length === 0) return null;

  const min = Math.min(...hourly);
  const max = Math.max(...hourly);
  const range = max - min || 1;
  const h = 80;
  const w = 240;
  const pad = 4;

  const points = hourly
    .map((v, i) => {
      const x = pad + (i / (hourly.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const fillPoints = `${pad},${h - pad} ${points} ${w - pad},${h - pad}`;

  return (
    <div className="sparkline-panel">
      <button
        onClick={onClose}
        className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors text-sm"
      >
        ✕
      </button>

      <h3 className="text-sm font-bold text-white mb-1">{countryName}</h3>
      <p className="text-[11px] text-slate-400 mb-3">
        24h Day-Ahead Price &bull; Avg &euro;{avgPrice.toFixed(1)}/MWh
      </p>

      <svg
        width={w}
        height={h}
        className="w-full"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
      >
        <polygon points={fillPoints} fill="rgba(56, 189, 248, 0.1)" />
        <polyline
          points={points}
          fill="none"
          stroke="rgb(56, 189, 248)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hourly.map((v, i) => {
          if (v !== min && v !== max) return null;
          const x = pad + (i / (hourly.length - 1)) * (w - pad * 2);
          const y = h - pad - ((v - min) / range) * (h - pad * 2);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="3"
              fill={v === max ? '#f87171' : '#4ade80'}
            />
          );
        })}
      </svg>

      <div className="flex justify-between text-[10px] text-slate-600 mt-1">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>

      <div className="flex justify-between text-[11px] mt-2 pt-2 border-t border-white/[0.06]">
        <span className="text-slate-500">Range</span>
        <span className="text-slate-300 font-medium">
          &euro;{min.toFixed(1)} &ndash; &euro;{max.toFixed(1)}/MWh
        </span>
      </div>
    </div>
  );
}
