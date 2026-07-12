// src/ui/screens/sign-in-screen.tsx — node-for-node port of design/proto.jsx:550–565.
// Rung 1 presenter: pure props in / JSX out; no Jazz, no router.
// Kit surface: optional PHeader back + AuthShell (proto 2-dot surface).

import type { ReactNode, JSX } from "react";
import {
  AuthShell,
  ArcanMark,
  PButton,
  AuthTitle,
  AuthField,
  MuteLink,
  tapClass,
} from "@/ui/kit";

export function SignInScreen({
  email,
  onEmail,
  password,
  onPassword,
  onSubmit,
  submitting,
  errorSlot,
  onForgot,
  onCreate,
  emailTestId,
  passwordTestId,
  submitTestId,
}: {
  // onBack intentionally removed — USER DECISION 2026-07-06 (walkthrough):
  // auth-flow screens have no top back arrows; original pre-Wave-D LoginRoute
  // also had no back nav. Navigation back to /onboarding is available via
  // the "create account" MuteLink at the bottom of this screen.
  email: string;
  onEmail: (v: string) => void;
  password: string;
  onPassword: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  errorSlot?: ReactNode;
  onForgot: () => void;
  onCreate: () => void;
  emailTestId?: string;
  passwordTestId?: string;
  submitTestId?: string;
}): JSX.Element {
  return (
    <>
      <AuthShell>
        {/* proto:556 — ArcanMark stacked, 56px */}
        <ArcanMark size={56} stacked />

        {/* proto:557 — "sign in" title (700 19px/1.2 mono) via AuthTitle */}
        <AuthTitle>sign in</AuthTitle>

        {/* proto:558–562 — fields + submit wrapped in form for Enter-to-submit */}
        <form
          className="flex flex-col gap-[13px]"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
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
            placeholder="••••••••"
            autoComplete="current-password"
            inputTestId={passwordTestId}
          />
          {errorSlot}
          {/* proto:560 — h:4 spacer */}
          <div className="h-1" />
          <PButton
            disabled={submitting}
            primary
            full
            label={submitting ? "signing in…" : "sign in"}
            data-testid={submitTestId}
          />
        </form>

        {/* intent-fix (feedback round 2): create-account promoted from a
            footer MuteLink to a visible secondary button. */}
        <PButton
          full
          label="create account"
          onClick={onCreate}
          data-testid="signin-create-account"
        />

        {/* proto:562 — footer: forgot-password only, centered (create account moved above) */}
        <div className="flex justify-center">
          <button className={tapClass} onClick={onForgot} type="button">
            <MuteLink>forgot password?</MuteLink>
          </button>
        </div>
      </AuthShell>
    </>
  );
}
