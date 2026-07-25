import { WelcomeScreen } from "@/ui/screens";

interface WelcomeStepProps {
  onCreateAccount: () => void;
  /**
   * Restore via 24-word recovery code (offline path — no Better Auth
   * session required). Routed to the restore-with-code step downstream.
   */
  onRestoreAccount: () => void;
  /**
   * "already on a device? sign in" — Better Auth email/password path for
   * users who already have an account and are adding this device.
   */
  onSignInWithPassword: () => void;
}

/**
 * WelcomeStep: container for the first screen in the onboarding flow.
 * Delegates all rendering to WelcomeScreen (Rung 1 presenter).
 * All data logic lives in OnboardingRoute (index.tsx) — this is a thin
 * prop-forwarding shim + h-screen scaffold.
 */
export function WelcomeStep({
  onCreateAccount,
  onRestoreAccount,
  onSignInWithPassword,
}: WelcomeStepProps) {
  return (
    <div className="h-app w-app flex flex-col">
      <WelcomeScreen
        onCreateAccount={onCreateAccount}
        onRestore={onRestoreAccount}
        onSignIn={onSignInWithPassword}
        createTestId="create-account-btn"
        restoreTestId="restore-account-btn"
        signInTestId="signin-existing-btn"
      />
    </div>
  );
}
