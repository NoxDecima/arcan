import { useState } from "react";
import { Button } from "@/components/ui/button";

interface PassphraseDisplayStepProps {
  phrase: string;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * PassphraseDisplayStep: shows the user their 24-word recovery passphrase.
 *
 * The user must explicitly tick a checkbox to acknowledge they have saved the
 * phrase before the "Continue" button becomes active. This gates progression
 * to the confirm step where they must reproduce three random words.
 */
export function PassphraseDisplayStep({
  phrase,
  onBack,
  onContinue,
}: PassphraseDisplayStepProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const words = phrase.trim().split(/\s+/);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            Save your passphrase
          </h1>
          <p className="text-muted-foreground">
            These 24 words are the <strong>only</strong> way to recover your
            account. Store them somewhere safe — anyone who has them can sign in
            as you.
          </p>
        </div>

        {/* 3-column word grid */}
        <div
          data-testid="passphrase-grid"
          className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/50 p-4"
        >
          {words.map((word, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded border bg-background px-2 py-1"
            >
              <span className="w-6 shrink-0 text-right font-mono text-xs text-muted-foreground">
                {i + 1}.
              </span>
              <span className="font-mono text-sm">{word}</span>
            </div>
          ))}
        </div>

        {/* Acknowledge checkbox */}
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            data-testid="passphrase-saved-checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
          />
          <span className="text-sm text-muted-foreground">
            I have saved my passphrase in a secure location and understand that
            it cannot be recovered if lost.
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
