import { useState } from "react";
import { usePassphraseAuth } from "jazz-tools/react";
import { wordlist } from "@scure/bip39/wordlists/english";
import { mnemonicToEntropy } from "@scure/bip39";
import { validatePassphrase } from "@/auth/passphrase";
import { setPairingSeed } from "@/auth/pairing-seed";
import { Button } from "@/components/ui/button";

interface RestoreStepProps {
  onBack: () => void;
}

/**
 * RestoreStep: signs into an existing account using a 24-word passphrase.
 *
 * Validation sequence:
 *   1. Local structural validation via validatePassphrase() — returns a
 *      structured reason (invalid-length / invalid-word / invalid-checksum)
 *      so the user gets specific feedback without a network round-trip.
 *   2. Jazz auth.logIn(phrase) — decodes the mnemonic, derives the account
 *      secret, and restores credentials. Throws Error("Invalid passphrase")
 *      on any parse failure not caught by step 1.
 *
 * After logIn resolves, useIsAuthenticated in App flips to true and
 * OnboardingRoute unmounts automatically.
 */
export function RestoreStep({ onBack }: RestoreStepProps) {
  const auth = usePassphraseAuth({ wordlist });
  const [phrase, setPhrase] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = phrase.trim().length > 0 && !isRestoring;

  async function handleRestore() {
    if (!canSubmit) return;
    setError(null);

    const trimmed = phrase.trim().replace(/\s+/g, " ");

    // Step 1: local structural validation
    const validation = validatePassphrase(trimmed);
    if (!validation.ok) {
      const reasons: Record<typeof validation.reason, string> = {
        "invalid-length":
          "The passphrase must be exactly 24 words. Please check your input.",
        "invalid-word":
          "One or more words are not in the BIP-39 word list. Check for typos.",
        "invalid-checksum":
          "The passphrase checksum is invalid. Please check all 24 words carefully.",
      };
      setError(reasons[validation.reason]);
      return;
    }

    // Step 2: Jazz logIn
    setIsRestoring(true);
    try {
      await auth.logIn(trimmed);
      // Persist the secretSeed independently so wrapAccountSecretForResponder
      // can read it even after Jazz's authSecretStorage is overwritten on
      // session reconnect (see src/auth/pairing-seed.ts for rationale).
      try {
        const seed = mnemonicToEntropy(trimmed, wordlist);
        setPairingSeed(seed);
      } catch {
        // Non-fatal: seed persistence is a best-effort enhancement.
        console.warn("[pairing-seed] Failed to persist secretSeed after logIn");
      }
      // Check for a stashed /invite fragment from a pre-auth invite visit.
      const pendingInviteFragment = sessionStorage.getItem("pending-invite-fragment");
      if (pendingInviteFragment) {
        sessionStorage.removeItem("pending-invite-fragment");
        window.location.assign(`/invite${pendingInviteFragment}`);
      }
      // Component will unmount as App's useIsAuthenticated flips to true.
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to restore account. Please try again.",
      );
      setIsRestoring(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            Restore account
          </h1>
          <p className="text-muted-foreground">
            Type your 24-word passphrase to sign into this device. Words must
            be separated by spaces.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="restore-passphrase-input"
              className="text-sm font-medium"
            >
              Passphrase
            </label>
            <textarea
              id="restore-passphrase-input"
              data-testid="restore-passphrase-input"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              rows={4}
              placeholder="word1 word2 word3 … word24"
              autoFocus
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && (
            <p
              data-testid="restore-error"
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
            disabled={isRestoring}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            data-testid="restore-btn"
            disabled={!canSubmit}
            onClick={() => void handleRestore()}
            className="flex-1"
          >
            {isRestoring ? "Restoring…" : "Restore"}
          </Button>
        </div>
      </div>
    </div>
  );
}
