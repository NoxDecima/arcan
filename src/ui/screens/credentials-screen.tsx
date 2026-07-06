// src/ui/screens/credentials-screen.tsx — node-for-node port of design/hf-flows.jsx:92–105.
// Rung 2 presenter: pure props in / JSX out; no Jazz, no router.
// Kit surface: AuthSurface (hf 4-star surface). Onboarding step 1.

import type { ReactNode, JSX } from "react";
import { AuthSurface, Steps, AuthTitle, AuthField, PButton, MuteLink } from "@/ui/kit";

export function CredentialsScreen({
  email,
  onEmail,
  password,
  onPassword,
  confirm,
  onConfirm,
  onContinue,
  onBack,
  errorSlot,
  formTestId,
  emailTestId,
  passwordTestId,
  confirmTestId,
  continueTestId,
}: {
  email: string;
  onEmail: (v: string) => void;
  password: string;
  onPassword: (v: string) => void;
  confirm: string;
  onConfirm: (v: string) => void;
  onContinue: () => void;
  onBack?: () => void;
  errorSlot?: ReactNode;
  formTestId?: string;
  emailTestId?: string;
  passwordTestId?: string;
  confirmTestId?: string;
  continueTestId?: string;
}): JSX.Element {
  return (
    <AuthSurface w={320}>
      {/* hf:95 — step indicator */}
      <Steps n={1} />
      {/* hf:96 — title */}
      <AuthTitle>create your account</AuthTitle>
      {/* hf:97–100 — 3 fields + footer in form for Enter-to-submit */}
      <form
        data-testid={formTestId}
        className="flex flex-col gap-[15px]"
        onSubmit={(e) => {
          e.preventDefault();
          onContinue();
        }}
      >
        <AuthField
          label="email"
          type="email"
          value={email}
          onChange={onEmail}
          placeholder="you@domain.dev"
          autoComplete="email"
          inputTestId={emailTestId}
        />
        <AuthField
          label="password"
          type="password"
          value={password}
          onChange={onPassword}
          placeholder="choose a strong password"
          autoComplete="new-password"
          minLength={12}
          inputTestId={passwordTestId}
        />
        <AuthField
          label="confirm password"
          type="password"
          value={confirm}
          onChange={onConfirm}
          placeholder="••••••••"
          autoComplete="new-password"
          inputTestId={confirmTestId}
        />
        {errorSlot}
        {/* hf:101 — h:2 spacer */}
        <div className="h-0.5" />
        {/* hf:102 — footer: back+continue two-button row (live) or single PButton (parity) */}
        {onBack ? (
          <div className="flex gap-3">
            <div className="flex-1">
              <PButton full label="back" onClick={onBack} type="button" />
            </div>
            <div className="flex-1">
              <PButton primary full label="continue →" type="submit" data-testid={continueTestId} />
            </div>
          </div>
        ) : (
          <PButton primary full label="continue →" type="submit" data-testid={continueTestId} />
        )}
      </form>
      {/* hf:103 — "step 1 of 4" */}
      <div className="text-center">
        <MuteLink>step 1 of 4</MuteLink>
      </div>
    </AuthSurface>
  );
}
