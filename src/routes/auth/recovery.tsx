import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { recoverWithCode, setPasswordAfterRecovery } from "@/auth/flows";
import { useSignInToJazzWithSeed } from "@/jazz/createAccountFromSeed";
import { decodeRecoveryCode } from "@/auth/recovery-code";

type Stage =
  | { kind: "enter-code" }
  | { kind: "enter-new-password"; seed: Uint8Array; accountID: string };

/**
 * RecoveryRoute: two-stage recovery via 24-word recovery code.
 *
 * Stage 1 (enter-code): user pastes the 24-word recovery code; we decode
 * to a 32-byte seed, hand it to Jazz to sign in, then advance to stage 2.
 *
 * Stage 2 (enter-new-password): user picks a new password; we KDF + AES
 * the seed again and POST to /api/auth/reset-with-recovery, which the
 * server verifies via the recoveryProofHmac against the seed-derived key.
 * On success the user has both Jazz access AND a usable password for next
 * time. Skipping stage 2 leaves the account usable on this device only
 * (no password = no future email/password sign-in).
 */
export function RecoveryRoute() {
  const [stage, setStage] = useState<Stage>({ kind: "enter-code" });
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const signInToJazz = useSignInToJazzWithSeed();

  async function handleEnterCode(code: string): Promise<void> {
    setError(null);
    try {
      const result = await recoverWithCode({
        recoveryCode: code,
        signInToJazz,
      });
      setStage({
        kind: "enter-new-password",
        seed: decodeRecoveryCode(code),
        accountID: result.accountID,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recovery failed");
      throw err;
    }
  }

  async function handleSetNewPassword(newPassword: string): Promise<void> {
    setError(null);
    if (stage.kind !== "enter-new-password") return;
    try {
      await setPasswordAfterRecovery({
        newPassword,
        seed: stage.seed,
        accountID: stage.accountID,
      });
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to set new password",
      );
      throw err;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {stage.kind === "enter-code" ? (
        <StageCode error={error} onSubmit={handleEnterCode} />
      ) : (
        <StageNewPassword
          error={error}
          setError={setError}
          onSubmit={handleSetNewPassword}
          onSkip={() => navigate("/", { replace: true })}
        />
      )}
    </div>
  );
}

interface StageCodeProps {
  error: string | null;
  onSubmit: (code: string) => Promise<void>;
}

function StageCode({ error, onSubmit }: StageCodeProps) {
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      await onSubmit(code);
    } catch {
      // Parent's setError already populated.
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="w-full max-w-md space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Recover account</h1>
        <p className="text-muted-foreground">
          Enter your 24-word recovery code.
        </p>
      </div>
      <textarea
        data-testid="recovery-code-input"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        rows={4}
        autoFocus
        spellCheck={false}
        autoComplete="off"
        placeholder="word1 word2 word3 … word24"
        className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {error && (
        <p
          data-testid="recovery-error"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <Button
        type="submit"
        disabled={isLoading}
        data-testid="recovery-submit"
        className="w-full"
      >
        {isLoading ? "Recovering…" : "Recover"}
      </Button>
      <Link
        to="/auth/login"
        className="block text-center text-sm text-muted-foreground hover:text-foreground"
      >
        Back to sign in
      </Link>
    </form>
  );
}

interface StageNewPasswordProps {
  error: string | null;
  setError: (msg: string | null) => void;
  onSubmit: (newPassword: string) => Promise<void>;
  onSkip: () => void;
}

function StageNewPassword({
  error,
  setError,
  onSubmit,
  onSkip,
}: StageNewPasswordProps) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }
    if (pw !== pw2) {
      setError("Passwords do not match");
      return;
    }
    setIsLoading(true);
    try {
      await onSubmit(pw);
    } catch {
      // Parent setError already populated.
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="w-full max-w-md space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          Set a new password
        </h1>
        <p className="text-muted-foreground">
          You're signed in. Choose a password to enable email sign-in next
          time.
        </p>
      </div>
      <input
        type="password"
        data-testid="recovery-new-password"
        placeholder="New password (≥12 chars)"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        autoComplete="new-password"
        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <input
        type="password"
        data-testid="recovery-new-password-confirm"
        placeholder="Confirm new password"
        value={pw2}
        onChange={(e) => setPw2(e.target.value)}
        autoComplete="new-password"
        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onSkip}
          className="flex-1"
        >
          Skip for now
        </Button>
        <Button
          type="submit"
          disabled={isLoading}
          data-testid="recovery-set-password"
          className="flex-1"
        >
          {isLoading ? "Saving…" : "Save password"}
        </Button>
      </div>
    </form>
  );
}
