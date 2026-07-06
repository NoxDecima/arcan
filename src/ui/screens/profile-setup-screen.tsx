// src/ui/screens/profile-setup-screen.tsx — node-for-node port of design/hf-flows.jsx:141–159.
// Rung 2 presenter: pure props in / JSX out; no Jazz, no router.
// Kit surface: AuthSurface w={320}. Onboarding step 4.

import type { ReactNode, JSX } from "react";
import { AuthSurface, Steps, AuthTitle, AuthField, PButton, MuteLink, Icon } from "@/ui/kit";

export function ProfileSetupScreen({
  avatarPreview,
  onPickAvatar,
  avatarInput,
  displayName,
  onDisplayName,
  onFinish,
  onBack,
  submitting,
  errorSlot,
  nameTestId,
  finishTestId,
  avatarChangeTestId,
  avatarPreviewTestId,
}: {
  avatarPreview?: string | null;
  onPickAvatar: () => void;
  avatarInput?: ReactNode;
  displayName: string;
  onDisplayName: (v: string) => void;
  onFinish: () => void;
  onBack?: () => void;
  submitting: boolean;
  errorSlot?: ReactNode;
  nameTestId?: string;
  finishTestId?: string;
  avatarChangeTestId?: string;
  avatarPreviewTestId?: string;
}): JSX.Element {
  return (
    <AuthSurface w={320}>
      {/* hf:145 — step indicator */}
      <Steps n={4} />
      {/* hf:146 — title */}
      <AuthTitle>set up your profile</AuthTitle>
      {/* hf:147–151 — avatar tile centered */}
      <div className="flex justify-center mt-0.5">
        <div className="relative">
          {/* hf:149 — 78px avatar tile, r=radius+6=18=rounded-avatar-lg */}
          <button
            type="button"
            onClick={onPickAvatar}
            data-testid={avatarChangeTestId}
            className="w-[78px] h-[78px] rounded-avatar-lg bg-accent-soft border border-hairline flex items-center justify-center cursor-pointer"
          >
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="avatar preview"
                data-testid={avatarPreviewTestId}
                className="w-full h-full rounded-avatar-lg object-cover"
              />
            ) : (
              <span
                data-testid={avatarPreviewTestId}
                className="font-mono font-semibold text-arcan-accent leading-none"
                style={{ fontSize: 26 }}
              >
                ?
              </span>
            )}
          </button>
          {/* hf:150 — camera badge (28px pill, accent-fill, 2px bg border) */}
          <div className="absolute -right-0.5 -bottom-0.5 w-7 h-7 rounded-pill bg-arcan-accent-fill text-on-accent border-2 border-bg flex items-center justify-center pointer-events-none">
            <Icon d="camera" size={14} />
          </div>
        </div>
      </div>
      {/* hidden file input (container-owned) */}
      {avatarInput}
      {/* hf:153 — display name field */}
      <AuthField
        label="display name"
        value={displayName}
        onChange={onDisplayName}
        placeholder="how others see you"
        autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onFinish(); } }}
        inputTestId={nameTestId}
      />
      {errorSlot}
      {/* hf:154 — h:2 spacer (was missing; proto:154 = <div style={{ height: 2 }} />) */}
      <div className="h-0.5" />
      {/* hf:155 — footer */}
      {onBack ? (
        <div className="flex gap-3">
          <div className="flex-1">
            <PButton full label="back" onClick={onBack} type="button" />
          </div>
          <div className="flex-1">
            <PButton
              primary
              full
              label={submitting ? "creating account…" : "enter arcan →"}
              onClick={onFinish}
              data-testid={finishTestId}
            />
          </div>
        </div>
      ) : (
        <PButton
          primary
          full
          label={submitting ? "creating account…" : "enter arcan →"}
          onClick={onFinish}
          data-testid={finishTestId}
        />
      )}
      {/* hf:156 — "step 4 of 4" */}
      <div className="text-center">
        <MuteLink>step 4 of 4</MuteLink>
      </div>
    </AuthSurface>
  );
}
