import { useMemo, useState } from "react";
import { BackupConfirmScreen } from "@/ui/screens";
import type { WordChallengeField } from "@/ui/screens/onboarding-types";

interface BackupConfirmStepProps {
  phrase: string;
  onBack: () => void;
  onConfirmed: () => void;
}

/**
 * BackupConfirmStep: container for the backup-confirm onboarding step.
 * Delegates rendering to BackupConfirmScreen (Rung 2 presenter).
 *
 * Owns the challenge logic: the first three words are verified (feedback round 2).
 * Each input is validated case-insensitively and trimmed. The "Continue" button
 * is disabled until all three match.
 *
 * Note: testids remain "confirm-word-N" and "confirm-passphrase-btn"
 * for Phase C e2e compatibility.
 */
export function BackupConfirmStep({
  phrase,
  onBack,
  onConfirmed,
}: BackupConfirmStepProps) {
  const words = useMemo(() => phrase.trim().split(/\s+/), [phrase]);

  // Always verify the first three words (feedback round 2): retyping from
  // the saved copy is much easier when the words are consecutive from the
  // start, and BIP-39 entropy is uniform so the check is equally strong.
  const challengeIndices = useMemo<[number, number, number]>(() => [0, 1, 2], []);

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

  const fields: WordChallengeField[] = challengeIndices.map(
    (wordIdx, slot) => ({
      label: `word #${String(wordIdx + 1).padStart(2, "0")}`,
      value: inputs[slot],
      onChange: (v: string) => setInput(slot, v),
      placeholder: `type word ${wordIdx + 1}`,
      testId: `confirm-word-${slot}`,
    }),
  );

  return (
    <div className="h-app w-app flex flex-col">
      <BackupConfirmScreen
        sub="type the words shown to prove you saved it"
        fields={fields}
        onContinue={onConfirmed}
        onBack={onBack}
        continueDisabled={!allCorrect}
        continueTestId="confirm-passphrase-btn"
      />
    </div>
  );
}
