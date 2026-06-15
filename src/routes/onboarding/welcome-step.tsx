import { Button } from "@/components/ui/button";

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
 * WelcomeStep: first screen in the onboarding flow.
 *
 * Design-aligned layout per Unit 8 audit headline observations #6 + #7:
 *
 * - Short tagline subtitle ("local-first · end-to-end encrypted") — the
 *   Wordmark carries the brand.
 * - Three CTAs in design order:
 *     1. "create account"             — primary
 *     2. "restore from recovery code" — outline (offline path)
 *     3. "already on a device? sign in" — ghost (Better Auth path)
 *
 * The split surfaces the recovery affordance ahead of the email/password
 * fallback. The third CTA was previously labeled "Sign in to existing
 * account" and conflated with the recovery flow; Unit 8e split it out.
 */
export function WelcomeStep({
  onCreateAccount,
  onRestoreAccount,
  onSignInWithPassword,
}: WelcomeStepProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome to Arcan
          </h1>
          <p className="text-muted-foreground">
            local-first · end-to-end encrypted
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            data-testid="create-account-btn"
            onClick={onCreateAccount}
          >
            create account
          </Button>
          <Button
            variant="outline"
            size="lg"
            data-testid="restore-account-btn"
            onClick={onRestoreAccount}
          >
            restore from recovery code
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-testid="signin-existing-btn"
            onClick={onSignInWithPassword}
          >
            already on a device? sign in
          </Button>
        </div>
      </div>
    </div>
  );
}
