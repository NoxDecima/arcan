import { AuthSurface, Wordmark, AuthSub } from "@/components/auth-surface";

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
 * - Hero Wordmark + concise "local-first · end-to-end encrypted" tagline.
 * - Three CTAs in design order:
 *     1. "create account"             — primary
 *     2. "restore from recovery code" — outline (offline path)
 *     3. "already on a device? sign in" — ghost (Better Auth path)
 *
 * The split surfaces the recovery affordance ahead of the email/password
 * fallback. The third CTA was previously labeled "Sign in to existing
 * account" and conflated with the recovery flow; Unit 8e split it out.
 *
 * Audit ref: AUDIT-005, AUDIT-006, headline observations #6 and #7.
 */
export function WelcomeStep({
  onCreateAccount,
  onRestoreAccount,
  onSignInWithPassword,
}: WelcomeStepProps) {
  return (
    <AuthSurface forceDark w={300}>
      <Wordmark size={30} />
      <AuthSub>local-first · end-to-end encrypted</AuthSub>
      <div className="h-[6px]" />
      <button
        type="button"
        data-testid="create-account-btn"
        onClick={onCreateAccount}
        className="h-10 w-full rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold"
      >
        create account
      </button>
      <button
        type="button"
        data-testid="restore-account-btn"
        onClick={onRestoreAccount}
        className="h-10 w-full rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold"
      >
        restore from recovery code
      </button>
      <div className="text-center mt-[2px] text-[10.5px]">
        <span className="text-dim">already on a device? </span>
        <button
          type="button"
          data-testid="signin-existing-btn"
          onClick={onSignInWithPassword}
          className="text-arcan-accent hover:text-text"
        >
          sign in
        </button>
      </div>
    </AuthSurface>
  );
}
