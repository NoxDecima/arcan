import { Button } from "@/components/ui/button";

interface WelcomeStepProps {
  onCreateAccount: () => void;
  onRestoreAccount: () => void;
}

/**
 * WelcomeStep: first screen in the onboarding flow.
 *
 * In the new email/password world, the recovery code is generated inside
 * the credentials → backup-display transition (so it's bound to a fresh
 * Better Auth account creation, not to a casual "Create" button click).
 * This handler is now a thin passthrough.
 */
export function WelcomeStep({
  onCreateAccount,
  onRestoreAccount,
}: WelcomeStepProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome to Arcan
          </h1>
          <p className="text-muted-foreground">
            A local-first, end-to-end encrypted messenger. Your account is
            protected by a password you control; a 24-word recovery code is
            your escape hatch if you forget it.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            data-testid="create-account-btn"
            onClick={onCreateAccount}
          >
            Create new account
          </Button>
          <Button
            variant="outline"
            size="lg"
            data-testid="restore-account-btn"
            onClick={onRestoreAccount}
          >
            Sign in to existing account
          </Button>
        </div>
      </div>
    </div>
  );
}
