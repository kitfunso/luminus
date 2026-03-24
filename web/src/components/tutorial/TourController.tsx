'use client';

import React, { useEffect, useMemo, useState } from 'react';
import TourChecklist from './TourChecklist';
import TourSpotlight from './TourSpotlight';
import {
  createTutorialState,
  getCurrentTutorialStep,
  pauseTutorial,
  replayTutorial,
  resumeTutorial,
  skipTutorial,
  startTutorial,
  toPersistedTutorialState,
  tutorialNextStep,
  tutorialPreviousStep,
  type TutorialState,
  type TutorialStepId,
} from './tutorial-state';

const STORAGE_KEY = 'luminus-onboarding-v2';
const REPLAY_EVENT = 'luminus:replay-tour';

interface TourControllerProps {
  onStepFocus: (stepId: TutorialStepId) => void;
}

function readPersistedState(): TutorialState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createTutorialState();
    }
    return createTutorialState(JSON.parse(raw));
  } catch {
    return createTutorialState();
  }
}

export default function TourController({ onStepFocus }: TourControllerProps) {
  const [state, setState] = useState<TutorialState>(() => createTutorialState());
  const [collapsed, setCollapsed] = useState(false);
  const currentStep = useMemo(() => getCurrentTutorialStep(state), [state]);

  useEffect(() => {
    setState(readPersistedState());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersistedTutorialState(state)));
    } catch {
      // Ignore storage failures in unsupported environments.
    }
  }, [state]);

  useEffect(() => {
    if (state.mode === 'tour' && currentStep) {
      onStepFocus(currentStep.id);
    }
  }, [currentStep, onStepFocus, state.mode]);

  useEffect(() => {
    const handleReplay = () => {
      setCollapsed(false);
      setState((prev) => replayTutorial(prev));
    };
    window.addEventListener(REPLAY_EVENT, handleReplay);
    return () => window.removeEventListener(REPLAY_EVENT, handleReplay);
  }, []);

  if (state.mode === 'welcome') {
    return (
      <div className="absolute bottom-5 right-5 z-40 w-[340px] rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(15,22,35,0.98),rgba(8,12,20,0.94))] p-5 shadow-2xl backdrop-blur-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
          Guided Tour
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white">Learn the live dashboard</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Walk through the live status, market layers, and the new intelligence rail. You can pause, skip, or replay it whenever you want.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setState((prev) => startTutorial(prev))}
            className="flex-1 rounded-full border border-cyan-300/30 bg-cyan-300/12 px-3 py-2 text-[11px] font-medium text-cyan-100 transition-colors hover:bg-cyan-300/16"
          >
            Start tour
          </button>
          <button
            type="button"
            onClick={() => setState((prev) => skipTutorial(prev))}
            className="flex-1 rounded-full border border-white/[0.08] px-3 py-2 text-[11px] font-medium text-slate-300 transition-colors hover:text-white"
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  if (state.mode === 'tour' && currentStep) {
    return (
      <TourSpotlight
        step={currentStep}
        stepIndex={state.currentStepIndex}
        onNext={() => setState((prev) => tutorialNextStep(prev))}
        onBack={() => setState((prev) => tutorialPreviousStep(prev))}
        onPause={() => {
          setCollapsed(false);
          setState((prev) => pauseTutorial(prev));
        }}
        onSkip={() => {
          setCollapsed(false);
          setState((prev) => skipTutorial(prev));
        }}
      />
    );
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="absolute bottom-5 right-5 z-40 rounded-full border border-white/[0.08] bg-[rgba(10,14,23,0.94)] px-4 py-2 text-[11px] font-medium text-slate-200 shadow-xl backdrop-blur-xl transition-colors hover:text-white"
      >
        Guide {state.completedStepIds.length}/7
      </button>
    );
  }

  return (
    <TourChecklist
      state={state}
      onResume={() => setState((prev) => resumeTutorial(prev))}
      onReplay={() => setState((prev) => replayTutorial(prev))}
      onCollapse={() => setCollapsed(true)}
    />
  );
}
