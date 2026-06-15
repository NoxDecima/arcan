import { useMemo, useState } from "react";
import {
  AuthSurface,
  Steps,
  AuthTitle,
  AuthSub,
} from "@/components/auth-surface";

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
    <AuthSurface forceDark>
      <Steps n={3} />
      <AuthTitle>confirm your code</AuthTitle>
      <AuthSub>type the words shown to prove you saved it</AuthSub>

      <div className="flex flex-col gap-3">
        {challengeIndices.map((wordIdx, slot) => (
          <label key={slot} className="flex flex-col gap-[6px]">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-dim">
              word #{String(wordIdx + 1).padStart(2, "0")}
            </span>
            <input
              id={`confirm-word-${slot}`}
              data-testid={`confirm-word-${slot}`}
              type="text"
              value={inputs[slot]}
              onChange={(e) => setInput(slot, e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={`type word ${wordIdx + 1}`}
              className="h-[38px] rounded-r-3 border border-hairline bg-panel px-3 font-mono text-[12px] text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent"
            />
          </label>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-10 flex-1 rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold"
        >
          back
        </button>
        <button
          type="button"
          data-testid="confirm-passphrase-btn"
          disabled={!allCorrect}
          onClick={onConfirmed}
          className="h-10 flex-1 rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold disabled:opacity-50"
        >
          continue →
        </button>
      </div>
      <div className="text-center text-[10.5px] text-dim">step 3 of 4</div>
    </AuthSurface>
  );
}
