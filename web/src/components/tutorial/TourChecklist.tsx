'use client';

import React from 'react';
import type { TutorialState } from './tutorial-state';
import { TUTORIAL_STEPS } from './tutorial-state';

interface TourChecklistProps {
  state: TutorialState;
  onResume: () => void;
  onReplay: () => void;
  onCollapse: () => void;
}

export default function TourChecklist({
  state,
  onResume,
  onReplay,
  onCollapse,
}: TourChecklistProps) {
  return (
    <div className="absolute bottom-5 right-5 z-40 w-[320px] rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(12,18,30,0.96),rgba(8,12,20,0.92))] p-4 shadow-2xl backdrop-blur-2xl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
            Guided Tour
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            {state.status === 'completed' ? 'Checklist complete' : 'Pick up where you left off'}
          </h2>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[11px] text-slate-400 transition-colors hover:text-white"
        >
          Hide
        </button>
      </div>

      <div className="space-y-2">
        {TUTORIAL_STEPS.map((step, index) => {
          const completed = state.completedStepIds.includes(step.id);
          const active = index === state.currentStepIndex && state.status !== 'completed';
          return (
            <div
              key={step.id}
              className={`rounded-2xl border px-3 py-2 ${
                active
                  ? 'border-cyan-300/25 bg-cyan-300/10'
                  : completed
                    ? 'border-emerald-300/20 bg-emerald-300/8'
                    : 'border-white/[0.06] bg-white/[0.02]'
              }`}
            >
              <p className="text-[11px] font-medium text-white">{step.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                {step.description}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex gap-2">
        {state.status !== 'completed' && (
          <button
            type="button"
            onClick={onResume}
            className="flex-1 rounded-full border border-cyan-300/30 bg-cyan-300/12 px-3 py-2 text-[11px] font-medium text-cyan-100 transition-colors hover:bg-cyan-300/16"
          >
            Resume tour
          </button>
        )}
        <button
          type="button"
          onClick={onReplay}
          className="flex-1 rounded-full border border-white/[0.08] px-3 py-2 text-[11px] font-medium text-slate-200 transition-colors hover:border-white/[0.14] hover:text-white"
        >
          Replay tour
        </button>
      </div>
    </div>
  );
}
