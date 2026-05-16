import { useState } from "react";
import { WelcomeStep } from "./welcome-step";
import { PassphraseDisplayStep } from "./passphrase-display-step";
import { PassphraseConfirmStep } from "./passphrase-confirm-step";
import { ProfileStep } from "./profile-step";
import { RestoreStep } from "./restore-step";

/**
 * Discriminated union for the onboarding step state machine.
 *
 * Transitions:
 *   welcome
 *     → passphrase-display  (user clicks "Create new account"; phrase generated)
 *     → restore             (user clicks "Restore account")
 *   passphrase-display
 *     → passphrase-confirm  (user ticks checkbox + clicks "Continue")
 *     → welcome             (back)
 *   passphrase-confirm
 *     → profile             (all three challenge words correct)
 *     → passphrase-display  (back)
 *   profile
 *     → passphrase-display  (back — user wants to see phrase again)
 *     → [signed in]         (account created; App unmounts OnboardingRoute)
 *   restore
 *     → welcome             (back)
 *     → [signed in]         (logIn succeeds; App unmounts OnboardingRoute)
 */
type OnboardingStep =
  | { kind: "welcome" }
  | { kind: "passphrase-display"; phrase: string }
  | { kind: "passphrase-confirm"; phrase: string }
  | { kind: "profile"; phrase: string }
  | { kind: "restore" };

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
            setStep({ kind: "passphrase-display", phrase })
          }
          onRestoreAccount={() => setStep({ kind: "restore" })}
        />
      );

    case "passphrase-display":
      return (
        <PassphraseDisplayStep
          phrase={step.phrase}
          onBack={() => setStep({ kind: "welcome" })}
          onContinue={() =>
            setStep({ kind: "passphrase-confirm", phrase: step.phrase })
          }
        />
      );

    case "passphrase-confirm":
      return (
        <PassphraseConfirmStep
          phrase={step.phrase}
          onBack={() =>
            setStep({ kind: "passphrase-display", phrase: step.phrase })
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
            setStep({ kind: "passphrase-display", phrase: step.phrase })
          }
        />
      );

    case "restore":
      return <RestoreStep onBack={() => setStep({ kind: "welcome" })} />;
  }
}
