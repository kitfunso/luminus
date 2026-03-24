import { describe, expect, it } from 'vitest';
import {
  createTutorialState,
  getCurrentTutorialStep,
  pauseTutorial,
  replayTutorial,
  skipTutorial,
  startTutorial,
  tutorialNextStep,
} from './tutorial-state';

describe('tutorial state', () => {
  it('pauses an active guided tour into checklist mode without losing progress', () => {
    const started = startTutorial(createTutorialState());
    const secondStep = tutorialNextStep(started);
    const paused = pauseTutorial(secondStep);

    expect(paused.mode).toBe('checklist');
    expect(paused.status).toBe('paused');
    expect(paused.currentStepIndex).toBe(1);
    expect(getCurrentTutorialStep(paused)?.id).toBe('country-detail');
  });

  it('replays from the first step after a skip', () => {
    const skipped = skipTutorial(startTutorial(createTutorialState()));
    const replayed = replayTutorial(skipped);

    expect(skipped.status).toBe('skipped');
    expect(replayed.mode).toBe('tour');
    expect(replayed.status).toBe('active');
    expect(replayed.currentStepIndex).toBe(0);
    expect(getCurrentTutorialStep(replayed)?.id).toBe('live-status');
  });
});
