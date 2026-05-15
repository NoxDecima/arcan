import { Button } from "@/components/ui/button";
import { generatePassphrase } from "@/auth/passphrase";

interface WelcomeStepProps {
  onCreateAccount: (phrase: string) => void;
  onRestoreAccount: () => void;
}

/**
 * WelcomeStep: first screen in the onboarding flow.
 *
 * Generates a fresh 24-word passphrase on "Create new account" click (before
 * any Jazz interaction) and hands it up to the parent state machine so it can
 * be shown on the passphrase-display step.
 */
export function WelcomeStep({ onCreateAccount, onRestoreAccount }: WelcomeStepProps) {
  function handleCreate() {
    const phrase = generatePassphrase();
    onCreateAccount(phrase);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome to Jazz Messanger
          </h1>
          <p className="text-muted-foreground">
            A local-first, end-to-end encrypted messenger. Your account is
            protected by a passphrase that only you control.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            data-testid="create-account-btn"
            onClick={handleCreate}
          >
            Create new account
          </Button>
          <Button
            variant="outline"
            size="lg"
            data-testid="restore-account-btn"
            onClick={onRestoreAccount}
          >
            Restore account from passphrase
          </Button>
        </div>
      </div>
    </div>
  );
}
