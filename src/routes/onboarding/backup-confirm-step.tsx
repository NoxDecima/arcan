import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

interface BackupConfirmStepProps {
  phrase: string;
  onBack: () => void;
  onConfirmed: () => void;
}

/**
 * BackupConfirmStep: challenges the user to type three random words from their
 * recovery code to confirm they saved it correctly.
 *
 * Three distinct indices (1-based display, 0-based internally) are chosen once
 * via useMemo and remain stable for the lifetime of the component. Each input
 * is validated case-insensitively and trimmed. The "Confirm" button is disabled
 * until all three match.
 *
 * Note on data-testid attributes: testids still say "confirm-word-N" and
 * "confirm-passphrase-btn" for Phase C e2e compatibility.
 */
export function BackupConfirmStep({
  phrase,
  onBack,
  onConfirmed,
}: BackupConfirmStepProps) {
  const words = useMemo(() => phrase.trim().split(/\s+/), [phrase]);

  // Pick three distinct indices, sorted ascending, generated once per mount.
  const challengeIndices = useMemo<[number, number, number]>(() => {
    const picked: number[] = [];
    while (picked.length < 3) {
      const idx = Math.floor(Math.random() * words.length);
      if (!picked.includes(idx)) picked.push(idx);
    }
    picked.sort((a, b) => a - b);
    return picked as [number, number, number];
  }, [words.length]);

  const [inputs, setInputs] = useState(["", "", ""]);

  function setInput(slot: number, value: string) {
    setInputs((prev) => {
      const next = [...prev];
      next[slot] = value;
      return next;
    });
  }

  const allCorrect = challengeIndices.every(
    (wordIdx, slot) =>
      inputs[slot].trim().toLowerCase() === words[wordIdx].toLowerCase(),
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            Confirm your recovery code
          </h1>
          <p className="text-muted-foreground">
            Type the words at the positions shown below to confirm you have
            recorded your recovery code correctly.
          </p>
        </div>

        {/* Three challenge inputs */}
        <div className="space-y-4">
          {challengeIndices.map((wordIdx, slot) => (
            <div key={slot} className="space-y-1">
              <label
                htmlFor={`confirm-word-${slot}`}
                className="text-sm font-medium"
              >
                Word {wordIdx + 1}
              </label>
              <input
                id={`confirm-word-${slot}`}
                data-testid={`confirm-word-${slot}`}
                type="text"
                value={inputs[slot]}
                onChange={(e) => setInput(slot, e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={`Word ${wordIdx + 1}`}
              />
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button
            data-testid="confirm-passphrase-btn"
            disabled={!allCorrect}
            onClick={onConfirmed}
            className="flex-1"
          >
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}
