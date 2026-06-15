import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signIn } from "@/auth/flows";
import { useSignInToJazzWithSeed } from "@/jazz/createAccountFromSeed";
import { AuthSurface, Wordmark, AuthTitle } from "@/components/auth-surface";

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
      setError(err instanceof Error ? err.message : "sign-in failed");
      setIsLoading(false);
    }
  }

  return (
    <AuthSurface forceDark>
      <Wordmark size={22} />
      <AuthTitle>sign in</AuthTitle>
      <form className="flex flex-col gap-[15px]" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-[6px]">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-dim">
            email
          </span>
          <input
            type="email"
            data-testid="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            placeholder="you@domain.dev"
            className="h-[38px] rounded-r-3 border border-hairline bg-panel px-3 text-text placeholder:text-dim text-[12px] focus:outline-none focus:border-arcan-accent"
          />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-dim">
            password
          </span>
          <input
            type="password"
            data-testid="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="h-[38px] rounded-r-3 border border-hairline bg-panel px-3 text-text placeholder:text-dim text-[12px] focus:outline-none focus:border-arcan-accent"
          />
        </label>

        {error && (
          <p
            data-testid="login-error"
            className="rounded-r-3 bg-red/10 px-3 py-2 text-[12px] text-red"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading}
          data-testid="login-submit"
          className="h-10 w-full rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold disabled:opacity-50"
        >
          {isLoading ? "signing in…" : "sign in"}
        </button>

        <div className="flex justify-between text-[10.5px]">
          <Link to="/auth/recovery" className="text-dim hover:text-text">
            forgot password?
          </Link>
          <Link to="/onboarding" className="text-arcan-accent hover:text-text">
            create account
          </Link>
        </div>
      </form>
    </AuthSurface>
  );
}
