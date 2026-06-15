import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PassphraseGridProps {
  phrase: string;
  /** 3-column compact layout (used by the mobile recovery-code modal). Default 4-column. */
  compact?: boolean;
  /** Render a "copy code" button under the grid. */
  withCopyButton?: boolean;
  className?: string;
}

type CopyState = "idle" | "copied" | "error";

/**
 * 24-word recovery-code grid. Index numbers ("01" … "24") in dim color,
 * words in font-mono. Used by:
 *  - onboarding backup-display step
 *  - settings view-recovery-code modal
 *
 * Matches design/hf-flows.jsx#ScRecovery (lines 106–125).
 */
export function PassphraseGrid({
  phrase,
  compact = false,
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

  const copyLabel = copy === "copied" ? "Copied" : copy === "error" ? "Copy failed" : "Copy code";

  return (
    <div className="flex flex-col gap-3">
      <div
        data-testid="passphrase-grid"
        className={cn(
          "rounded-r-3 border border-hairline bg-panel-2 p-3",
          "grid gap-x-3 gap-y-1.5",
          compact ? "grid-cols-3" : "grid-cols-4",
          className,
        )}
      >
        {words.map((w, i) => (
          <div
            key={i}
            data-testid={`passphrase-word-${i + 1}`}
            className="flex items-baseline gap-1.5 font-mono"
          >
            <span className="w-5 shrink-0 text-right text-[10px] text-dim">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-sm text-text">{w}</span>
          </div>
        ))}
      </div>
      {withCopyButton && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="passphrase-copy-btn"
            onClick={handleCopy}
            aria-live="polite"
          >
            {copyLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
