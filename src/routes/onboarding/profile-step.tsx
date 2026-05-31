import { useState } from "react";
import { signUp } from "@/auth/flows";
import { decodeRecoveryCode } from "@/auth/recovery-code";
import {
  useCreateAccountWithSeed,
  useSetDisplayNameOnMe,
} from "@/jazz/createAccountFromSeed";
import { Button } from "@/components/ui/button";
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
        err instanceof Error ? err.message : "Sign-up failed. Please try again.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            Set up your profile
          </h1>
          <p className="text-muted-foreground">
            Choose a display name that others will see when you connect with
            them.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="display-name-input"
              className="text-sm font-medium"
            >
              Display name
            </label>
            <input
              id="display-name-input"
              data-testid="display-name-input"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleFinish();
              }}
              placeholder="Your name"
              autoFocus
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && (
            <p
              data-testid="profile-error"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onBack}
            disabled={isSubmitting}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            data-testid="finish-onboarding-btn"
            disabled={!canSubmit}
            onClick={() => void handleFinish()}
            className="flex-1"
          >
            {isSubmitting ? "Creating account…" : "Finish"}
          </Button>
        </div>
      </div>
    </div>
  );
}
