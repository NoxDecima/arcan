import { useAccount } from "jazz-tools/react";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { SafetyNumber } from "@/components/safety-number";

/**
 * Derives a 64-char hex string from a Jazz account ID for use with
 * formatSafetyNumber().
 *
 * NOTE: This is a Slice 1 placeholder. The account ID (e.g. "co_z123...")
 * is not a 32-byte Ed25519 public key — it is an opaque identifier. In Slice 2
 * the real Ed25519 pubkey will be extracted from the account's key material.
 * For now we extract hex characters from the ID, pad/truncate to 64 chars to
 * satisfy the formatSafetyNumber() input contract.
 */
function deriveHexFromAccountId(accountId: string): string {
  const hexOnly = accountId.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  // Pad with zeros if shorter than 64 chars, truncate if longer.
  return hexOnly.padEnd(64, "0").slice(0, 64);
}

/**
 * AccountSection: shows the user's safety number derived from their account ID.
 */
export function AccountSection() {
  const me = useAccount(JazzMessangerAccount);

  if (!me.$isLoaded) {
    return (
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-2">Account</h2>
        <p className="text-sm text-gray-400">Loading…</p>
      </section>
    );
  }

  const fingerprintHex = deriveHexFromAccountId(me.$jazz.id);

  return (
    <section>
      <h2 className="text-base font-semibold text-gray-800 mb-2">Account</h2>
      <div className="bg-white rounded border border-gray-200 px-4 py-3 flex flex-col gap-2">
        <p className="text-sm text-gray-600">Your safety number:</p>
        <SafetyNumber fingerprintHex={fingerprintHex} />
      </div>
    </section>
  );
}
