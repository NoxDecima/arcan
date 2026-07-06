// src/ui/screens/backup-display-screen.tsx — node-for-node port of design/hf-flows.jsx:106–126.
// Rung 2 presenter: pure props in / JSX out; no Jazz, no router.
// Kit surface: AuthSurface tall w={368}. Onboarding step 2.

import type { ReactNode, JSX } from "react";
import { AuthSurface, Steps, AuthTitle, PButton } from "@/ui/kit";

export function BackupDisplayScreen({
  gridSlot,
  ackSlot,
  continueDisabled,
  onContinue,
  onBack,
  continueTestId,
}: {
  gridSlot: ReactNode;
  ackSlot?: ReactNode;
  continueDisabled?: boolean;
  onContinue: () => void;
  onBack?: () => void;
  continueTestId?: string;
}): JSX.Element {
  return (
    <AuthSurface w={368} tall>
      {/* hf:113 — step indicator */}
      <Steps n={2} />
      {/* hf:114 — title */}
      <AuthTitle>save your recovery code</AuthTitle>
      {/* hf:115–118 — warn callout */}
      <div className="flex items-start gap-2 rounded-r-4 border border-warn bg-warn px-3 py-[9px]">
        <span className="font-mono font-semibold text-ui-toast leading-snug text-warn-icon">⚠</span>
        <span className="font-body font-medium text-ui-sub leading-[1.4] text-warn">
          this 24-word code is the only way to recover your account. nox cannot reset it.
        </span>
      </div>
      {/* hf:119–121 — passphrase grid (injected from container) */}
      {gridSlot}
      {/* Rung-4: acknowledge checkbox row (omitted in parity) */}
      {ackSlot}
      {/* hf:123 — primary "i've saved it →" */}
      {onBack ? (
        <div className="flex gap-3">
          <div className="flex-1">
            <PButton full label="back" onClick={onBack} type="button" />
          </div>
          <div className="flex-1">
            <PButton
              primary
              full
              label="i've saved it →"
              disabled={continueDisabled}
              onClick={onContinue}
              data-testid={continueTestId}
            />
          </div>
        </div>
      ) : (
        <PButton
          primary
          full
          label="i've saved it →"
          disabled={continueDisabled}
          onClick={onContinue}
          data-testid={continueTestId}
        />
      )}
      {/* hf:124 — ScRecovery has NO "step 2 of 4" footer (proto:546 intent-fix) */}
    </AuthSurface>
  );
}
