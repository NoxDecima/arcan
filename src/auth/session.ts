import type { Account } from "jazz-tools";

/**
 * Derive a stable per-session fingerprint from the current Jazz session.
 *
 * ## How it works
 *
 * Jazz tracks each device session with a `SessionID` — a string of the form:
 *   `${accountID}_session_z${base58_random_nonce}`
 *
 * This ID is created once per node startup and stored in local storage so
 * that the same device gets the same session ID across page reloads (until
 * local storage is cleared or the user logs out).
 *
 * `me.$jazz.sessionID` is set by `AccountJazzApi` when `isLocalNodeOwner`
 * is true (i.e. this account owns the local Jazz node — always the case for
 * the currently signed-in user). The value comes directly from
 * `localNode.currentSessionID`.
 *
 * ## Why not crypto.randomUUID()?
 *
 * `crypto.randomUUID()` generates a new UUID every time the account migration
 * runs, which happens on every app start. This means the device record's
 * `sessionFingerprint` would change on every reload — defeating the purpose
 * of device tracking.
 *
 * The Jazz `SessionID` is stable across page reloads for the same device +
 * account combination, making it suitable as a session fingerprint.
 *
 * @param account - A loaded Jazz account (the `me` value from useAccount)
 * @returns A non-empty string that is stable for the current session
 * @throws Error if called on an account that is not the local node owner
 *         (e.g. a remote account loaded via useCoState — not me)
 */
export function getCurrentSessionFingerprint(account: Account): string {
  const sessionID = account.$jazz.sessionID;
  if (!sessionID) {
    throw new Error(
      "getCurrentSessionFingerprint: account does not own the local Jazz node. " +
        "Pass the current user's account (me), not a remote account.",
    );
  }
  return sessionID;
}
