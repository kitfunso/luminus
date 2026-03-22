'use client';

interface MobileActionBarProps {
  onOpenDashboard: () => void;
  onOpenAlerts: () => void;
  onOpenLayers: () => void;
  onOpenPipeline: () => void;
}

export default function MobileActionBar({
  onOpenDashboard,
  onOpenAlerts,
  onOpenLayers,
  onOpenPipeline,
}: MobileActionBarProps) {
  return (
    <div
      className="md:hidden absolute bottom-0 left-0 right-0 flex items-center justify-around px-4 py-3 gap-2"
      style={{ zIndex: 15, background: 'linear-gradient(to top, rgba(10,14,23,0.92) 0%, rgba(10,14,23,0.6) 80%, transparent 100%)' }}
    >
      <ActionButton onClick={onOpenDashboard} label="Brief" hoverColor="hover:text-sky-400">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      </ActionButton>
      <ActionButton onClick={onOpenAlerts} label="Alerts" hoverColor="hover:text-amber-400">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </ActionButton>
      <ActionButton onClick={onOpenLayers} label="Layers" hoverColor="hover:text-white">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </ActionButton>
      <ActionButton onClick={onOpenPipeline} label="Pipeline" hoverColor="hover:text-emerald-400">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      </ActionButton>
    </div>
  );
}

function ActionButton({ onClick, label, hoverColor, children }: {
  onClick: () => void; label: string; hoverColor: string; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 text-slate-400 ${hoverColor} transition-colors`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/[0.06] border border-white/[0.08]">
        {children}
      </span>
      <span className="text-[9px] font-medium tracking-wide">{label}</span>
    </button>
  );
}
