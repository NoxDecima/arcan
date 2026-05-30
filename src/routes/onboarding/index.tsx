import { useState } from "react";
import { WelcomeStep } from "./welcome-step";
import { BackupDisplayStep } from "./backup-display-step";
import { BackupConfirmStep } from "./backup-confirm-step";
import { ProfileStep } from "./profile-step";
import { RestoreWithCodeStep } from "./restore-with-code-step";

/**
 * Discriminated union for the onboarding step state machine.
 *
 * Transitions:
 *   welcome
 *     → backup-display      (user clicks "Create new account"; phrase generated)
 *     → restore-with-code   (user clicks "Sign in to existing account")
 *   backup-display
 *     → backup-confirm      (user ticks checkbox + clicks "Continue")
 *     → welcome             (back)
 *   backup-confirm
 *     → profile             (all three challenge words correct)
 *     → backup-display      (back)
 *   profile
 *     → backup-display      (back — user wants to see phrase again)
 *     → [signed in]         (account created; App unmounts OnboardingRoute)
 *   restore-with-code
 *     → welcome             (back)
 *     → [signed in]         (logIn succeeds; App unmounts OnboardingRoute)
 */
type OnboardingStep =
  | { kind: "welcome" }
  | { kind: "backup-display"; phrase: string }
  | { kind: "backup-confirm"; phrase: string }
  | { kind: "profile"; phrase: string }
  | { kind: "restore-with-code" };

/**
 * OnboardingRoute: top-level step router for the onboarding flow.
 *
 * Rendered by App when the user is not yet authenticated (`useIsAuthenticated`
 * returns false). Does not use react-router-dom — a simple useState-based
 * state machine is sufficient for the linear onboarding flow.
 */
export function OnboardingRoute() {
  const [step, setStep] = useState<OnboardingStep>({ kind: "welcome" });

  switch (step.kind) {
    case "welcome":
      return (
        <WelcomeStep
          onCreateAccount={(phrase) =>
            setStep({ kind: "backup-display", phrase })
          }
          onRestoreAccount={() => setStep({ kind: "restore-with-code" })}
        />
      );

    case "backup-display":
      return (
        <BackupDisplayStep
          phrase={step.phrase}
          onBack={() => setStep({ kind: "welcome" })}
          onContinue={() =>
            setStep({ kind: "backup-confirm", phrase: step.phrase })
          }
        />
      );

    case "backup-confirm":
      return (
        <BackupConfirmStep
          phrase={step.phrase}
          onBack={() =>
            setStep({ kind: "backup-display", phrase: step.phrase })
          }
          onConfirmed={() =>
            setStep({ kind: "profile", phrase: step.phrase })
          }
        />
      );

    case "profile":
      return (
        <ProfileStep
          phrase={step.phrase}
          onBack={() =>
            setStep({ kind: "backup-display", phrase: step.phrase })
          }
        />
      );

    case "restore-with-code":
      return (
        <RestoreWithCodeStep onBack={() => setStep({ kind: "welcome" })} />
      );
  }
}
