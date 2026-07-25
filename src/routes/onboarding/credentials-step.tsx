import { useState } from "react";
import { CredentialsScreen } from "@/ui/screens";

export type Credentials = {
  email: string;
  password: string;
};

interface CredentialsStepProps {
  onBack: () => void;
  onContinue: (credentials: Credentials) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 12;

/**
 * CredentialsStep: container for the credentials onboarding step.
 * Delegates rendering to CredentialsScreen (Rung 2 presenter).
 * Owns local validation: EMAIL_RE, MIN_PASSWORD_LEN.
 */
export function CredentialsStep({ onBack, onContinue }: CredentialsStepProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!EMAIL_RE.test(email)) return "please enter a valid email address.";
    if (password.length < MIN_PASSWORD_LEN)
      return `password must be at least ${MIN_PASSWORD_LEN} characters.`;
    if (password !== confirm) return "passwords do not match.";
    return null;
  }

  function handleContinue() {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onContinue({ email: email.trim(), password });
  }

  const errorSlot = error ? (
    <p
      data-testid="credentials-error"
      className="rounded-r-4 bg-red/10 px-3 py-2 text-ui-toast text-red"
    >
      {error}
    </p>
  ) : undefined;

  return (
    <div className="h-app w-app flex flex-col">
      <CredentialsScreen
        email={email}
        onEmail={setEmail}
        password={password}
        onPassword={setPassword}
        confirm={confirm}
        onConfirm={setConfirm}
        onContinue={handleContinue}
        onBack={onBack}
        errorSlot={errorSlot}
        formTestId="credentials-form"
        emailTestId="credentials-email"
        passwordTestId="credentials-password"
        confirmTestId="credentials-confirm"
        continueTestId="credentials-continue"
      />
    </div>
  );
}
