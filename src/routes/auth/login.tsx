import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signIn } from "@/auth/flows";
import { useSignInToJazzWithSeed } from "@/jazz/createAccountFromSeed";
import { SignInScreen } from "@/ui/screens";
import { ServerOverride } from "@/components/server-override";

/**
 * LoginRoute: email + password sign-in.
 *
 * Wires the new flows.signIn (POST /api/auth/sign-in/email + KDF + AES
 * decrypt + Jazz sign-in) and navigates to "/" on success. On failure
 * shows the server's message (typically "Invalid credentials").
 *
 * Container: wraps SignInScreen presenter; moves all data logic here.
 * The presenter is a pure JSX renderer; this file owns state + effects.
 */
export function LoginRoute() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const signInToJazz = useSignInToJazzWithSeed();

  async function handleSubmit() {
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

  const errorSlot = error ? (
    <p
      data-testid="login-error"
      className="rounded-r-4 bg-red/10 px-3 py-2 text-ui-toast text-red"
    >
      {error}
    </p>
  ) : undefined;

  return (
    <div className="h-screen w-screen flex flex-col">
      <SignInScreen
        email={email}
        onEmail={setEmail}
        password={password}
        onPassword={setPassword}
        onSubmit={handleSubmit}
        submitting={isLoading}
        errorSlot={errorSlot}
        onForgot={() => navigate("/auth/recovery")}
        onCreate={() => navigate("/onboarding")}
        emailTestId="login-email"
        passwordTestId="login-password"
        submitTestId="login-submit"
      />
      <ServerOverride />
    </div>
  );
}
