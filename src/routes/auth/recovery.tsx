import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { recoverWithCode, setPasswordAfterRecovery } from "@/auth/flows";
import { useSignInToJazzWithSeed } from "@/jazz/createAccountFromSeed";
import { decodeRecoveryCode } from "@/auth/recovery-code";
import {
  AuthSurface,
  Wordmark,
  AuthTitle,
  AuthSub,
} from "@/components/auth-surface";

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
      setError(err instanceof Error ? err.message : "recovery failed");
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
        err instanceof Error ? err.message : "failed to set new password",
      );
      throw err;
    }
  }

  return (
    <>
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
    </>
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
    <AuthSurface forceDark w={368} tall>
      <Wordmark size={20} />
      <AuthTitle>recover account</AuthTitle>
      <AuthSub>enter your 24-word recovery code</AuthSub>
      <form className="flex flex-col gap-[15px]" onSubmit={handleSubmit}>
        <textarea
          data-testid="recovery-code-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={4}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          placeholder="word1 word2 word3 … word24"
          className="w-full rounded-r-3 border border-hairline bg-panel px-3 py-2 font-mono text-[12px] text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent"
        />
        {error && (
          <p
            data-testid="recovery-error"
            className="rounded-r-3 bg-red/10 px-3 py-2 text-[12px] text-red"
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={isLoading}
          data-testid="recovery-submit"
          className="h-10 w-full rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold disabled:opacity-50"
        >
          {isLoading ? "recovering…" : "recover"}
        </button>
        <Link
          to="/auth/login"
          className="block text-center text-[10.5px] text-dim hover:text-text"
        >
          back to sign in
        </Link>
      </form>
    </AuthSurface>
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
      setError("password must be at least 12 characters");
      return;
    }
    if (pw !== pw2) {
      setError("passwords do not match");
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
    <AuthSurface forceDark>
      <Wordmark size={20} />
      <AuthTitle>set a new password</AuthTitle>
      <AuthSub>you're signed in. choose a password for next time.</AuthSub>
      <form className="flex flex-col gap-[15px]" onSubmit={handleSubmit}>
        <input
          type="password"
          data-testid="recovery-new-password"
          placeholder="new password (≥12 chars)"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="new-password"
          className="h-[38px] rounded-r-3 border border-hairline bg-panel px-3 text-[12px] text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent"
        />
        <input
          type="password"
          data-testid="recovery-new-password-confirm"
          placeholder="confirm new password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          autoComplete="new-password"
          className="h-[38px] rounded-r-3 border border-hairline bg-panel px-3 text-[12px] text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent"
        />
        {error && (
          <p className="rounded-r-3 bg-red/10 px-3 py-2 text-[12px] text-red">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="h-10 flex-1 rounded-r-3 border border-hairline bg-transparent font-mono text-[12.5px] font-semibold text-text"
          >
            skip for now
          </button>
          <button
            type="submit"
            disabled={isLoading}
            data-testid="recovery-set-password"
            className="h-10 flex-1 rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold disabled:opacity-50"
          >
            {isLoading ? "saving…" : "save password"}
          </button>
        </div>
      </form>
    </AuthSurface>
  );
}
