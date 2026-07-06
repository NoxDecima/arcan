// src/ui/screens/backup-confirm-screen.tsx — node-for-node port of design/hf-flows.jsx:127–140.
// Rung 2 presenter: pure props in / JSX out; no Jazz, no router.
// Kit surface: AuthSurface w={320}. Onboarding step 3.
// Deviation: hf has 2 word challenge fields; live app uses 3. Presenter is data-driven.
// Parity fixture: 2 fields (hf-faithful). Live containers pass 3.

import type { JSX } from "react";
import type { WordChallengeField } from "./onboarding-types";
import { AuthSurface, Steps, AuthTitle, AuthSub, AuthField, PButton, MuteLink } from "@/ui/kit";

export function BackupConfirmScreen({
  sub,
  fields,
  onContinue,
  onBack,
  continueTestId,
}: {
  sub: string;
  fields: WordChallengeField[];
  onContinue: () => void;
  onBack?: () => void;
  continueTestId?: string;
}): JSX.Element {
  return (
    <AuthSurface w={320}>
      {/* hf:130 — step indicator */}
      <Steps n={3} />
      {/* hf:131 — title */}
      <AuthTitle>confirm your code</AuthTitle>
      {/* hf:132 — sub (data-driven: app vs hf parity sub string) */}
      <AuthSub>{sub}</AuthSub>
      {/* hf:133–134 — word fields (data-driven: 2 parity, 3 live) */}
      <div className="flex flex-col gap-[15px]">
        {fields.map((f) => (
          <AuthField
            key={f.testId}
            label={f.label}
            value={f.value}
            onChange={f.onChange}
            placeholder={f.placeholder}
            mono
            inputTestId={f.testId}
          />
        ))}
      </div>
      {/* hf:135 — h:2 spacer */}
      <div className="h-0.5" />
      {/* hf:136 — footer */}
      {onBack ? (
        <div className="flex gap-3">
          <div className="flex-1">
            <PButton full label="back" onClick={onBack} type="button" />
          </div>
          <div className="flex-1">
            <PButton primary full label="continue →" onClick={onContinue} data-testid={continueTestId} />
          </div>
        </div>
      ) : (
        <PButton primary full label="continue →" onClick={onContinue} data-testid={continueTestId} />
      )}
      {/* hf:137 — "step 3 of 4" */}
      <div className="text-center">
        <MuteLink>step 3 of 4</MuteLink>
      </div>
    </AuthSurface>
  );
}
