import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";

const PURPOSE = "jazz-messanger:recovery-reset";

/**
 * recoveryProof: deterministic HMAC-SHA256(seed, PURPOSE) → base64.
 *
 * Stored on the auth server at sign-up time and compared in constant time
 * during reset-with-recovery to prove the requester knows the seed.
 *
 * Same seed → same proof. Used as the server-side verifier; the seed itself
 * never leaves the client.
 */
export async function recoveryProof(seed: Uint8Array): Promise<string> {
  const mac = hmac(sha256, seed, new TextEncoder().encode(PURPOSE));
  return btoa(String.fromCharCode(...mac));
}
