import { useState } from "react";
import { BackupDisplayScreen } from "@/ui/screens";
import { PassphraseGrid } from "@/components/passphrase-grid";

interface BackupDisplayStepProps {
  phrase: string;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * BackupDisplayStep: container for the backup-display onboarding step.
 * Delegates rendering to BackupDisplayScreen (Rung 2 presenter).
 * Owns the `acknowledged` state; the presenter shows the grid and the
 * checkbox slot, and gates the "i've saved it →" button.
 */
export function BackupDisplayStep({
  phrase,
  onBack,
  onContinue,
}: BackupDisplayStepProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  const gridSlot = (
    <PassphraseGrid phrase={phrase} compact withCopyButton />
  );

  const ackSlot = (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        data-testid="passphrase-saved-checkbox"
        checked={acknowledged}
        onChange={(e) => setAcknowledged(e.target.checked)}
        className="mt-[2px] h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent)]"
      />
      <span className="text-ui-value text-text-2 leading-relaxed">
        i have saved my recovery code in a secure location and understand it
        cannot be recovered if lost.
      </span>
    </label>
  );

  return (
    <div className="h-screen w-screen flex flex-col">
      <BackupDisplayScreen
        gridSlot={gridSlot}
        ackSlot={ackSlot}
        continueDisabled={!acknowledged}
        onContinue={onContinue}
        onBack={onBack}
        continueTestId="passphrase-display-continue"
      />
    </div>
  );
}
