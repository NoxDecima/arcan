import { base58 } from "@scure/base";
import type { Account } from "jazz-tools";

/**
 * Extract the Ed25519 signing public key of the caller's OWN account as a
 * 64-char lowercase hex string.
 *
 * ## OWN account ONLY — do NOT call this on foreign accounts
 *
 * The access path is NODE-derived, not account-derived:
 *   me.$jazz.localNode.getCurrentAgent().currentSignerID()
 *
 * `getCurrentAgent()` returns the agent of the ACTIVE SESSION — i.e. whoever
 * loaded the value. Called on a foreign account (loaded with `loadAs: me`),
 * it silently returns MY signing key, not theirs. For foreign accounts use
 * {@link getForeignAccountPubkeyHex}, which derives from the target
 * account's own identity.
 *
 * ## How it works
 *
 * Jazz/cojson represents the signing public key as a `SignerID` string with
 * the format `signer_z${base58_encoded_pubkey}`. The base58 payload decodes
 * to the raw 32-byte Ed25519 public key.
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
 * @param account - The caller's own loaded Jazz account (the `me` value from
 *   useAccount) — never a foreign account
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
 * Extract the Ed25519 signing public key of ANY loaded account — including
 * foreign accounts loaded with `loadAs: me` — as a 64-char lowercase hex
 * string, derived from the TARGET account's own identity.
 *
 * Unlike {@link getAccountPubkeyHex} (node-derived, own-account only), this
 * reads the agent ID stored in the account CoValue itself, so it is correct
 * for TOFU fingerprint pinning of counterparts (C1, Task-5 review).
 *
 * Access path (verified against the installed typings):
 *  - `account.$jazz: AccountJazzApi` exposes `raw: RawAccount`
 *    (jazz-tools/dist/tools/coValues/account.d.ts lines 19 + 96).
 *  - `RawAccount.currentAgentID(): AgentID`
 *    (cojson/dist/coValues/account.d.ts:17) — read from the account's own
 *    CoValue content, i.e. the target's identity, NOT the ambient session.
 *  - `AgentID` is the template `` `sealer_z${string}/signer_z${string}` ``
 *    (cojson/dist/ids.d.ts:15).
 *  - `LocalNode.crypto: CryptoProvider` (cojson/dist/localNode.d.ts:28) — a
 *    stateless helper, so taking it from the caller's node is safe.
 *  - `CryptoProvider.getAgentSignerID(agentId): SignerID`
 *    (cojson/dist/crypto/crypto.d.ts:33) — extracts the `signer_z…` half.
 *
 * @param account - Any loaded Jazz account (own or foreign)
 * @returns 64-character lowercase hex string (32 bytes of Ed25519 pubkey)
 */
export function getForeignAccountPubkeyHex(account: Account): string {
  const agentID = account.$jazz.raw.currentAgentID();
  const signerID = account.$jazz.localNode.crypto.getAgentSignerID(agentID);
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
