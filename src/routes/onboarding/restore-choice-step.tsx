import { Button } from "@/components/ui/button";

interface RestoreChoiceStepProps {
  onBack: () => void;
  onSignInWithPassword: () => void;
  onRestoreWithCode: () => void;
}

/**
 * RestoreChoiceStep: lets the user pick between the two sign-in paths.
 *
 * Path A: email + password → /auth/login (the common case — user remembers
 * their password).
 *
 * Path B: 24-word recovery code → onboarding's restore-with-code step, which
 * is for the recovery-code escape hatch when the password is forgotten.
 */
export function RestoreChoiceStep({
  onBack,
  onSignInWithPassword,
  onRestoreWithCode,
}: RestoreChoiceStepProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            Restore your account
          </h1>
          <p className="text-muted-foreground">How would you like to sign in?</p>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            data-testid="restore-choice-signin"
            onClick={onSignInWithPassword}
          >
            Sign in with email & password
          </Button>
          <Button
            size="lg"
            variant="outline"
            data-testid="restore-choice-code"
            onClick={onRestoreWithCode}
          >
            Use 24-word recovery code
          </Button>
        </div>

        <Button variant="ghost" onClick={onBack} className="w-full">
          Back
        </Button>
      </div>
    </div>
  );
}
