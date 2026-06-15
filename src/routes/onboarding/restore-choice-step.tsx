import {
  AuthSurface,
  Wordmark,
  AuthTitle,
  AuthSub,
} from "@/components/auth-surface";

interface RestoreChoiceStepProps {
  onBack: () => void;
  onSignInWithPassword: () => void;
  onRestoreWithCode: () => void;
}

/**
 * RestoreChoiceStep: lets the user pick between the two sign-in paths.
 * Path A: email + password (the common case).
 * Path B: 24-word recovery code (forgot-password escape hatch).
 */
export function RestoreChoiceStep({
  onBack,
  onSignInWithPassword,
  onRestoreWithCode,
}: RestoreChoiceStepProps) {
  return (
    <AuthSurface forceDark>
      <Wordmark size={22} />
      <AuthTitle>restore your account</AuthTitle>
      <AuthSub>how would you like to sign in?</AuthSub>

      <button
        type="button"
        data-testid="restore-choice-signin"
        onClick={onSignInWithPassword}
        className="h-10 w-full rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold"
      >
        sign in with email & password
      </button>
      <button
        type="button"
        data-testid="restore-choice-code"
        onClick={onRestoreWithCode}
        className="h-10 w-full rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold"
      >
        use 24-word recovery code
      </button>
      <button
        type="button"
        onClick={onBack}
        className="h-10 w-full bg-transparent text-text-2 font-mono text-[12.5px] font-semibold"
      >
        back
      </button>
    </AuthSurface>
  );
}
