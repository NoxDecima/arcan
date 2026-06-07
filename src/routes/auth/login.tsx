import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { signIn } from "@/auth/flows";
import { useSignInToJazzWithSeed } from "@/jazz/createAccountFromSeed";

/**
 * LoginRoute: email + password sign-in.
 *
 * Wires the new flows.signIn (POST /api/auth/sign-in/email + KDF + AES
 * decrypt + Jazz sign-in) and navigates to "/" on success. On failure
 * shows the server's message (typically "Invalid credentials").
 */
export function LoginRoute() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const signInToJazz = useSignInToJazzWithSeed();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await signIn({
        email: email.trim(),
        password,
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
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form className="w-full max-w-md space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
          <p className="text-muted-foreground">
            Welcome back to Arcan.
          </p>
        </div>

        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            data-testid="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <input
            type="password"
            data-testid="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        {error && (
          <p
            data-testid="login-error"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={isLoading}
          className="w-full"
          data-testid="login-submit"
        >
          {isLoading ? "Signing in…" : "Sign in"}
        </Button>

        <div className="flex justify-between text-sm">
          <Link
            to="/auth/recovery"
            className="text-muted-foreground hover:text-foreground"
          >
            Forgot password?
          </Link>
          <Link
            to="/onboarding"
            className="text-muted-foreground hover:text-foreground"
          >
            Create new account
          </Link>
        </div>
      </form>
    </div>
  );
}
