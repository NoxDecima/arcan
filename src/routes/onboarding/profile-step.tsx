import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { signUp } from "@/auth/flows";
import { decodeRecoveryCode } from "@/auth/recovery-code";
import {
  useCreateAccountWithSeed,
  useSetDisplayNameOnMe,
} from "@/jazz/createAccountFromSeed";
import { MAX_ATTACHMENT_BYTES } from "@/jazz/attachments";
import { AuthSurface, Steps, AuthTitle } from "@/components/auth-surface";
import type { Credentials } from "./credentials-step";

interface ProfileStepProps {
  credentials: Credentials;
  recoveryCode: string;
  onBack: () => void;
}

/**
 * ProfileStep: collects a display name and runs the full sign-up flow.
 *
 * Sequence (all driven by `flows.signUp`):
 *   1. Decode the user's 24-word recovery code back into its 32-byte seed.
 *   2. Hand that seed to `createAccountWithSeed`, which derives the Jazz
 *      AgentSecret and registers a new Account via the React context's
 *      `register` function.
 *   3. Inside the same callback, set the profile display name via
 *      `setDisplayNameOnMe`.
 *   4. `flows.signUp` derives the KDF key from the password, encrypts the
 *      seed, computes the recovery proof, and POSTs everything to
 *      /api/auth/sign-up/email. On any non-2xx, it invokes the rollback
 *      callback returned from createAccountWithSeed (clears local creds).
 *
 * On success, the browser cookie + AuthSecretStorage are populated, App's
 * useIsAuthenticated flips to true, and OnboardingRoute unmounts.
 */
export function ProfileStep({
  credentials,
  recoveryCode,
  onBack,
}: ProfileStepProps) {
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build/tear down the object-URL preview whenever the picked file changes.
  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  function handleAvatarPick() {
    fileInputRef.current?.click();
  }

  function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(
        `${file.name} is ${(file.size / 1_000_000).toFixed(1)} MB. max 5 MB.`,
      );
      return;
    }
    setError(null);
    setAvatarFile(file);
  }

  const createAccountWithSeed = useCreateAccountWithSeed();
  const setDisplayNameOnMe = useSetDisplayNameOnMe();

  const canSubmit = displayName.trim().length > 0 && !isSubmitting;

  async function handleFinish() {
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const seed = decodeRecoveryCode(recoveryCode);
      await signUp({
        email: credentials.email,
        password: credentials.password,
        displayName: displayName.trim(),
        seed,
        createJazzAccount: async (s, name) => {
          const handle = await createAccountWithSeed(s);
          await setDisplayNameOnMe(handle, name);
          return handle;
        },
      });
      // Replay any stashed /invite fragment so the user lands on the invite
      // acceptance page after sign-up.
      const pendingInviteFragment = sessionStorage.getItem(
        "pending-invite-fragment",
      );
      if (pendingInviteFragment) {
        sessionStorage.removeItem("pending-invite-fragment");
        window.location.assign(`/invite${pendingInviteFragment}`);
      }
      // Otherwise: App's useIsAuthenticated flips, OnboardingRoute unmounts.
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "sign-up failed. please try again.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <AuthSurface forceDark>
      <Steps n={4} />
      <AuthTitle>set up your profile</AuthTitle>

      {/* Avatar tile + camera overlay — picks a file now, uploaded after the
          account is created in handleFinish (the Jazz account does not exist
          yet on this step). Design: hf-flows.jsx ScProfile lines 147-152. */}
      <div className="flex justify-center mt-[2px]">
        <div className="relative">
          <div className="flex h-[78px] w-[78px] items-center justify-center overflow-hidden rounded-avatar-lg border border-hairline bg-accent-soft font-mono text-[26px] font-semibold text-arcan-accent">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt=""
                data-testid="onboarding-avatar-preview"
                className="h-full w-full object-cover"
              />
            ) : (
              "?"
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
            data-testid="onboarding-avatar-input"
          />
          <button
            type="button"
            onClick={handleAvatarPick}
            aria-label="Add a profile picture"
            data-testid="onboarding-avatar-change"
            className="absolute -bottom-[2px] -right-[2px] flex h-7 w-7 items-center justify-center rounded-pill border-2 border-bg bg-arcan-accent text-on-accent text-[13px]"
          >
            ⌖
          </button>
        </div>
      </div>

      <label className="flex flex-col gap-[6px]">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-dim">
          display name
        </span>
        <input
          id="display-name-input"
          data-testid="display-name-input"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleFinish();
          }}
          placeholder="how others see you"
          autoFocus
          className="h-[38px] rounded-r-3 border border-hairline bg-panel px-3 text-[12px] text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent"
        />
      </label>

      {error && (
        <p
          data-testid="profile-error"
          className="rounded-r-3 bg-red/10 px-3 py-2 text-[12px] text-red"
        >
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="h-10 flex-1 rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold disabled:opacity-50"
        >
          back
        </button>
        <button
          type="button"
          data-testid="finish-onboarding-btn"
          disabled={!canSubmit}
          onClick={() => void handleFinish()}
          className="h-10 flex-1 rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold disabled:opacity-50"
        >
          {isSubmitting ? "creating account…" : "enter arcan →"}
        </button>
      </div>
      <div className="text-center text-[10.5px] text-dim">step 4 of 4</div>
    </AuthSurface>
  );
}
