import { useState } from "react";
import { AuthSurface, Steps, AuthTitle } from "@/components/auth-surface";

type CopyState = "idle" | "copied" | "error";

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
 *
 * Note on data-testid attributes: the testids still say "passphrase-*" (rather
 * than "backup-*") for compatibility with Phase C e2e selectors. The user-
 * visible copy uses the new "recovery code" framing.
 */
export function BackupDisplayStep({
  phrase,
  onBack,
  onContinue,
}: BackupDisplayStepProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const words = phrase.trim().split(/\s+/);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(words.join(" "));
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 3000);
    }
  }

  const copyLabel =
    copyState === "copied"
      ? "copied to clipboard"
      : copyState === "error"
        ? "copy failed — copy manually"
        : "copy recovery code";

  return (
    <AuthSurface forceDark w={368} tall>
      <Steps n={2} />
      <AuthTitle>save your recovery code</AuthTitle>

      {/* Warning callout — same warn-amber palette as the design's
          recovery scene (hf-flows.jsx lines 108-118). */}
      <div className="flex items-start gap-2 rounded-r-3 border border-amber/40 bg-amber/10 px-3 py-[9px]">
        <span className="font-mono text-[12px] font-semibold text-amber leading-snug">
          ⚠
        </span>
        <span className="text-[10.5px] leading-relaxed text-amber">
          this 24-word code is the only way to recover your account. nox cannot
          reset it.
        </span>
      </div>

      {/* 3-column word grid */}
      <div
        data-testid="passphrase-grid"
        className="grid grid-cols-3 gap-x-[10px] gap-y-[6px] rounded-r-3 border border-hairline bg-panel p-[13px]"
      >
        {words.map((word, i) => (
          <div key={i} className="flex gap-[6px]">
            <span className="w-[13px] font-mono text-[9px] text-dim leading-snug">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="font-mono text-[10.5px] text-text leading-snug">
              {word}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        data-testid="passphrase-copy-btn"
        onClick={handleCopy}
        aria-live="polite"
        className="h-10 w-full rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold"
      >
        {copyLabel}
      </button>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          data-testid="passphrase-saved-checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-[2px] h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent)]"
        />
        <span className="text-[11px] text-text-2 leading-relaxed">
          i have saved my recovery code in a secure location and understand it
          cannot be recovered if lost.
        </span>
      </label>

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
          data-testid="passphrase-display-continue"
          disabled={!acknowledged}
          onClick={onContinue}
          className="h-10 flex-1 rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold disabled:opacity-50"
        >
          i've saved it →
        </button>
      </div>
      <div className="text-center text-[10.5px] text-dim">step 2 of 4</div>
    </AuthSurface>
  );
}
