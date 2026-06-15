import { useState } from "react";
import { signUp } from "@/auth/flows";
import { decodeRecoveryCode } from "@/auth/recovery-code";
import {
  useCreateAccountWithSeed,
  useSetDisplayNameOnMe,
} from "@/jazz/createAccountFromSeed";
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

      {/* Avatar placeholder + camera overlay — purely decorative on this step;
          actual avatar upload happens in /profile after sign-up completes. */}
      <div className="flex justify-center mt-[2px]">
        <div className="relative">
          <div className="flex h-[78px] w-[78px] items-center justify-center rounded-r-3 border border-hairline bg-accent-soft font-mono text-[26px] font-semibold text-arcan-accent">
            ?
          </div>
          <div className="absolute -bottom-[2px] -right-[2px] flex h-7 w-7 items-center justify-center rounded-pill border-2 border-bg bg-arcan-accent text-on-accent text-[14px]">
            ●
          </div>
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
