import { co, z } from "jazz-tools";

/**
 * EphemeralPairing: a short-lived CoValue used to bootstrap multi-device
 * account pairing via QR code or pasted URL.
 *
 * Protocol overview (spec §4.1):
 * 1. Initiator creates an EphemeralPairing CoValue in a one-shot Group
 *    (initiator as admin, ephemeral agent as writerInvite).
 * 2. The invite URL fragment carries the ephemeral agent secret.
 * 3. Responder authenticates as the ephemeral agent to gain read access,
 *    then writes its response fields (`responderPubkey`,
 *    `wrappedAccountSecret`, `responderSessionFingerprint`).
 * 4. Initiator reads the response, verifies, and may grant the new device
 *    access to account data.
 *
 * Lifecycle: EphemeralPairing CoValues expire (`expiresAt`) and should be
 * discarded after successful pairing or on timeout. They are never reused.
 *
 * Note: the `consumed` field was dropped from the spec revision — the
 * expiry + wrappedAccountSecret presence is sufficient to detect completion.
 */
export const EphemeralPairing = co.map({
  /** Ed25519 pubkey hex (64 chars) of the initiating account */
  initiatorPubkey: z.string(),
  /** Jazz account ID of the initiating account (e.g. "co_z...") */
  initiatorAccountID: z.string(),
  /** Display name of the initiating account shown to the responder */
  initiatorDisplayName: z.string(),
  /** UTC timestamp when this pairing CoValue was created */
  createdAt: z.date(),
  /** UTC timestamp after which this pairing is considered expired */
  expiresAt: z.date(),
  /** Ed25519 pubkey hex (64 chars) of the responding device; set by responder */
  responderPubkey: z.string().optional(),
  /**
   * Wrapped (sealed) account secret that grants the new device access;
   * set by the initiator after verifying the responder's pubkey.
   * Format: opaque string (base64-encoded sealed box).
   */
  wrappedAccountSecret: z.string().optional(),
  /** Session fingerprint of the responding device; set by responder */
  responderSessionFingerprint: z.string().optional(),
});
