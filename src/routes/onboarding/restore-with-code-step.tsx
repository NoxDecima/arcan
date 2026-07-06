import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { validatePassphrase } from "@/auth/passphrase";
import { recoverWithCode } from "@/auth/flows";
import { useSignInToJazzWithSeed } from "@/jazz/createAccountFromSeed";
import { RestoreScreen } from "@/ui/screens";

interface RestoreWithCodeStepProps {
  onBack: () => void;
}

/**
 * RestoreWithCodeStep: container for the restore-with-code onboarding step.
 * Delegates rendering to RestoreScreen (Rung 2 presenter, advisory parity).
 *
 * Signs into an existing account using a 24-word recovery code (the BIP-39
 * encoding of the user's account seed).
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
          "the recovery code must be exactly 24 words. please check your input.",
        "invalid-word":
          "one or more words are not in the BIP-39 word list. check for typos.",
        "invalid-checksum":
          "the recovery code checksum is invalid. please check all 24 words carefully.",
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
          : "failed to restore account. please try again.",
      );
      setIsRestoring(false);
    }
  }

  const errorSlot = error ? (
    <p
      data-testid="restore-error"
      className="rounded-r-4 bg-red/10 px-3 py-2 text-ui-toast text-red"
    >
      {error}
    </p>
  ) : undefined;

  return (
    <div className="h-screen w-screen flex flex-col">
      <RestoreScreen
        code={phrase}
        onCode={setPhrase}
        onRestore={() => void handleRestore()}
        onBack={onBack}
        restoring={isRestoring}
        errorSlot={errorSlot}
        codeTestId="restore-passphrase-input"
        restoreTestId="restore-btn"
      />
    </div>
  );
}
