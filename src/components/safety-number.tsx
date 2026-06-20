import { formatSafetyNumber } from "@/auth/fingerprint";

/**
 * SafetyNumber: renders a formatted safety number from a 64-char hex string.
 *
 * Uses formatSafetyNumber() from auth/fingerprint to produce 12 space-separated
 * 4-digit groups for out-of-band identity verification (Signal-style).
 */
interface SafetyNumberProps {
  fingerprintHex: string;
}

export function SafetyNumber({ fingerprintHex }: SafetyNumberProps) {
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
    <code
      data-testid="safety-number"
      className="block font-mono text-sm bg-panel-2 rounded px-3 py-2 tracking-widest text-text-2 break-all"
    >
      {formatted}
    </code>
  );
}
