// src/ui/screens/onboarding-types.ts — shared view-model types for onboarding screens (T3).

export interface WordChallengeField {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  testId: string;
}
