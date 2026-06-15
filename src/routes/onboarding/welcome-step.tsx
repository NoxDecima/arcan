import { useNavigate } from "react-router-dom";
import { AuthSurface, Wordmark, AuthSub } from "@/components/auth-surface";

interface WelcomeStepProps {
  onCreateAccount: () => void;
  onRestoreAccount: () => void;
}

/**
 * WelcomeStep: first screen in the onboarding flow.
 *
 * Hero Wordmark + concise "local-first · end-to-end encrypted" tagline.
 * Primary CTA = create account; secondary = restore from recovery code;
 * sign-in CTA tucked beneath as a MuteLink-style row.
 *
 * Audit ref: AUDIT-005, AUDIT-006, headline observations #6 and #7.
 */
export function WelcomeStep({
  onCreateAccount,
  onRestoreAccount,
}: WelcomeStepProps) {
  const navigate = useNavigate();
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
          data-testid="welcome-signin-link"
          onClick={() => navigate("/auth/login")}
          className="text-arcan-accent hover:text-text"
        >
          sign in
        </button>
      </div>
    </AuthSurface>
  );
}
