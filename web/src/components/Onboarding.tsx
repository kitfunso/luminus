'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'luminus-onboarding-v1';

interface Step {
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    title: 'Price Heatmap',
    description:
      'Countries are colored by day-ahead electricity price. Green means cheap, red means expensive.',
  },
  {
    title: 'Click to Explore',
    description:
      'Click any country for price details and generation mix. Click a flow arc for cross-border analysis.',
  },
  {
    title: 'Control Panel',
    description:
      'Use the sidebar tabs to toggle map layers, filter by fuel type, and adjust your view.',
  },
];

export default function Onboarding() {
  const [visible, setVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (!dismissed) {
        setVisible(true);
      }
    } catch {
      // localStorage unavailable — skip onboarding
    }
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // localStorage unavailable — silently ignore
    }
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      dismiss();
    }
  }, [currentStep, dismiss]);

  if (!visible) return null;

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={dismiss}
    >
      <div
        className="bg-[#161B22] border border-white/[0.1] rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] text-sky-400 font-medium uppercase tracking-widest">
          {currentStep + 1} of {STEPS.length}
        </p>
        <h2 className="text-base font-bold text-white">{step.title}</h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          {step.description}
        </p>
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            className="text-[11px] text-slate-500 hover:text-white transition-colors"
            onClick={dismiss}
          >
            Skip tour
          </button>
          <button
            type="button"
            className="px-4 py-1.5 rounded-lg bg-sky-500/20 border border-sky-500/30 text-[12px] text-sky-400 font-medium transition-colors hover:bg-sky-500/30"
            onClick={handleNext}
          >
            {isLast ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
