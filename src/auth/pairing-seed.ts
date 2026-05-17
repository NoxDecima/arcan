/**
 * pairing-seed: persists the 32-byte secretSeed to a dedicated localStorage
 * key that survives Jazz session refresh/reconnect events.
 *
 * Jazz's own `authSecretStorage` is rewritten by Jazz on session events and
 * does NOT reliably preserve the `secretSeed` field across reconnects. This
 * module keeps an independent copy so `wrapAccountSecretForResponder` can
 * read it on any subsequent QR pairing initiated from this device.
 *
 * Key: `jazz-messanger.pairing-seed-v1`
 * Value: base64url-encoded raw bytes (32 bytes for a standard secretSeed)
 */

const STORAGE_KEY = "jazz-messanger.pairing-seed-v1";

// ---------------------------------------------------------------------------
// Base64url helpers (no external dep — matches pairing.ts)
// ---------------------------------------------------------------------------

function toB64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const padded =
    s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist the secretSeed bytes to localStorage.
 *
 * Call this whenever you know the seed:
 *   - after `auth.registerNewAccount(...)` in profile-step.tsx
 *   - after `auth.logIn(...)` in restore-step.tsx
 *   - inside `claimAccountFromPairing` in pairing.ts (responder side)
 */
export function setPairingSeed(seedBytes: Uint8Array): void {
  localStorage.setItem(STORAGE_KEY, toB64url(seedBytes));
}

/**
 * Read the persisted secretSeed from localStorage.
 *
 * Returns `null` if nothing has been stored yet (e.g. first-ever session
 * before any login/registration completes).
 */
export function getPairingSeed(): Uint8Array | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return fromB64url(stored);
  } catch {
    // Corrupt data — treat as missing
    return null;
  }
}

/**
 * Remove the persisted seed (e.g. on explicit logout).
 */
export function clearPairingSeed(): void {
  localStorage.removeItem(STORAGE_KEY);
}
