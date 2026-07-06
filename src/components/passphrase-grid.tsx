import { useState } from "react";
import { PButton } from "@/ui/kit";

interface PassphraseGridProps {
  phrase: string;
  /** 3-column compact layout (legacy prop — both default and compact now use 3-col to match
   *  design/hf-flows.jsx#ScRecovery grid metrics; kept for Rung-3 modal compat). */
  compact?: boolean;
  /** Render a "copy code" button under the grid. */
  withCopyButton?: boolean;
  className?: string;
}

type CopyState = "idle" | "copied" | "error";

/**
 * 24-word recovery-code grid. Restyled to hf-flows.jsx#ScRecovery (lines 119-121) metrics:
 * 3-column, rounded-r-5 (14px) border bg-panel, 9px index / 10.5px word, both font-mono.
 * Used by:
 *  - onboarding backup-display step
 *  - settings view-recovery-code modal
 *
 * testids: passphrase-grid, passphrase-word-{i+1}, passphrase-copy-btn (preserved verbatim).
 */
export function PassphraseGrid({
  phrase,
  compact: _compact = false,
  withCopyButton = false,
  className,
}: PassphraseGridProps) {
  const [copy, setCopy] = useState<CopyState>("idle");
  const words = phrase.trim().split(/\s+/);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(words.join(" "));
      setCopy("copied");
      setTimeout(() => setCopy("idle"), 2000);
    } catch {
      setCopy("error");
      setTimeout(() => setCopy("idle"), 3000);
    }
  }

  const copyLabel = copy === "copied" ? "Copied" : copy === "error" ? "Copy failed" : "copy code";

  return (
    <div className="flex flex-col gap-3">
      <div
        data-testid="passphrase-grid"
        className={[
          // hf-flows:119 — 3-col grid, r-5 (14px=radius+2), border bg-panel p-[13px]
          "rounded-r-5 border border-hairline bg-panel p-[13px]",
          "grid grid-cols-3 gap-x-[10px] gap-y-1.5",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {words.map((w, i) => (
          <div
            key={i}
            data-testid={`passphrase-word-${i + 1}`}
            className="flex gap-[6px] font-mono"
          >
            {/* index: 500 9px/1.3 mono dim w-[13px] (hf-flows:120) */}
            <span className="font-medium text-ui-caps leading-[1.3] text-dim w-[13px] shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            {/* word: 500 10.5px/1.3 mono text (hf-flows:120) */}
            <span className="font-medium text-ui-sub leading-[1.3] text-text">
              {w}
            </span>
          </div>
        ))}
      </div>
      {withCopyButton && (
        // hf-flows:122 — full-width outline copy button replacing shadcn Button
        <PButton
          full
          label={copyLabel}
          icon="copy"
          data-testid="passphrase-copy-btn"
          onClick={handleCopy}
        />
      )}
    </div>
  );
}
