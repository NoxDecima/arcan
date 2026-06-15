import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PassphraseGrid } from "@/components/passphrase-grid";

interface BackupDisplayStepProps {
  phrase: string;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * BackupDisplayStep: shows the user their 24-word recovery code.
 *
 * The user must explicitly tick a checkbox to acknowledge they have saved the
 * code before the "Continue" button becomes active. This gates progression to
 * the confirm step where they must reproduce three random words.
 */
export function BackupDisplayStep({
  phrase,
  onBack,
  onContinue,
}: BackupDisplayStepProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-text">
            Save your recovery code
          </h1>
          <p className="text-text-2">
            These 24 words are the <strong>only</strong> way back into your
            account if you forget your password. Store them somewhere safe —
            anyone who has them can sign in as you.
          </p>
        </div>

        <PassphraseGrid phrase={phrase} withCopyButton />

        {/* Acknowledge checkbox */}
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            data-testid="passphrase-saved-checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
          />
          <span className="text-sm text-text-2">
            I have saved my recovery code in a secure location and understand
            that it cannot be recovered if lost.
          </span>
        </label>

        {/* Navigation */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button
            data-testid="passphrase-display-continue"
            disabled={!acknowledged}
            onClick={onContinue}
            className="flex-1"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
