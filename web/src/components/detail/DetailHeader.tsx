'use client';

import type { ReactNode } from 'react';

interface DetailHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClose: () => void;
}

export default function DetailHeader({ icon, title, subtitle, onClose }: DetailHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="flex-shrink-0 text-lg">{icon}</div>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-bold text-white leading-tight truncate">{title}</h2>
        <p className="text-[11px] text-slate-400">{subtitle}</p>
      </div>
      <button
        onClick={onClose}
        className="flex-shrink-0 text-slate-500 hover:text-white transition-colors"
        aria-label="Close panel"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
