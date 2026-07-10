import { formatSafetyNumber } from "@/auth/fingerprint";
import { useToast } from "@/components/toast";
import { Icon, tapClass } from "@/ui/kit";

/**
 * SafetyNumber: renders a formatted safety number from a 64-char hex string,
 * with an adjacent copy button that confirms via toast.
 *
 * Uses formatSafetyNumber() from auth/fingerprint to produce 12 space-separated
 * 4-digit groups for out-of-band identity verification (Signal-style).
 */
interface SafetyNumberProps {
  fingerprintHex: string;
}

export function SafetyNumber({ fingerprintHex }: SafetyNumberProps) {
  // useToast must be called unconditionally (hooks must not be inside branches).
  const toast = useToast();

  // Defensive: formatSafetyNumber throws on malformed input (e.g. wrong
  // length). A throw here unwinds the React render and shows a blank
  // page to users. Render a clear "unverifiable" placeholder instead so
  // the surrounding page stays rendered. Caught during Unit 8 Phase C-2
  // (NEW-005) — a synthetic contact with a non-64-char fingerprint
  // blanked /contacts/:contactID entirely.
  let formatted: string;
  try {
    formatted = formatSafetyNumber(fingerprintHex);
  } catch {
    return (
      <code
        data-testid="safety-number-invalid"
        className="block font-mono text-sm bg-panel-2 rounded px-3 py-2 text-dim italic"
      >
        unavailable — fingerprint not recorded for this contact
      </code>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <code
        data-testid="safety-number"
        className="block flex-1 font-mono text-sm bg-panel-2 rounded px-3 py-2 tracking-widest text-text-2 break-all"
      >
        {formatted}
      </code>
      <button
        type="button"
        className={`${tapClass} shrink-0 mt-2`}
        aria-label="copy security code"
        data-testid="safety-number-copy"
        onClick={() => {
          void navigator.clipboard.writeText(formatted).then(() =>
            toast({ icon: "check", text: "security code copied", tone: "success" }),
          );
        }}
      >
        <Icon d="copy" size={15} className="text-dim" />
      </button>
    </div>
  );
}
