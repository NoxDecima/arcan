import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

export type Credentials = {
  email: string;
  username: string;
  password: string;
};

interface CredentialsStepProps {
  onBack: () => void;
  onContinue: (credentials: Credentials) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;
const MIN_PASSWORD_LEN = 12;

/**
 * CredentialsStep: collects the email, username, and password that drive the
 * new zero-knowledge sign-up.
 *
 * The component does only local validation: regex-based email/username checks
 * and minimum password length. The Better Auth server will additionally
 * enforce uniqueness on email/username at the /sign-up call. Network errors
 * are surfaced one step later in profile-step.
 */
export function CredentialsStep({ onBack, onContinue }: CredentialsStepProps) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!EMAIL_RE.test(email)) return "Please enter a valid email address.";
    if (!USERNAME_RE.test(username))
      return "Username must be 3–32 characters: letters, numbers, underscores.";
    if (password.length < MIN_PASSWORD_LEN)
      return `Password must be at least ${MIN_PASSWORD_LEN} characters.`;
    if (password !== confirm) return "Passwords do not match.";
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
    onContinue({ email: email.trim(), username: username.trim(), password });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        className="w-full max-w-md space-y-6"
        onSubmit={handleSubmit}
        data-testid="credentials-form"
      >
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
          <p className="text-muted-foreground">
            Email is for sign-in. Username is your public handle.
          </p>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              data-testid="credentials-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Username</span>
            <input
              type="text"
              data-testid="credentials-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">
              Password (≥{MIN_PASSWORD_LEN} characters)
            </span>
            <input
              type="password"
              data-testid="credentials-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LEN}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Confirm password</span>
            <input
              type="password"
              data-testid="credentials-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>

        {error && (
          <p
            data-testid="credentials-error"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button type="submit" data-testid="credentials-continue" className="flex-1">
            Continue
          </Button>
        </div>
      </form>
    </div>
  );
}
