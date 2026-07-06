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
 * Owns the challenge logic: three distinct indices (1-based display,
 * 0-based internally) are chosen once via useMemo and remain stable for
 * the component lifetime. Each input is validated case-insensitively and
 * trimmed. The "Continue" button is disabled until all three match.
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
    <div className="h-screen w-screen flex flex-col">
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
