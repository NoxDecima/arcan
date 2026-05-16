import { base58 } from "@scure/base";
import type { Account } from "jazz-tools";

/**
 * Extract the Ed25519 signing public key from a Jazz account as a 64-char
 * lowercase hex string.
 *
 * ## How it works
 *
 * Jazz/cojson represents the signing public key as a `SignerID` string with
 * the format `signer_z${base58_encoded_pubkey}`. The base58 payload decodes
 * to the raw 32-byte Ed25519 public key.
 *
 * Access path:
 *   me.$jazz.localNode.getCurrentAgent().currentSignerID()
 *
 * `localNode` is exposed by `CoValueJazzApi` (the base of `AccountJazzApi`).
 * `getCurrentAgent()` returns the `ControlledAccountOrAgent` for the active
 * session, which always has `currentSignerID()`.
 *
 * ## Why not use me.$jazz.id (account ID)?
 *
 * The account ID (`co_z${base58}`) is a BLAKE3 hash of the initial agent
 * secret — it is NOT the raw Ed25519 public key. Only `currentSignerID()`
 * reliably exposes the actual Ed25519 public key.
 *
 * @param account - A loaded Jazz account (the `me` value from useAccount)
 * @returns 64-character lowercase hex string (32 bytes of Ed25519 pubkey)
 */
export function getAccountPubkeyHex(account: Account): string {
  const agent = account.$jazz.localNode.getCurrentAgent();
  const signerID = agent.currentSignerID();
  // signerID is "signer_z${base58_encoded_32_byte_pubkey}"
  const base58Part = signerID.slice("signer_z".length);
  const pubkeyBytes = base58.decode(base58Part);
  return normalizeToHex64(pubkeyBytes);
}

/**
 * Convert a Uint8Array to a lowercase hex string padded/truncated to 64 chars
 * (32 bytes). Ed25519 public keys are exactly 32 bytes so padding/truncation
 * should never be needed in practice — this guard is here for safety.
 */
export function normalizeToHex64(bytes: Uint8Array): string {
  const full = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return full.padEnd(64, "0").slice(0, 64);
}
