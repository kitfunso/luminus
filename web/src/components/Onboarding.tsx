'use client';

import React from 'react';
import TourController from './tutorial/TourController';
import type { TutorialStepId } from './tutorial/tutorial-state';

interface OnboardingProps {
  onStepFocus: (stepId: TutorialStepId) => void;
}

export default function Onboarding({ onStepFocus }: OnboardingProps) {
  return <TourController onStepFocus={onStepFocus} />;
}
