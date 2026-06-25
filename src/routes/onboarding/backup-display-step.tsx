import { useState } from "react";
import { AuthSurface, Steps, AuthTitle } from "@/components/auth-surface";
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
 *
 * The 24-word grid + copy button are delegated to <PassphraseGrid>, the
 * shared primitive also consumed by the Settings → view-recovery-code modal.
 */
export function BackupDisplayStep({
  phrase,
  onBack,
  onContinue,
}: BackupDisplayStepProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <AuthSurface forceDark w={368} tall>
      <Steps n={2} />
      <AuthTitle>save your recovery code</AuthTitle>

      {/* Extra vertical breathing room for the dense recovery-code step
          (1.3/1.4/1.5-A). The shared AuthSurface column gap is 11px (tall
          mode) — too tight here, so this block uses gap-5. */}
      <div data-roomy="recovery" className="flex flex-col gap-5">
        {/* Warning callout — same warn-amber palette as the design's
            recovery scene (hf-flows.jsx lines 108-118). */}
        <div className="flex items-start gap-2 rounded-r-3 border border-amber/40 bg-amber/10 px-3 py-[9px]">
          <span className="font-mono text-[12px] font-semibold text-amber leading-snug">
            ⚠
          </span>
          <span className="text-[10.5px] leading-relaxed text-amber">
            this 24-word code is the only way to recover your account. nox
            cannot reset it.
          </span>
        </div>

        <PassphraseGrid phrase={phrase} withCopyButton />

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
