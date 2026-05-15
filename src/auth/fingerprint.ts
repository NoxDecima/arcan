import { blake3 } from "@noble/hashes/blake3";

/**
 * formatSafetyNumber(hex): converts a 32-byte Ed25519 public key (as a
 * 64-character hex string) into a human-readable 12-group safety number,
 * where each group is a zero-padded 4-digit decimal value.
 *
 * The output format is:
 *   "DDDD DDDD DDDD DDDD DDDD DDDD DDDD DDDD DDDD DDDD DDDD DDDD"
 *
 * Derivation:
 *   1. Parse the 64-char hex into 32 bytes.
 *   2. Hash with BLAKE3 (dkLen=24) to produce 24 bytes of output.
 *   3. Split into 12 × 2-byte big-endian groups.
 *   4. Each group is taken modulo 10000 and zero-padded to 4 digits.
 *
 * This is deterministic and collision-resistant for the purpose of
 * out-of-band identity verification ("safety numbers" in the Signal sense).
 *
 * @param hex - 64-character lowercase hex string (32-byte Ed25519 pubkey)
 * @returns  12 space-separated 4-digit groups, e.g. "1234 5678 0001 ..."
 * @throws   Error if hex is not exactly 64 characters
 */
export function formatSafetyNumber(hex: string): string {
  if (hex.length !== 64) {
    throw new Error(`Expected 64-char hex (32 bytes); got ${hex.length}`);
  }

  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  const digest = blake3(bytes, { dkLen: 24 });

  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    const v = (digest[i * 2] << 8) | digest[i * 2 + 1];
    const truncated = v % 10000;
    groups.push(truncated.toString().padStart(4, "0"));
  }

  return groups.join(" ");
}
