import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { recoverWithCode, setPasswordAfterRecovery } from "@/auth/flows";
import { useSignInToJazzWithSeed } from "@/jazz/createAccountFromSeed";
import { decodeRecoveryCode } from "@/auth/recovery-code";
import {
  AuthSurface,
  AuthTitle,
  AuthSub,
  AuthField,
  PButton,
  MuteLink,
  ArcanMark,
} from "@/ui/kit";

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
 *
 * NOTE: App.tsx mounts this route with special remount-hazard handling;
 * do NOT restructure the App.tsx routing or this route's export structure.
 *
 * Rung-4: no hf proto twin. Built inline from the auth kit.
 * Decision B: forceDark dropped — auth surfaces are theme-reactive.
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
    <div className="h-screen w-screen flex flex-col">
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
  const navigate = useNavigate();

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
    <AuthSurface tall w={376}>
      <div className="flex justify-center">
        <ArcanMark stacked size={42} />
      </div>
      <AuthTitle>recover account</AuthTitle>
      <AuthSub>enter your 24-word recovery code</AuthSub>
      <form className="flex flex-col gap-[15px]" onSubmit={handleSubmit}>
        <AuthField
          as="textarea"
          rows={4}
          label="recovery code"
          mono
          value={code}
          onChange={setCode}
          placeholder="word1 word2 word3 … word24"
          autoFocus
          spellCheck={false}
          autoComplete="off"
          inputTestId="recovery-code-input"
        />
        {error && (
          <p
            data-testid="recovery-error"
            className="rounded-r-4 bg-red/10 px-3 py-2 text-ui-toast text-red"
          >
            {error}
          </p>
        )}
        <PButton
          primary
          full
          disabled={isLoading}
          label={isLoading ? "recovering…" : "recover →"}
          data-testid="recovery-submit"
        />
      </form>
      <div className="text-center">
        <button
          type="button"
          className="p-0 m-0 cursor-pointer [-webkit-tap-highlight-color:transparent]"
          onClick={() => navigate("/auth/login")}
        >
          <MuteLink>back to sign in</MuteLink>
        </button>
      </div>
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
    <AuthSurface>
      <div className="flex justify-center">
        <ArcanMark stacked size={42} />
      </div>
      <AuthTitle>set a new password</AuthTitle>
      <AuthSub>you're signed in. choose a password for next time.</AuthSub>
      <form className="flex flex-col gap-[15px]" onSubmit={handleSubmit}>
        <AuthField
          label="new password"
          type="password"
          value={pw}
          onChange={setPw}
          placeholder="new password (≥12 chars)"
          autoComplete="new-password"
          inputTestId="recovery-new-password"
        />
        <AuthField
          label="confirm password"
          type="password"
          value={pw2}
          onChange={setPw2}
          placeholder="confirm new password"
          autoComplete="new-password"
          inputTestId="recovery-new-password-confirm"
        />
        {error && (
          <p className="rounded-r-4 bg-red/10 px-3 py-2 text-ui-toast text-red">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <div className="flex-1">
            <PButton full label="skip for now" onClick={onSkip} type="button" />
          </div>
          <div className="flex-1">
            <PButton
              primary
              full
              disabled={isLoading}
              label={isLoading ? "saving…" : "save password"}
              data-testid="recovery-set-password"
            />
          </div>
        </div>
      </form>
    </AuthSurface>
  );
}
