import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { WelcomeStep } from "./welcome-step";
import { CredentialsStep, type Credentials } from "./credentials-step";
import { BackupDisplayStep } from "./backup-display-step";
import { BackupConfirmStep } from "./backup-confirm-step";
import { ProfileStep } from "./profile-step";
import { RestoreChoiceStep } from "./restore-choice-step";
import { RestoreWithCodeStep } from "./restore-with-code-step";
import { generateRecoveryCode } from "@/auth/recovery-code";

/**
 * Discriminated union for the onboarding step state machine.
 *
 * Sign-up path:
 *   welcome → credentials → backup-display → backup-confirm → profile
 * Restore path:
 *   welcome → restore-choice
 *     → /auth/login (via navigate)
 *     → restore-with-code (24-word recovery code)
 */
type OnboardingStep =
  | { kind: "welcome" }
  | { kind: "credentials" }
  | { kind: "backup-display"; credentials: Credentials; recoveryCode: string }
  | { kind: "backup-confirm"; credentials: Credentials; recoveryCode: string }
  | { kind: "profile"; credentials: Credentials; recoveryCode: string }
  | { kind: "restore-choice" }
  | { kind: "restore-with-code" };

/**
 * OnboardingRoute: top-level step router for the onboarding flow.
 *
 * Rendered by App at /onboarding. The recovery code is generated in the
 * credentials → backup-display transition so the user sees the same code
 * that profile-step later decodes and feeds into flows.signUp.
 */
export function OnboardingRoute() {
  const [step, setStep] = useState<OnboardingStep>({ kind: "welcome" });
  const navigate = useNavigate();

  switch (step.kind) {
    case "welcome":
      return (
        <WelcomeStep
          onCreateAccount={() => setStep({ kind: "credentials" })}
          onRestoreAccount={() => setStep({ kind: "restore-choice" })}
        />
      );

    case "credentials":
      return (
        <CredentialsStep
          onBack={() => setStep({ kind: "welcome" })}
          onContinue={(credentials) => {
            const { recoveryCode } = generateRecoveryCode();
            setStep({ kind: "backup-display", credentials, recoveryCode });
          }}
        />
      );

    case "backup-display":
      return (
        <BackupDisplayStep
          phrase={step.recoveryCode}
          onBack={() => setStep({ kind: "credentials" })}
          onContinue={() =>
            setStep({
              kind: "backup-confirm",
              credentials: step.credentials,
              recoveryCode: step.recoveryCode,
            })
          }
        />
      );

    case "backup-confirm":
      return (
        <BackupConfirmStep
          phrase={step.recoveryCode}
          onBack={() =>
            setStep({
              kind: "backup-display",
              credentials: step.credentials,
              recoveryCode: step.recoveryCode,
            })
          }
          onConfirmed={() =>
            setStep({
              kind: "profile",
              credentials: step.credentials,
              recoveryCode: step.recoveryCode,
            })
          }
        />
      );

    case "profile":
      return (
        <ProfileStep
          credentials={step.credentials}
          recoveryCode={step.recoveryCode}
          onBack={() =>
            setStep({
              kind: "backup-display",
              credentials: step.credentials,
              recoveryCode: step.recoveryCode,
            })
          }
        />
      );

    case "restore-choice":
      return (
        <RestoreChoiceStep
          onBack={() => setStep({ kind: "welcome" })}
          onSignInWithPassword={() => navigate("/auth/login")}
          onRestoreWithCode={() => setStep({ kind: "restore-with-code" })}
        />
      );

    case "restore-with-code":
      return (
        <RestoreWithCodeStep
          onBack={() => setStep({ kind: "restore-choice" })}
        />
      );
  }
}
