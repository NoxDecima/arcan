import { useState, type FormEvent } from "react";
import { AuthSurface, Steps, AuthTitle } from "@/components/auth-surface";

export type Credentials = {
  email: string;
  password: string;
};

interface CredentialsStepProps {
  onBack: () => void;
  onContinue: (credentials: Credentials) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 12;

/**
 * CredentialsStep: collects the email + password that drive the zero-knowledge
 * sign-up. Display name is collected later on profile-step.
 *
 * Local validation only — Better Auth enforces email uniqueness on /sign-up.
 * Network errors are surfaced one step later in profile-step.
 */
export function CredentialsStep({ onBack, onContinue }: CredentialsStepProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!EMAIL_RE.test(email)) return "please enter a valid email address.";
    if (password.length < MIN_PASSWORD_LEN)
      return `password must be at least ${MIN_PASSWORD_LEN} characters.`;
    if (password !== confirm) return "passwords do not match.";
    return null;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onContinue({ email: email.trim(), password });
  }

  return (
    <AuthSurface forceDark>
      <Steps n={1} />
      <AuthTitle>create your account</AuthTitle>
      <form
        className="flex flex-col gap-[15px]"
        onSubmit={handleSubmit}
        data-testid="credentials-form"
      >
        <label className="flex flex-col gap-[6px]">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-dim">
            email
          </span>
          <input
            type="email"
            data-testid="credentials-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            placeholder="you@domain.dev"
            className="h-[38px] rounded-r-3 border border-hairline bg-panel px-3 text-[12px] text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent"
          />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-dim">
            password
          </span>
          <input
            type="password"
            data-testid="credentials-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LEN}
            placeholder="choose a strong password"
            className="h-[38px] rounded-r-3 border border-hairline bg-panel px-3 text-[12px] text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent"
          />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-dim">
            confirm password
          </span>
          <input
            type="password"
            data-testid="credentials-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            placeholder="••••••••"
            className="h-[38px] rounded-r-3 border border-hairline bg-panel px-3 text-[12px] text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent"
          />
        </label>

        {error && (
          <p
            data-testid="credentials-error"
            className="rounded-r-3 bg-red/10 px-3 py-2 text-[12px] text-red"
          >
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="h-10 flex-1 rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold"
          >
            back
          </button>
          <button
            type="submit"
            data-testid="credentials-continue"
            className="h-10 flex-1 rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold"
          >
            continue →
          </button>
        </div>
        <div className="text-center text-[10.5px] text-dim">step 1 of 4</div>
      </form>
    </AuthSurface>
  );
}
