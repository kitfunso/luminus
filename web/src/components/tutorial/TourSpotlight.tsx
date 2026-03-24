'use client';

import React, { useEffect, useState } from 'react';
import type { TutorialStep } from './tutorial-state';
import { TUTORIAL_STEPS } from './tutorial-state';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TourSpotlightProps {
  step: TutorialStep;
  stepIndex: number;
  onNext: () => void;
  onBack: () => void;
  onPause: () => void;
  onSkip: () => void;
}

function measureTarget(targetId: string): Rect | null {
  const target = document.querySelector<HTMLElement>(`[data-tour-id="${targetId}"]`);
  if (!target) {
    return null;
  }

  const rect = target.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export default function TourSpotlight({
  step,
  stepIndex,
  onNext,
  onBack,
  onPause,
  onSkip,
}: TourSpotlightProps) {
  const [rect, setRect] = useState<Rect | null>(null);
  const isLast = stepIndex === TUTORIAL_STEPS.length - 1;

  useEffect(() => {
    const update = () => setRect(measureTarget(step.targetId));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step.targetId]);

  const spotlight = rect
    ? {
        left: Math.max(12, rect.left - 10),
        top: Math.max(12, rect.top - 10),
        width: rect.width + 20,
        height: rect.height + 20,
      }
    : null;

  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 720 : window.innerHeight;

  const cardStyle = rect
    ? {
        left: Math.max(16, Math.min(viewportWidth - 352, rect.left)),
        top: Math.min(viewportHeight - 220, rect.top + rect.height + 20),
      }
    : {
        left: 24,
        bottom: 24,
      };

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-40">
        <div className="absolute inset-0 bg-[rgba(4,8,15,0.72)]" />
        {spotlight && (
          <div
            className="absolute rounded-[28px] border border-cyan-300/40 bg-transparent shadow-[0_0_0_9999px_rgba(4,8,15,0.72)] transition-all duration-200"
            style={spotlight}
          />
        )}
      </div>

      <div
        className="absolute z-50 w-[336px] rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(15,22,35,0.98),rgba(8,12,20,0.94))] p-4 shadow-2xl backdrop-blur-2xl"
        style={cardStyle}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
          {stepIndex + 1} of {TUTORIAL_STEPS.length}
        </p>
        <h2 className="mt-2 text-lg font-semibold text-white">{step.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{step.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={stepIndex === 0}
            className="rounded-full border border-white/[0.08] px-3 py-2 text-[11px] font-medium text-slate-300 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onPause}
            className="rounded-full border border-white/[0.08] px-3 py-2 text-[11px] font-medium text-slate-300 transition-colors hover:text-white"
          >
            Pause and explore
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full border border-white/[0.08] px-3 py-2 text-[11px] font-medium text-slate-300 transition-colors hover:text-white"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onNext}
            className="ml-auto rounded-full border border-cyan-300/30 bg-cyan-300/12 px-3 py-2 text-[11px] font-medium text-cyan-100 transition-colors hover:bg-cyan-300/16"
          >
            {isLast ? 'Finish tour' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}
