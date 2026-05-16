import { useState } from "react";
import { usePassphraseAuth } from "jazz-tools/react";
import { wordlist } from "@scure/bip39/wordlists/english";
import { Button } from "@/components/ui/button";

interface ProfileStepProps {
  phrase: string;
  onBack: () => void;
}

/**
 * ProfileStep: collects a display name and creates the Jazz account.
 *
 * Account creation approach: `auth.registerNewAccount(phrase, name)`
 * -------------------------------------------------------------------
 * `usePassphraseAuth` exposes `registerNewAccount(passphrase, name)` which
 * derives the account secret directly from the caller-supplied passphrase
 * (BIP-39 mnemonic → entropy → Ed25519 key). This lets us show the user their
 * passphrase before any Jazz interaction (Tasks 21–22) and then use that same
 * phrase as the account key here.
 *
 * Alternative considered: `auth.signUp(name)` — upgrades the current anonymous
 * session, returning the BIP-39 encoding of the session's existing secret seed.
 * This cannot use a pre-generated passphrase, so it was rejected.
 *
 * Device record: added in the JazzMessangerAccount withMigration hook
 * -------------------------------------------------------------------
 * The `withMigration` callback fires synchronously as part of account
 * initialisation (before JazzReactProvider resolves its context). Placing the
 * first DeviceRecord there is architecturally cleaner than trying to mutate
 * `me.root.devices` from within this component, which would require
 * coordinating across an async boundary and a component unmount. The migration
 * is guarded by `!me.$jazz.has("root")` so it runs exactly once.
 *
 * sessionFingerprint: crypto.randomUUID() placeholder
 * -------------------------------------------------------------------
 * Jazz 0.20.18 does not expose the per-session identifier as a public API.
 * A fresh UUID is used instead and documented here as a deviation.
 *
 * After `registerNewAccount` resolves:
 *   - Jazz writes credentials to AuthSecretStorage
 *   - `useIsAuthenticated()` in App.tsx flips to true
 *   - App re-renders and unmounts OnboardingRoute / this component
 *   - No explicit navigation is needed here
 */
export function ProfileStep({ phrase, onBack }: ProfileStepProps) {
  const auth = usePassphraseAuth({ wordlist });
  const [displayName, setDisplayName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = displayName.trim().length > 0 && !isCreating;

  async function handleFinish() {
    if (!canSubmit) return;
    setIsCreating(true);
    setError(null);
    try {
      await auth.registerNewAccount(phrase, displayName.trim());
      // Component will unmount as App's useIsAuthenticated flips to true.
      // No explicit navigation needed.
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Account creation failed. Please try again.",
      );
      setIsCreating(false);
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
            disabled={isCreating}
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
            {isCreating ? "Creating account…" : "Finish"}
          </Button>
        </div>
      </div>
    </div>
  );
}
