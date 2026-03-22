'use client';

export interface Kpi {
  label: string;
  value: string;
  color?: string;
  sublabel?: string;
  bar?: { pct: number; color: string };
}

interface KpiRowProps {
  kpis: Kpi[];
}

export default function KpiRow({ kpis }: KpiRowProps) {
  const cols = kpis.length <= 2 ? 'grid-cols-2' : kpis.length === 3 ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <div className={`grid ${cols} gap-2 mb-4`}>
      {kpis.map((kpi) => (
        <div key={kpi.label} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{kpi.label}</p>
          <p className="text-lg font-bold tabular-nums" style={{ color: kpi.color ?? '#fff' }}>
            {kpi.value}
          </p>
          {kpi.sublabel && <p className="text-[10px] text-slate-500">{kpi.sublabel}</p>}
          {kpi.bar && (
            <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden mt-1.5">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, kpi.bar.pct * 100).toFixed(1)}%`, backgroundColor: kpi.bar.color }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
