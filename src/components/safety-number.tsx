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
  const formatted = formatSafetyNumber(fingerprintHex);

  return (
    <code
      data-testid="safety-number"
      className="block font-mono text-sm bg-panel-2 rounded px-3 py-2 tracking-widest text-text-2 break-all"
    >
      {formatted}
    </code>
  );
}
