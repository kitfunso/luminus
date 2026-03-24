export type TutorialMode = 'hidden' | 'welcome' | 'tour' | 'checklist';
export type TutorialStatus = 'idle' | 'active' | 'paused' | 'completed' | 'skipped';
export type TutorialStepId =
  | 'live-status'
  | 'country-detail'
  | 'flows-layer'
  | 'outage-radar'
  | 'forecast-actual'
  | 'morning-brief'
  | 'filters-replay';

export interface TutorialStep {
  id: TutorialStepId;
  title: string;
  description: string;
  targetId: string;
}

export interface TutorialState {
  mode: TutorialMode;
  status: TutorialStatus;
  currentStepIndex: number;
  completedStepIds: TutorialStepId[];
}

export interface PersistedTutorialState {
  status: TutorialStatus;
  currentStepIndex: number;
  completedStepIds: TutorialStepId[];
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'live-status',
    title: 'Live pulse',
    description: 'This strip shows freshness, auto-refresh cadence, and gives you a manual refresh when you need a hard pull.',
    targetId: 'live-status',
  },
  {
    id: 'country-detail',
    title: 'Map detail',
    description: 'Click any market on the map to open country detail. You can move on immediately or explore before resuming.',
    targetId: 'map-stage',
  },
  {
    id: 'flows-layer',
    title: 'Flow reading',
    description: 'Use the layer controls to keep cross-border flows visible while you inspect corridor direction and utilization.',
    targetId: 'sidebar-layers',
  },
  {
    id: 'outage-radar',
    title: 'Outage radar',
    description: 'The intelligence rail can pivot into active outage windows without opening a second floating panel.',
    targetId: 'rail-outages',
  },
  {
    id: 'forecast-actual',
    title: 'Forecast drift',
    description: 'Switch the same rail into forecast versus actual to surface wind and solar surprises.',
    targetId: 'rail-forecast',
  },
  {
    id: 'morning-brief',
    title: 'Morning brief',
    description: 'Use the brief view for the highest-signal read on prices, congestion, outages, and pipeline context.',
    targetId: 'rail-brief',
  },
  {
    id: 'filters-replay',
    title: 'Filters and replay',
    description: 'The checklist stays behind after the guided run, and you can replay the full tour any time from here.',
    targetId: 'sidebar-filters',
  },
];

export function createTutorialState(
  persisted?: Partial<PersistedTutorialState> | null,
): TutorialState {
  if (!persisted) {
    return {
      mode: 'welcome',
      status: 'idle',
      currentStepIndex: 0,
      completedStepIds: [],
    };
  }

  if (persisted.status === 'completed' || persisted.status === 'skipped') {
    return {
      mode: 'checklist',
      status: persisted.status,
      currentStepIndex: 0,
      completedStepIds: persisted.completedStepIds ?? [],
    };
  }

  if (persisted.status === 'paused') {
    return {
      mode: 'checklist',
      status: 'paused',
      currentStepIndex: persisted.currentStepIndex ?? 0,
      completedStepIds: persisted.completedStepIds ?? [],
    };
  }

  return {
    mode: 'welcome',
    status: 'idle',
    currentStepIndex: persisted.currentStepIndex ?? 0,
    completedStepIds: persisted.completedStepIds ?? [],
  };
}

export function getCurrentTutorialStep(state: TutorialState): TutorialStep | null {
  return TUTORIAL_STEPS[state.currentStepIndex] ?? null;
}

export function startTutorial(state: TutorialState): TutorialState {
  return {
    ...state,
    mode: 'tour',
    status: 'active',
    currentStepIndex: 0,
  };
}

export function tutorialNextStep(state: TutorialState): TutorialState {
  const step = getCurrentTutorialStep(state);
  if (!step) {
    return state;
  }

  const completed = state.completedStepIds.includes(step.id)
    ? state.completedStepIds
    : [...state.completedStepIds, step.id];
  const nextIndex = state.currentStepIndex + 1;

  if (nextIndex >= TUTORIAL_STEPS.length) {
    return {
      mode: 'checklist',
      status: 'completed',
      currentStepIndex: TUTORIAL_STEPS.length - 1,
      completedStepIds: completed,
    };
  }

  return {
    mode: 'tour',
    status: 'active',
    currentStepIndex: nextIndex,
    completedStepIds: completed,
  };
}

export function tutorialPreviousStep(state: TutorialState): TutorialState {
  return {
    ...state,
    mode: 'tour',
    status: 'active',
    currentStepIndex: Math.max(0, state.currentStepIndex - 1),
  };
}

export function pauseTutorial(state: TutorialState): TutorialState {
  return {
    ...state,
    mode: 'checklist',
    status: 'paused',
  };
}

export function resumeTutorial(state: TutorialState): TutorialState {
  return {
    ...state,
    mode: 'tour',
    status: 'active',
  };
}

export function skipTutorial(state: TutorialState): TutorialState {
  return {
    ...state,
    mode: 'checklist',
    status: 'skipped',
  };
}

export function replayTutorial(state: TutorialState): TutorialState {
  return {
    ...state,
    mode: 'tour',
    status: 'active',
    currentStepIndex: 0,
  };
}

export function completeTutorialStep(state: TutorialState, stepId: TutorialStepId): TutorialState {
  if (state.completedStepIds.includes(stepId)) {
    return state;
  }

  return {
    ...state,
    completedStepIds: [...state.completedStepIds, stepId],
  };
}

export function toPersistedTutorialState(state: TutorialState): PersistedTutorialState {
  return {
    status: state.status,
    currentStepIndex: state.currentStepIndex,
    completedStepIds: state.completedStepIds,
  };
}
