import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { validatePassphrase } from "@/auth/passphrase";
import { recoverWithCode } from "@/auth/flows";
import { useSignInToJazzWithSeed } from "@/jazz/createAccountFromSeed";
import { Button } from "@/components/ui/button";

interface RestoreWithCodeStepProps {
  onBack: () => void;
}

/**
 * RestoreWithCodeStep: signs into an existing account using a 24-word
 * recovery code (the BIP-39 encoding of the user's account seed).
 *
 * Validation sequence:
 *   1. Local structural validation via validatePassphrase() — returns a
 *      structured reason (invalid-length / invalid-word / invalid-checksum)
 *      so the user gets specific feedback without a network round-trip.
 *   2. flows.recoverWithCode() decodes the mnemonic, derives the Jazz
 *      AgentSecret via the bridge, and authenticates the local node.
 *
 * After Jazz sign-in succeeds we navigate to /auth/recovery so the user
 * can set a fresh password — recovery-code-only sign-ins leave the
 * account password unchanged, which means subsequent logins still need
 * the recovery code. /auth/recovery's stage-2 form provides a "Skip for
 * now" escape if the user just wanted in.
 *
 * Note: data-testids stay "restore-passphrase-input", "restore-btn",
 * "restore-error" for Phase C e2e compatibility.
 */
export function RestoreWithCodeStep({ onBack }: RestoreWithCodeStepProps) {
  const [phrase, setPhrase] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const signInToJazz = useSignInToJazzWithSeed();

  const canSubmit = phrase.trim().length > 0 && !isRestoring;

  async function handleRestore() {
    if (!canSubmit) return;
    setError(null);

    const trimmed = phrase.trim().replace(/\s+/g, " ");

    // Step 1: local structural validation (cheap, no network)
    const validation = validatePassphrase(trimmed);
    if (!validation.ok) {
      const reasons: Record<typeof validation.reason, string> = {
        "invalid-length":
          "The recovery code must be exactly 24 words. Please check your input.",
        "invalid-word":
          "One or more words are not in the BIP-39 word list. Check for typos.",
        "invalid-checksum":
          "The recovery code checksum is invalid. Please check all 24 words carefully.",
      };
      setError(reasons[validation.reason]);
      return;
    }

    // Step 2: recover via the auth flow + Jazz bridge
    setIsRestoring(true);
    try {
      await recoverWithCode({
        recoveryCode: trimmed,
        signInToJazz,
      });
      // Replay any stashed /invite fragment from a pre-auth invite visit.
      const pendingInviteFragment = sessionStorage.getItem(
        "pending-invite-fragment",
      );
      if (pendingInviteFragment) {
        sessionStorage.removeItem("pending-invite-fragment");
        window.location.assign(`/invite${pendingInviteFragment}`);
        return;
      }
      // Recovery flow's stage-2 prompts the user to set a fresh password.
      // The user is already signed in to Jazz at this point.
      navigate("/auth/recovery", { replace: true });
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
            Type your 24-word recovery code to sign into this device. Words
            must be separated by spaces.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="restore-passphrase-input"
              className="text-sm font-medium"
            >
              Recovery code
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
